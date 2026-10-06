import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  CaptainStatus,
  DocumentStatus,
  DocumentType,
  OrderStatus,
  PayoutDestination,
  Prisma,
  UserRole,
  VehicleType,
  WalletEntryType,
  WithdrawalStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { availableToWithdraw, withdrawalRejection, MIN_WITHDRAWAL } from './wallet-math';
import { AuditService } from '../audit/audit.module';
import { PrismaService } from '../prisma/prisma.service';
import { FaceService } from '../face/face.service';
import { RedisService } from '../redis/redis.service';
import type { AuthUser } from '../common';
import {
  ComplianceFilter,
  ComplianceQueryDto,
  CreatePayoutMethodDto,
  CreateWithdrawalDto,
  EarningsQueryDto,
  EarningsRange,
  ListCaptainsDto,
  ListWithdrawalsDto,
  PaginationDto,
  ReviewDocumentDto,
  UpdateCaptainDto,
  UploadDocumentDto,
} from './captains.dto';

// ────────────────────────────────────────────────────────────
// ثوابت
// ────────────────────────────────────────────────────────────

/** الخمس وثائق اللي بتتعرض في شاشة التفعيل — الترتيب ده هو ترتيب العرض. */
const DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.IDENTITY,
  DocumentType.LICENSE,
  DocumentType.VEHICLE_REG,
  DocumentType.INSURANCE,
  DocumentType.PHOTO,
];

/**
 * الوثائق اللي بدونها الكابتن ما ينفعش يستلم طلبات (اشتراطات هيئة النقل).
 * الصورة الشخصية مش منها — بتأثر على الملف الشخصي بس.
 */
const REQUIRED_DOCUMENT_TYPES: readonly DocumentType[] = [
  DocumentType.IDENTITY,
  DocumentType.LICENSE,
  DocumentType.VEHICLE_REG,
  DocumentType.INSURANCE,
];

/** وثيقة «قربت تنتهي» = باقي لها ٣٠ يوم أو أقل. */
const EXPIRING_SOON_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** أسماء الأيام بترتيب `Date.getDay()` — ٠ = الأحد. */
const WEEKDAY_LABELS_AR = [
  'الأحد',
  'الإثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
] as const;

// ────────────────────────────────────────────────────────────
// أشكال الردود — كل حقول Decimal بترجع أرقام JS، والتواريخ ISO strings
// ────────────────────────────────────────────────────────────

/** حالة الوثيقة زي ما الكابتن بيشوفها — بنضيف MISSING للأنواع اللي لسه مترفعتش. */
export type DocumentViewStatus = DocumentStatus | 'MISSING';

export interface CaptainDocumentView {
  /** null لما الوثيقة لسه مترفعتش. */
  id: string | null;
  type: DocumentType;
  status: DocumentViewStatus;
  fileUrl: string | null;
  rejectReason: string | null;
  expiresAt: string | null;
  /** موجب = باقي أيام · سالب = منتهية من كام يوم · null = مافيش تاريخ انتهاء. */
  daysUntilExpiry: number | null;
  reviewedAt: string | null;
  updatedAt: string | null;
  /** إلزامية للإسناد؟ (الصورة الشخصية لأ). */
  isRequired: boolean;
}

export interface DocumentsSummary {
  approved: number;
  total: number;
  allApproved: boolean;
}

export interface CaptainProfileView {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  avatarUrl: string | null;
  /** مقنّع — آخر ٤ أرقام بس. */
  nationalId: string;
  vehicleType: VehicleType;
  plateNumber: string | null;
  status: CaptainStatus;
  isVerified: boolean;
  rating: number;
  ratingCount: number;
  walletBalance: number;
  totalDeliveries: number;
  /**
   * نسبة قبول العروض — بتتحسب من `trip_offers` (المقبولة ÷ اللي اتردّ عليها).
   * null لو الكابتن لسه ما اتعرض عليه أي عرض — أحسن من ٠٪ الخادعة.
   */
  acceptanceRate: number | null;
  joinedYear: number;
  documentsSummary: DocumentsSummary;
  /** شركة الأسطول التابع لها — null لو مستقل. لو تابع لشركة، أرباحه بتيجي من
   *  توزيعات الشركة مش من محفظة المنصة. */
  companyId: string | null;
  companyName: string | null;
}

export interface CaptainListItemView {
  id: string;
  fullName: string;
  phone: string;
  vehicleType: VehicleType;
  plateNumber: string | null;
  status: CaptainStatus;
  isVerified: boolean;
  rating: number;
  ratingCount: number;
  walletBalance: number;
  totalDeliveries: number;
  /** نسبة قبول العروض — null لو لسه ما اتعرض عليه. */
  acceptanceRate: number | null;
  /** شركة الأسطول التابع لها — null لو مستقل. */
  companyId: string | null;
  companyName: string | null;
  documentsSummary: DocumentsSummary;
}

export interface EarningsDayView {
  /** YYYY-MM-DD بالتوقيت المحلي للسيرفر. */
  date: string;
  label: string;
  total: number;
  trips: number;
}

export interface EarningsView {
  range: { from: string; to: string };
  total: number;
  tripCount: number;
  averagePerTrip: number;
  dailySeries: EarningsDayView[];
  breakdown: { tripPayouts: number; tips: number; bonuses: number };
}

export interface PayoutMethodView {
  id: string;
  destination: PayoutDestination;
  label: string;
  /** مقنّع دايماً — أول ٤ وآخر ٤ بس. البيانات الكاملة ما بتخرجش من الـ API. */
  accountRef: string;
  isDefault: boolean;
  createdAt: string;
}

export interface WalletView {
  balance: number;
  pendingWithdrawals: number;
  availableToWithdraw: number;
  payoutMethods: PayoutMethodView[];
}

export interface ShiftView {
  id: string;
  startedAt: string;
  endedAt: string | null;
  isActive: boolean;
  /** مدة الوردية بالدقايق — للمفتوحة لحد دلوقتي. */
  minutes: number;
  tripCount: number;
  earnings: number;
}

export interface ShiftsView {
  range: { from: string; to: string };
  /** مجموع دقايق الاتصال في الفترة. */
  onlineMinutes: number;
  trips: number;
  earnings: number;
  activeShift: ShiftView | null;
  shifts: ShiftView[];
}

export interface WalletTransactionView {
  id: string;
  type: WalletEntryType;
  amount: number;
  balanceAfter: number;
  descriptionAr: string;
  orderId: string | null;
  withdrawalId: string | null;
  createdAt: string;
}

export interface WithdrawalView {
  id: string;
  amount: number;
  status: WithdrawalStatus;
  destination: PayoutDestination;
  /** آخر ٤ أرقام مقنّعة — «•••• 7519». */
  destinationRef: string;
  rejectReason: string | null;
  reviewedAt: string | null;
  transferredAt: string | null;
  createdAt: string;
}

export interface AdminWithdrawalView extends WithdrawalView {
  captainId: string;
  captainName: string;
  captainPhone: string;
}

export interface ComplianceRowView {
  captainId: string;
  fullName: string;
  phone: string;
  status: CaptainStatus;
  isVerified: boolean;
  documents: CaptainDocumentView[];
  /** false لو أي وثيقة إلزامية ناقصة أو منتهية أو مرفوضة أو لسه تحت المراجعة. */
  dispatchAllowed: boolean;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

type DocumentRow = Prisma.CaptainDocumentGetPayload<Record<string, never>>;

type CaptainWithUser = Prisma.CaptainGetPayload<{ include: { user: true; company: { select: { nameAr: true } } } }>;

@Injectable()
export class CaptainsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly face: FaceService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  /**
   * فيه حالة معروفة إن التوكن بييجي من غير `captainId` (مستخدم بدور CAPTAIN
   * من غير صف Captain مربوط). لو سبناها Prisma هتتجاهل الشرط `undefined`
   * وترجّع بيانات كباتن تانيين — فبنرفض الطلب صراحةً.
   */
  requireCaptainId(user: AuthUser): string {
    if (!user.captainId) throw new ForbiddenException('الجلسة غير مرتبطة بحساب كابتن');
    return user.captainId;
  }

  // ────────────────────────────────────────────────────────────
  // الملف الشخصي
  // ────────────────────────────────────────────────────────────

  async getProfile(captainId: string): Promise<CaptainProfileView> {
    // مهم: `isVerified` بوابة التوزيع (dispatch.service.ts بيفلتر بيها)، فأي قراءة
    // للبروفايل بتعيد حسابها من الوثائق. من غير كده كابتن مالوش وثائق ممكن يفضل
    // «موثّق» من بيانات قديمة وياخد طلبات.
    await this.prisma.$transaction((tx) => this.syncVerification(tx, captainId));

    const captain = await this.prisma.captain.findUnique({
      where: { id: captainId },
      include: { user: true, documents: true, company: { select: { nameAr: true } } },
    });
    if (!captain) throw new NotFoundException('الكابتن غير موجود');

    const totalDeliveries = await this.prisma.order.count({
      where: { captainId, status: OrderStatus.DELIVERED },
    });

    return this.toProfileView(captain, captain.documents, totalDeliveries, await this.acceptanceRate(captainId));
  }

  /**
   * نسبة قبول العروض = المقبولة ÷ (المقبولة + المرفوضة + اللي عدّت مهلتها).
   * العروض اللي لسه OFFERED مش داخلة (لسه ما ردّش). null لو مفيش عروض خالص —
   * أحسن من ٠٪ اللي بتبان كأنه سيء وهو مجرد كابتن جديد.
   */
  private async acceptanceRate(captainId: string): Promise<number | null> {
    const grouped = await this.prisma.tripOffer.groupBy({
      by: ['status'],
      where: { captainId, status: { not: 'OFFERED' } },
      _count: { _all: true },
    });
    const total = grouped.reduce((s, g) => s + g._count._all, 0);
    if (!total) return null;
    const accepted = grouped.find((g) => g.status === 'ACCEPTED')?._count._all ?? 0;
    return Number(((accepted / total) * 100).toFixed(1));
  }

  async updateProfile(captainId: string, userId: string, dto: UpdateCaptainDto): Promise<CaptainProfileView> {
    const captain = await this.prisma.captain.findUnique({ where: { id: captainId }, select: { id: true } });
    if (!captain) throw new NotFoundException('الكابتن غير موجود');

    const captainData: Prisma.CaptainUpdateInput = {
      ...(dto.vehicleType !== undefined ? { vehicleType: dto.vehicleType } : {}),
      ...(dto.plateNumber !== undefined ? { plateNumber: dto.plateNumber } : {}),
    };

    await this.prisma.$transaction([
      this.prisma.captain.update({ where: { id: captainId }, data: captainData }),
      // الصورة الشخصية على User مش على Captain — الرابط بييجي من POST /api/uploads
      this.prisma.user.update({
        where: { id: userId },
        data: { ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}) },
      }),
    ]);

    return this.getProfile(captainId);
  }

  // ────────────────────────────────────────────────────────────
  // الوثائق
  // ────────────────────────────────────────────────────────────

  /**
   * بترجّع الخمس أنواع دايماً — الناقص منها بيرجع `MISSING` عشان التطبيق
   * يرسم القايمة كاملة من غير ما يخترع أنواع من عنده.
   * وكمان بنثبّت انتهاء الصلاحية في الداتابيز هنا (قراءة بتصلّح الحالة).
   */
  async listMyDocuments(captainId: string): Promise<CaptainDocumentView[]> {
    const now = new Date();
    const stored = await this.prisma.captainDocument.findMany({ where: { captainId } });

    // وثيقة معتمدة وعدّى تاريخها = منتهية. بنكتبها مرة واحدة بدل ما نفضل نحسبها.
    const justExpired = stored.filter(
      (d) => d.status === DocumentStatus.APPROVED && d.expiresAt !== null && d.expiresAt < now,
    );
    if (justExpired.length) {
      await this.prisma.captainDocument.updateMany({
        where: { id: { in: justExpired.map((d) => d.id) } },
        data: { status: DocumentStatus.EXPIRED },
      });
      // وثيقة إلزامية انتهت ⇐ الكابتن مايفضلش «موثّق».
      await this.syncVerification(this.prisma, captainId);
    }

    return this.buildDocumentMatrix(stored, now);
  }

  /**
   * رفع/استبدال وثيقة. أي رفع جديد بيرجّع الحالة PENDING ويمسح سبب الرفض —
   * ما ينفعش الكابتن يفضل «مرفوض» وهو رفع صورة جديدة.
   */
  async upsertMyDocument(captainId: string, dto: UploadDocumentDto): Promise<CaptainDocumentView> {
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

    const document = await this.prisma.captainDocument.upsert({
      where: { captainId_type: { captainId, type: dto.type } },
      create: {
        captainId,
        type: dto.type,
        fileUrl: dto.fileUrl,
        status: DocumentStatus.PENDING,
        expiresAt,
      },
      update: {
        fileUrl: dto.fileUrl,
        status: DocumentStatus.PENDING,
        rejectReason: null,
        reviewedAt: null,
        reviewedById: null,
        expiresAt,
      },
    });

    // الوثيقة رجعت تحت المراجعة، فالتحقق لازم يتراجع لحد ما الأدمن يعتمدها تاني.
    await this.syncVerification(this.prisma, captainId);

    return this.toDocumentView(dto.type, document, new Date());
  }

  // ────────────────────────────────────────────────────────────
  // الأرباح
  // ────────────────────────────────────────────────────────────

  /**
   * أرباح فعلية من الطلبات المسلّمة + الإكراميات والمكافآت من المحفظة.
   * الإكراميات والمكافآت هيفضلوا صفر لحد ما حاجة تكتب صفوف TIP/BONUS —
   * ده رقم صادق، مش رقم متزوّق.
   */
  async getMyEarnings(captainId: string, query: EarningsQueryDto): Promise<EarningsView> {
    const range = query.range ?? EarningsRange.TODAY;
    const { from, to } = this.resolveRange(range);

    const [orders, walletEntries] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where: {
          captainId,
          status: OrderStatus.DELIVERED,
          deliveredAt: { gte: from, lte: to },
        },
        select: { captainPayout: true, deliveredAt: true },
      }),
      this.prisma.walletTransaction.findMany({
        where: {
          captainId,
          type: { in: [WalletEntryType.TIP, WalletEntryType.BONUS] },
          createdAt: { gte: from, lte: to },
        },
        select: { type: true, amount: true, createdAt: true },
      }),
    ]);

    // مفاتيح الأيام كلها موجودة من البداية — السلسلة بتتملى أصفار وبعدين بتتزود.
    const buckets = new Map<string, { total: number; trips: number }>();
    for (const day of this.eachDay(from, to)) {
      buckets.set(this.dateKey(day), { total: 0, trips: 0 });
    }

    let tripPayouts = 0;
    for (const order of orders) {
      const amount = Number(order.captainPayout);
      tripPayouts += amount;
      const bucket = order.deliveredAt ? buckets.get(this.dateKey(order.deliveredAt)) : undefined;
      if (bucket) {
        bucket.total += amount;
        bucket.trips += 1;
      }
    }

    let tips = 0;
    let bonuses = 0;
    for (const entry of walletEntries) {
      const amount = Number(entry.amount);
      if (entry.type === WalletEntryType.TIP) tips += amount;
      else bonuses += amount;
      const bucket = buckets.get(this.dateKey(entry.createdAt));
      if (bucket) bucket.total += amount;
    }

    const tripCount = orders.length;
    // الإجمالي = أجرة الرحلات + الإكراميات + المكافآت، فمجموع dailySeries بيساويه بالظبط.
    const total = tripPayouts + tips + bonuses;

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      total: this.money(total),
      tripCount,
      averagePerTrip: tripCount ? this.money(total / tripCount) : 0,
      dailySeries: [...buckets.entries()].map(([date, bucket]) => ({
        date,
        label: WEEKDAY_LABELS_AR[new Date(`${date}T00:00:00`).getDay()],
        total: this.money(bucket.total),
        trips: bucket.trips,
      })),
      breakdown: {
        tripPayouts: this.money(tripPayouts),
        tips: this.money(tips),
        bonuses: this.money(bonuses),
      },
    };
  }

  // ────────────────────────────────────────────────────────────
  // الورديات — بدء/إنهاء + ساعات الاتصال
  // ────────────────────────────────────────────────────────────

  /**
   * بدء وردية — الكابتن بيبقى أونلاين وبتتفتحله وردية. idempotent: لو عنده وردية
   * مفتوحة خلاص، بنرجّعها زي ما هي (مابنفتحش تانية) عشان ساعات الاتصال متتحسبش مرتين.
   */
  async startShift(captainId: string): Promise<ShiftView> {
    // اشتراط التحقق اليومي بالوجه — المندوب لازم يبقى موثّق النهاردة قبل ما
    // يشتغل. متحكوم بـ FACE_CHECK_ENFORCE عشان ما يكسرش بيئة قبل ما التطبيق
    // يضيف شاشة السيلفي، والمناديب المزروعين موثّقين النهاردة أصلاً.
    if (this.faceEnforced() && !(await this.face.hasVerifiedToday(captainId))) {
      throw new ForbiddenException('لازم تعمل تحقّق الوجه اليومي قبل ما تبدأ الشغل');
    }

    const open = await this.prisma.shift.findFirst({ where: { captainId, endedAt: null } });
    if (open) {
      await this.prisma.captain.update({
        where: { id: captainId },
        data: { status: CaptainStatus.ONLINE, lastSeenAt: new Date() },
      });
      return this.toShiftView(open);
    }

    const shift = await this.prisma.$transaction(async (tx) => {
      const created = await tx.shift.create({ data: { captainId } });
      await tx.captain.update({
        where: { id: captainId },
        data: { status: CaptainStatus.ONLINE, lastSeenAt: new Date() },
      });
      return created;
    });
    return this.toShiftView(shift);
  }

  /** إنهاء الوردية المفتوحة — الكابتن بيبقى أوفلاين وبتتقفل الوردية. */
  async endShift(captainId: string): Promise<ShiftView | null> {
    const open = await this.prisma.shift.findFirst({ where: { captainId, endedAt: null } });
    await this.prisma.captain.update({
      where: { id: captainId },
      data: { status: CaptainStatus.OFFLINE, lastSeenAt: new Date() },
    });
    if (!open) return null; // مكانش على وردية

    const closed = await this.prisma.shift.update({
      where: { id: open.id },
      data: { endedAt: new Date() },
    });
    return this.toShiftView(closed);
  }

  /**
   * ورديات الفترة + ملخّص: ساعات الاتصال (مجموع مدد الورديات، والمفتوحة بتتحسب
   * لحد دلوقتي)، الرحلات، والأرباح. ده مصدر «ساعات متصل» اللي كانت «—».
   */
  async getMyShifts(captainId: string, range: EarningsRange): Promise<ShiftsView> {
    const { from } = this.resolveRange(range);
    const shifts = await this.prisma.shift.findMany({
      where: { captainId, startedAt: { gte: from } },
      orderBy: { startedAt: 'desc' },
    });

    const now = Date.now();
    let onlineMinutes = 0;
    let trips = 0;
    let earnings = 0;
    for (const s of shifts) {
      const end = s.endedAt ? s.endedAt.getTime() : now;
      onlineMinutes += Math.max(0, Math.round((end - s.startedAt.getTime()) / 60000));
      trips += s.tripCount;
      earnings += Number(s.earnings);
    }

    const active = shifts.find((s) => !s.endedAt) ?? null;

    return {
      range: { from: from.toISOString(), to: new Date(now).toISOString() },
      onlineMinutes,
      trips,
      earnings: Number(earnings.toFixed(2)),
      activeShift: active ? this.toShiftView(active) : null,
      shifts: shifts.map((s) => this.toShiftView(s)),
    };
  }

  /** هل اشتراط التحقق اليومي بالوجه مفعّل (FACE_CHECK_ENFORCE). */
  private faceEnforced(): boolean {
    const v = String(this.config.get('FACE_CHECK_ENFORCE') ?? '').toLowerCase();
    return v === '1' || v === 'true';
  }

  private toShiftView(shift: { id: string; startedAt: Date; endedAt: Date | null; tripCount: number; earnings: Prisma.Decimal }): ShiftView {
    const end = shift.endedAt ? shift.endedAt.getTime() : Date.now();
    return {
      id: shift.id,
      startedAt: shift.startedAt.toISOString(),
      endedAt: shift.endedAt?.toISOString() ?? null,
      isActive: !shift.endedAt,
      minutes: Math.max(0, Math.round((end - shift.startedAt.getTime()) / 60000)),
      tripCount: shift.tripCount,
      earnings: Number(shift.earnings),
    };
  }

  // ────────────────────────────────────────────────────────────
  // المحفظة
  // ────────────────────────────────────────────────────────────

  async getMyWallet(captainId: string): Promise<WalletView> {
    const captain = await this.prisma.captain.findUnique({
      where: { id: captainId },
      select: { walletBalance: true },
    });
    if (!captain) throw new NotFoundException('الكابتن غير موجود');

    const [pending, methods] = await this.prisma.$transaction([
      this.prisma.withdrawalRequest.aggregate({
        where: { captainId, status: WithdrawalStatus.PENDING },
        _sum: { amount: true },
      }),
      this.prisma.payoutMethod.findMany({
        where: { captainId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      }),
    ]);

    const balance = Number(captain.walletBalance);
    const pendingWithdrawals = Number(pending._sum.amount ?? 0);

    return {
      balance: this.money(balance),
      pendingWithdrawals: this.money(pendingWithdrawals),
      // الطلبات المعلّقة محجوزة — عشان ما يقدرش يطلب نفس الرصيد مرتين.
      availableToWithdraw: this.money(availableToWithdraw(balance, pendingWithdrawals)),
      payoutMethods: methods.map((m) => this.toPayoutMethodView(m)),
    };
  }

  async listMyTransactions(captainId: string, query: PaginationDto): Promise<Paginated<WalletTransactionView>> {
    const { page, pageSize, skip } = this.paging(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.walletTransaction.findMany({
        where: { captainId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.walletTransaction.count({ where: { captainId } }),
    ]);

    return { data: rows.map((r) => this.toTransactionView(r)), total, page, pageSize };
  }

  // ────────────────────────────────────────────────────────────
  // طلبات السحب
  // ────────────────────────────────────────────────────────────

  /**
   * الطلب بيتسجّل PENDING **من غير ما يخصم الرصيد**. الخصم بيحصل وقت الاعتماد
   * في نفس المعاملة اللي بتكتب حركة المحفظة، عشان الرصيد وكشف الحركة
   * ما يفترقوش أبداً. المبلغ المعلّق بيتحجز حسابياً في `availableToWithdraw`.
   */
  async createMyWithdrawal(captainId: string, dto: CreateWithdrawalDto): Promise<WithdrawalView> {
    if (dto.amount < MIN_WITHDRAWAL) throw new BadRequestException(`الحد الأدنى للسحب ${MIN_WITHDRAWAL} ر.س`);

    const method = await this.prisma.payoutMethod.findFirst({
      where: { id: dto.payoutMethodId, captainId },
    });
    if (!method) throw new NotFoundException('حساب الاستلام غير موجود');

    const wallet = await this.getMyWallet(captainId);
    // الحد الأدنى + المتاح — القاعدة النقية المختبَرة (`wallet-math.ts`).
    const rejection = withdrawalRejection(dto.amount, wallet.availableToWithdraw);
    if (rejection) throw new BadRequestException(rejection);

    const request = await this.prisma.withdrawalRequest.create({
      data: {
        captainId,
        amount: new Prisma.Decimal(dto.amount.toFixed(2)),
        status: WithdrawalStatus.PENDING,
        destination: method.destination,
        // الـ schema بتخزّن آخر ٤ أرقام بس — مابنكررش بيانات الحساب الكاملة.
        destinationRef: method.accountRef.slice(-4),
      },
    });

    return this.toWithdrawalView(request);
  }

  async listMyWithdrawals(captainId: string, query: PaginationDto): Promise<Paginated<WithdrawalView>> {
    const { page, pageSize, skip } = this.paging(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.withdrawalRequest.findMany({
        where: { captainId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.withdrawalRequest.count({ where: { captainId } }),
    ]);

    return { data: rows.map((r) => this.toWithdrawalView(r)), total, page, pageSize };
  }

  // ────────────────────────────────────────────────────────────
  // حسابات الاستلام
  // ────────────────────────────────────────────────────────────

  async listMyPayoutMethods(captainId: string): Promise<PayoutMethodView[]> {
    const methods = await this.prisma.payoutMethod.findMany({
      where: { captainId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return methods.map((m) => this.toPayoutMethodView(m));
  }

  async createMyPayoutMethod(captainId: string, dto: CreatePayoutMethodDto): Promise<PayoutMethodView> {
    const existing = await this.prisma.payoutMethod.count({ where: { captainId } });

    const method = await this.prisma.payoutMethod.create({
      data: {
        captainId,
        destination: dto.destination,
        label: dto.label,
        accountRef: dto.accountRef,
        // أول حساب بيبقى الافتراضي تلقائياً — الكابتن مايفضلش من غير افتراضي.
        isDefault: existing === 0,
      },
    });

    return this.toPayoutMethodView(method);
  }

  async deleteMyPayoutMethod(captainId: string, id: string): Promise<{ deleted: true }> {
    const method = await this.prisma.payoutMethod.findFirst({ where: { id, captainId } });
    if (!method) throw new NotFoundException('حساب الاستلام غير موجود');

    await this.prisma.payoutMethod.delete({ where: { id } });

    // لو المحذوف كان الافتراضي نرقّي أقدم حساب باقي.
    if (method.isDefault) {
      const next = await this.prisma.payoutMethod.findFirst({
        where: { captainId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (next) await this.prisma.payoutMethod.update({ where: { id: next.id }, data: { isDefault: true } });
    }

    return { deleted: true };
  }

  // ────────────────────────────────────────────────────────────
  // الأدمن — الكباتن
  // ────────────────────────────────────────────────────────────

  /**
   * إيقاف كابتن — منع فوري، مش علم تجميلي.
   *
   * التنفيذ على `user.isActive` عن قصد: ده الحقل اللي `JwtStrategy` بيفحصه في
   * كل نداء، فتوكن الكابتن بيبطل من أول طلب بدل ما يفضل شغّال لحد ما ينتهي.
   * ومعاه ٣ خطوات لازمة عشان الإيقاف يكون فعلي:
   *   · `status = OFFLINE` — يخرج من فلتر التوزيع.
   *   · حذف موقعه من Redis — يخرج من نتيجة «الأقرب» فوراً، وإلا يفضل ظاهر
   *     كمرشّح لحد ما مفتاحه ينتهي بعد ٥ دقايق.
   *   · سطر تدقيق بالسبب — إيقاف بلا سبب مسجّل مافيش منه مراجعة.
   *
   * كابتن في مهمة: بنرفض الإيقاف افتراضياً. `isActive = false` بيمنعه من
   * نداءات الـ API، يعني مش هيقدر يأكّد التسليم — فالطلب بيتعلّق في إيد عميل.
   * الأدمن يعيد إسناد الطلب الأول، أو يبعت `force` وياخد القرار.
   */
  async suspendCaptain(id: string, adminUserId: string, reason: string, force = false) {
    const captain = await this.prisma.captain.findUnique({
      where: { id },
      include: { user: { select: { fullName: true, isActive: true } } },
    });
    if (!captain) throw new NotFoundException('الكابتن غير موجود');
    if (!captain.user.isActive) throw new ConflictException('الكابتن موقوف بالفعل');

    const activeOrder = await this.prisma.order.findFirst({
      where: {
        captainId: id,
        status: {
          in: [
            OrderStatus.CAPTAIN_ASSIGNED,
            OrderStatus.PICKED_UP,
            OrderStatus.ON_THE_WAY,
          ],
        },
      },
      select: { orderNumber: true },
    });
    if (activeOrder && !force) {
      throw new ConflictException(
        `الكابتن في مهمة جارية (${activeOrder.orderNumber}) — أعد إسناد الطلب أولاً، أو أرسل force=true لإيقافه رغم ذلك.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: captain.userId }, data: { isActive: false } });
      await tx.captain.update({ where: { id }, data: { status: CaptainStatus.OFFLINE } });
      await this.audit.record(
        { userId: adminUserId, role: UserRole.ADMIN },
        AuditAction.CAPTAIN_SUSPEND,
        'captain',
        id,
        `إيقاف الكابتن ${captain.user.fullName} — ${reason}`,
        { reason, forced: force, activeOrder: activeOrder?.orderNumber ?? null },
        tx,
      );
    });

    // برّه المعاملة: Redis مش جزء منها، ولو المعاملة رجعت مش عايزين موقع
    // متحذوف لكابتن لسه شغّال.
    await this.redis.removeCaptainLocation(id);

    return { suspended: true, activeOrder: activeOrder?.orderNumber ?? null };
  }

  /** رفع الإيقاف — بيرجّع الدخول بس مايرجّعوش أونلاين؛ ده قراره من التطبيق. */
  async reinstateCaptain(id: string, adminUserId: string) {
    const captain = await this.prisma.captain.findUnique({
      where: { id },
      include: { user: { select: { fullName: true, isActive: true } } },
    });
    if (!captain) throw new NotFoundException('الكابتن غير موجود');
    if (captain.user.isActive) throw new ConflictException('الكابتن غير موقوف');

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: captain.userId }, data: { isActive: true } });
      await this.audit.record(
        { userId: adminUserId, role: UserRole.ADMIN },
        AuditAction.CAPTAIN_REINSTATE,
        'captain',
        id,
        `رفع الإيقاف عن الكابتن ${captain.user.fullName}`,
        undefined,
        tx,
      );
    });

    return { suspended: false };
  }

  async listCaptains(query: ListCaptainsDto): Promise<Paginated<CaptainListItemView>> {
    const { page, pageSize, skip } = this.paging(query);

    const search = query.search?.trim();
    const like = search ? { contains: search, mode: Prisma.QueryMode.insensitive } : undefined;

    const where: Prisma.CaptainWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.companyId ? { companyId: query.companyId } : query.freelanceOnly === 'true' ? { companyId: null } : {}),
      ...(like
        ? {
            OR: [
              { user: { fullName: like } },
              { user: { phone: like } },
              { plateNumber: like },
              { nationalId: like },
            ],
          }
        : {}),
    };

    const [captains, total] = await this.prisma.$transaction([
      this.prisma.captain.findMany({
        where,
        include: { user: true, documents: true, company: { select: { nameAr: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.captain.count({ where }),
    ]);

    // استعلام واحد لعدد التسليمات لكل الصفحة — مش استعلام لكل كابتن.
    const deliveries = await this.prisma.order.groupBy({
      by: ['captainId'],
      where: { captainId: { in: captains.map((c) => c.id) }, status: OrderStatus.DELIVERED },
      _count: { _all: true },
    });
    const deliveryCounts = new Map(deliveries.map((d) => [d.captainId ?? '', d._count._all]));

    // نسبة القبول لكل الصفحة في استعلام واحد — مش استعلام لكل كابتن.
    const offers = await this.prisma.tripOffer.groupBy({
      by: ['captainId', 'status'],
      where: { captainId: { in: captains.map((c) => c.id) }, status: { not: 'OFFERED' } },
      _count: { _all: true },
    });
    const offerAgg = new Map<string, { accepted: number; total: number }>();
    for (const o of offers) {
      const acc = offerAgg.get(o.captainId) ?? { accepted: 0, total: 0 };
      acc.total += o._count._all;
      if (o.status === 'ACCEPTED') acc.accepted += o._count._all;
      offerAgg.set(o.captainId, acc);
    }
    const acceptanceOf = (id: string): number | null => {
      const a = offerAgg.get(id);
      return a && a.total ? Number(((a.accepted / a.total) * 100).toFixed(1)) : null;
    };

    const now = new Date();
    const data = captains.map((captain) => ({
      id: captain.id,
      fullName: captain.user.fullName,
      phone: captain.user.phone,
      vehicleType: captain.vehicleType,
      plateNumber: captain.plateNumber,
      status: captain.status,
      isVerified: captain.isVerified,
      rating: Number(captain.rating),
      ratingCount: captain.ratingCount,
      walletBalance: Number(captain.walletBalance),
      totalDeliveries: deliveryCounts.get(captain.id) ?? 0,
      acceptanceRate: acceptanceOf(captain.id),
      companyId: captain.companyId,
      companyName: captain.company?.nameAr ?? null,
      documentsSummary: this.summarise(this.buildDocumentMatrix(captain.documents, now)),
    }));

    return { data, total, page, pageSize };
  }

  /**
   * مصفوفة الوثائق — صف لكل كابتن بالخمس أنواع وحالتها،
   * زائد `dispatchAllowed` اللي شاشة الالتزام بتلوّن بيه الصف.
   */
  async getCompliance(query: ComplianceQueryDto): Promise<Paginated<ComplianceRowView>> {
    const { page, pageSize, skip } = this.paging(query);
    const filter = query.filter ?? ComplianceFilter.ALL;
    const now = new Date();

    const where: Prisma.CaptainWhereInput = {};
    if (filter === ComplianceFilter.EXPIRED) {
      where.documents = {
        some: {
          OR: [
            { status: DocumentStatus.EXPIRED },
            { status: DocumentStatus.APPROVED, expiresAt: { lt: now } },
          ],
        },
      };
    } else if (filter === ComplianceFilter.EXPIRING) {
      const horizon = new Date(now.getTime() + EXPIRING_SOON_DAYS * DAY_MS);
      where.documents = {
        some: { status: DocumentStatus.APPROVED, expiresAt: { gte: now, lte: horizon } },
      };
    }

    const [captains, total] = await this.prisma.$transaction([
      this.prisma.captain.findMany({
        where,
        include: { user: true, documents: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.captain.count({ where }),
    ]);

    const data = captains.map((captain) => {
      const documents = this.buildDocumentMatrix(captain.documents, now);
      return {
        captainId: captain.id,
        fullName: captain.user.fullName,
        phone: captain.user.phone,
        status: captain.status,
        isVerified: captain.isVerified,
        documents,
        dispatchAllowed: documents
          .filter((d) => d.isRequired)
          .every((d) => d.status === DocumentStatus.APPROVED),
      };
    });

    return { data, total, page, pageSize };
  }

  /**
   * اعتماد/رفض وثيقة. لما الأربع وثائق الإلزامية تبقى معتمدة الكابتن بيتحوّل
   * `isVerified = true` — وبيرجع false أول ما واحدة منها تخرج عن الاعتماد.
   * الاتنين في نفس المعاملة عشان مايحصلش كابتن «موثّق» بوثيقة مرفوضة.
   */
  async reviewDocument(documentId: string, reviewerId: string, dto: ReviewDocumentDto): Promise<CaptainDocumentView> {
    const existing = await this.prisma.captainDocument.findUnique({ where: { id: documentId } });
    if (!existing) throw new NotFoundException('الوثيقة غير موجودة');

    const reason = dto.rejectReason?.trim();
    if (!dto.approved && !reason) throw new BadRequestException('سبب الرفض مطلوب');

    const now = new Date();

    const updated = await this.prisma.$transaction(async (tx) => {
      const document = await tx.captainDocument.update({
        where: { id: documentId },
        data: {
          status: dto.approved ? DocumentStatus.APPROVED : DocumentStatus.REJECTED,
          rejectReason: dto.approved ? null : reason,
          reviewedAt: now,
          reviewedById: reviewerId,
          ...(dto.expiresAt !== undefined ? { expiresAt: new Date(dto.expiresAt) } : {}),
        },
      });

      await this.syncVerification(tx, existing.captainId);
      // جوه المعاملة: السجل يترجع لو المراجعة اترجعت.
      await this.audit.record(
        { userId: reviewerId, role: UserRole.ADMIN },
        AuditAction.DOCUMENT_REVIEW,
        'captainDocument',
        documentId,
        `مراجعة وثيقة (${existing.type}) — ${dto.approved ? 'اعتماد' : `رفض: ${reason}`}`,
        { captainId: existing.captainId, type: existing.type, approved: dto.approved, reason },
        tx,
      );
      return document;
    });

    return this.toDocumentView(updated.type, updated, now);
  }

  // ────────────────────────────────────────────────────────────
  // الأدمن — السحب
  // ────────────────────────────────────────────────────────────

  /** قايمة طلبات السحب — الافتراضي المعلّقة، و`?status=` بيغيّرها. */
  async listWithdrawals(query: ListWithdrawalsDto): Promise<Paginated<AdminWithdrawalView>> {
    const { page, pageSize, skip } = this.paging(query);
    const where: Prisma.WithdrawalRequestWhereInput = {
      status: query.status ?? WithdrawalStatus.PENDING,
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.withdrawalRequest.findMany({
        where,
        include: { captain: { include: { user: true } } },
        orderBy: { createdAt: 'asc' },
        skip,
        take: pageSize,
      }),
      this.prisma.withdrawalRequest.count({ where }),
    ]);

    return {
      data: rows.map((r) => ({
        ...this.toWithdrawalView(r),
        captainId: r.captainId,
        captainName: r.captain.user.fullName,
        captainPhone: r.captain.user.phone,
      })),
      total,
      page,
      pageSize,
    };
  }

  /** الاعتماد = الخصم + سطر في الكشف، الاتنين في معاملة واحدة أو ولا واحد فيهم. */
  async approveWithdrawal(withdrawalId: string, reviewerId: string): Promise<WithdrawalView> {
    return this.prisma.$transaction(async (tx) => {
      // نقرأ الكابتن الأول (من غير قفل) عشان نعرف أنهي صف نقفله.
      const ref = await tx.withdrawalRequest.findUnique({
        where: { id: withdrawalId },
        select: { captainId: true },
      });
      if (!ref) throw new NotFoundException('طلب السحب غير موجود');

      // اقفل صف الكابتن FOR UPDATE — ده بيسلسل كل اعتمادات نفس الكابتن. من غيره
      // اعتمادين متزامنين بيقروا نفس الرصيد ويكتبوا فوق بعض (lost update)، أو
      // نفس الطلب يتعتمد مرتين (double-click) فيتخصم مرتين. القراءة تحت بقت محدّثة.
      await tx.$queryRaw`SELECT id FROM captains WHERE id = ${ref.captainId} FOR UPDATE`;

      const request = await tx.withdrawalRequest.findUnique({ where: { id: withdrawalId } });
      if (!request) throw new NotFoundException('طلب السحب غير موجود');
      if (request.status !== WithdrawalStatus.PENDING) {
        throw new BadRequestException('تمت مراجعة الطلب بالفعل');
      }

      const captain = await tx.captain.findUnique({
        where: { id: request.captainId },
        select: { walletBalance: true },
      });
      if (!captain) throw new NotFoundException('الكابتن غير موجود');

      // الرصيد ممكن يكون قلّ من ساعة الطلب (سحب تاني اتعتمد قبله).
      const balance = new Prisma.Decimal(captain.walletBalance);
      if (balance.lessThan(request.amount)) {
        throw new BadRequestException('الرصيد المتاح أقل من المبلغ المطلوب');
      }

      const balanceAfter = balance.minus(request.amount);
      const now = new Date();

      await tx.captain.update({
        where: { id: request.captainId },
        data: { walletBalance: balanceAfter },
      });

      await tx.walletTransaction.create({
        data: {
          captainId: request.captainId,
          type: WalletEntryType.WITHDRAWAL,
          amount: request.amount.negated(),
          balanceAfter,
          descriptionAr: 'سحب أرباح',
          withdrawalId: request.id,
        },
      });

      const updated = await tx.withdrawalRequest.update({
        where: { id: withdrawalId },
        data: {
          status: WithdrawalStatus.APPROVED,
          reviewedAt: now,
          reviewedById: reviewerId,
          transferredAt: now,
        },
      });

      await this.audit.record(
        { userId: reviewerId, role: UserRole.ADMIN },
        AuditAction.WITHDRAWAL_APPROVE,
        'withdrawal',
        withdrawalId,
        `اعتماد سحب ${Number(request.amount).toFixed(2)} ر.س وخصمه من محفظة الكابتن`,
        { captainId: request.captainId, amount: Number(request.amount), balanceAfter: Number(balanceAfter) },
        tx,
      );

      return this.toWithdrawalView(updated);
    });
  }

  /** الرفض ما بيلمسش الرصيد — لأن الاعتماد هو اللي بيخصم أصلاً. */
  async rejectWithdrawal(withdrawalId: string, reviewerId: string, reason: string): Promise<WithdrawalView> {
    const trimmed = reason?.trim();
    if (!trimmed) throw new BadRequestException('سبب الرفض مطلوب');

    const request = await this.prisma.withdrawalRequest.findUnique({ where: { id: withdrawalId } });
    if (!request) throw new NotFoundException('طلب السحب غير موجود');
    if (request.status !== WithdrawalStatus.PENDING) {
      throw new BadRequestException('تمت مراجعة الطلب بالفعل');
    }

    const updated = await this.prisma.withdrawalRequest.update({
      where: { id: withdrawalId },
      data: {
        status: WithdrawalStatus.REJECTED,
        rejectReason: trimmed,
        reviewedAt: new Date(),
        reviewedById: reviewerId,
      },
    });

    await this.audit.record(
      { userId: reviewerId, role: UserRole.ADMIN },
      AuditAction.WITHDRAWAL_REJECT,
      'withdrawal',
      withdrawalId,
      `رفض سحب ${Number(request.amount).toFixed(2)} ر.س — ${trimmed}`,
      { captainId: request.captainId, amount: Number(request.amount), reason: trimmed },
    );

    return this.toWithdrawalView(updated);
  }

  // ────────────────────────────────────────────────────────────
  // إضافة أجرة الرحلة للمحفظة — نقطة الوصل مع OrdersService
  // ────────────────────────────────────────────────────────────

  /** أجرة الرحلة — بتزوّد رصيد الكابتن وبتكتب سطر TRIP_PAYOUT في نفس المعاملة. */
  async creditTripPayout(captainId: string, orderId: string, amount: number): Promise<WalletTransactionView> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { orderNumber: true },
    });
    if (!order) throw new NotFoundException('الطلب غير موجود');

    return this.creditOrderEntry(
      captainId,
      orderId,
      amount,
      WalletEntryType.TRIP_PAYOUT,
      `أجرة رحلة ${order.orderNumber}`,
    );
  }

  /**
   * إضافة إكرامية العميل لمحفظة المندوب.
   *
   * جدول `wallet_transactions` كان فيه نوع `TIP` من الأول ومافيش حاجة بتكتبه،
   * فشاشة الأرباح كانت بتعرض «إكراميات: ٠» دايماً. دي الحاجة اللي بتكتبه.
   *
   * الإكرامية بتتقيّد كاملة للمندوب: مافيش عمولة منصة عليها ولا ضريبة.
   */
  async creditTip(captainId: string, orderId: string, amount: number): Promise<WalletTransactionView | null> {
    if (amount <= 0) return null;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { orderNumber: true },
    });
    if (!order) throw new NotFoundException('الطلب غير موجود');

    return this.creditOrderEntry(
      captainId,
      orderId,
      amount,
      WalletEntryType.TIP,
      `إكرامية على طلب ${order.orderNumber}`,
    );
  }

  /**
   * إضافة مبلغ لمحفظة الكابتن مع سطر في الدفتر — الأساس المشترك لأجرة الرحلة
   * والإكرامية.
   *
   * **متكررة الاستدعاء بأمان (idempotent)** على (الطلب + الكابتن + النوع): لو
   * السطر موجود خلاص، بترجّعه زي ما هو من غير ما تزوّد الرصيد تاني — عشان إعادة
   * المحاولة أو تسليم مكرر ما يضاعفش فلوس الكابتن. المفتاح بيشمل `captainId`
   * لأن الطلب الواحد في التسليم بالتناوب بيدفع لكابتنين (مركبة + مشي)، وبيشمل
   * `type` عشان الإكرامية ماتتبلعش في فحص تكرار الأجرة.
   */
  private async creditOrderEntry(
    captainId: string,
    orderId: string,
    amount: number,
    type: WalletEntryType,
    descriptionAr: string,
  ): Promise<WalletTransactionView> {
    const existing = await this.prisma.walletTransaction.findFirst({
      where: { orderId, captainId, type },
    });
    if (existing) return this.toTransactionView(existing);

    const value = new Prisma.Decimal(amount.toFixed(2));

    return this.prisma.$transaction(async (tx) => {
      // اقفل صف الطلب FOR UPDATE — بيسلسل أي استدعاءين متوازيين لنفس الطلب.
      // من غير القفل، الاتنين ممكن يعدّوا فحص التكرار تحت (ReadCommitted مش
      // بيشوف صف الغير المش-مكوميت) ويعملوا credit مرتين. القفل بيخلّي التاني
      // يستنى الأول، وبعدها يلاقي الحركة موجودة فيرجّعها بدل ما يدفع تاني.
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;

      const duplicate = await tx.walletTransaction.findFirst({
        where: { orderId, captainId, type },
      });
      if (duplicate) return this.toTransactionView(duplicate);

      const captain = await tx.captain.update({
        where: { id: captainId },
        data: { walletBalance: { increment: value } },
        select: { walletBalance: true },
      });

      const entry = await tx.walletTransaction.create({
        data: {
          captainId,
          type,
          amount: value,
          balanceAfter: captain.walletBalance,
          descriptionAr,
          orderId,
        },
      });

      return this.toTransactionView(entry);
    });
  }

  /**
   * خصم تكلفة استرداد من محفظة الكابتن — لما يكون هو سبب الاسترداد.
   *
   * **الرصيد بينزل تحت الصفر لو لزم.** ده مقصود: الخصم دَين مستحق على الكابتن،
   * ولو منعناه لما الرصيد يقل هيبقى الكابتن اللي محفظته فاضية بيهرب من
   * المسؤولية. السحب أصلاً بيتحقق من الرصيد المتاح، فرصيد سالب معناه
   * إنه مايقدرش يسحب لحد ما يغطّيه.
   *
   * idempotent على (الطلب + النوع) زي `creditTripPayout` — إعادة المحاولة
   * ماتخصمش مرتين.
   */
  async debitRefundLiability(
    captainId: string,
    orderId: string,
    refundId: string,
    amount: number,
    reasonAr: string,
  ): Promise<WalletTransactionView | null> {
    const value = new Prisma.Decimal(amount.toFixed(2));
    if (value.lessThanOrEqualTo(0)) return null;

    return this.prisma.$transaction(async (tx) => {
      // على الاسترداد نفسه مش على الطلب: الطلب ممكن يترد أكتر من مرة، وكل
      // مرة خصم مستقل.
      const duplicate = await tx.walletTransaction.findUnique({ where: { refundId } });
      if (duplicate) return this.toTransactionView(duplicate);

      const captain = await tx.captain.update({
        where: { id: captainId },
        data: { walletBalance: { decrement: value } },
        select: { walletBalance: true },
      });

      const entry = await tx.walletTransaction.create({
        data: {
          captainId,
          type: WalletEntryType.ADJUSTMENT,
          amount: value.negated(),
          balanceAfter: captain.walletBalance,
          descriptionAr: reasonAr,
          orderId,
          refundId,
        },
      });

      return this.toTransactionView(entry);
    });
  }

  // ────────────────────────────────────────────────────────────
  // مساعدات
  // ────────────────────────────────────────────────────────────

  /** الأربع وثائق الإلزامية معتمدة ⇐ الكابتن موثّق. أي غير كده ⇐ لأ. */
  private async syncVerification(client: Prisma.TransactionClient, captainId: string) {
    const now = new Date();
    const documents = await client.captainDocument.findMany({ where: { captainId } });

    const approved = new Set(
      documents
        .filter((d) => this.effectiveStatus(d, now) === DocumentStatus.APPROVED)
        .map((d) => d.type),
    );
    const isVerified = REQUIRED_DOCUMENT_TYPES.every((type) => approved.has(type));

    await client.captain.update({ where: { id: captainId }, data: { isVerified } });
  }

  /** الحالة المحسوبة — معتمدة وعدّى تاريخها = منتهية، من غير ما نكتب في الداتابيز. */
  private effectiveStatus(document: DocumentRow, now: Date): DocumentStatus {
    if (
      document.status === DocumentStatus.APPROVED &&
      document.expiresAt !== null &&
      document.expiresAt < now
    ) {
      return DocumentStatus.EXPIRED;
    }
    return document.status;
  }

  /** الخمس أنواع بترتيب ثابت — الناقص بيرجع MISSING. */
  private buildDocumentMatrix(stored: DocumentRow[], now: Date): CaptainDocumentView[] {
    const byType = new Map(stored.map((d) => [d.type, d]));
    return DOCUMENT_TYPES.map((type) => this.toDocumentView(type, byType.get(type), now));
  }

  private toDocumentView(type: DocumentType, document: DocumentRow | undefined, now: Date): CaptainDocumentView {
    const isRequired = REQUIRED_DOCUMENT_TYPES.includes(type);

    if (!document) {
      return {
        id: null,
        type,
        status: 'MISSING',
        fileUrl: null,
        rejectReason: null,
        expiresAt: null,
        daysUntilExpiry: null,
        reviewedAt: null,
        updatedAt: null,
        isRequired,
      };
    }

    return {
      id: document.id,
      type,
      status: this.effectiveStatus(document, now),
      fileUrl: document.fileUrl,
      rejectReason: document.rejectReason,
      expiresAt: document.expiresAt?.toISOString() ?? null,
      daysUntilExpiry: this.daysUntil(document.expiresAt, now),
      reviewedAt: document.reviewedAt?.toISOString() ?? null,
      updatedAt: document.updatedAt.toISOString(),
      isRequired,
    };
  }

  private summarise(documents: CaptainDocumentView[]): DocumentsSummary {
    const approved = documents.filter((d) => d.status === DocumentStatus.APPROVED).length;
    return { approved, total: documents.length, allApproved: approved === documents.length };
  }

  private toProfileView(
    captain: CaptainWithUser,
    documents: DocumentRow[],
    totalDeliveries: number,
    acceptanceRate: number | null,
  ): CaptainProfileView {
    return {
      id: captain.id,
      fullName: captain.user.fullName,
      phone: captain.user.phone,
      email: captain.user.email,
      avatarUrl: captain.user.avatarUrl,
      nationalId: this.maskTail(captain.nationalId),
      vehicleType: captain.vehicleType,
      plateNumber: captain.plateNumber,
      status: captain.status,
      isVerified: captain.isVerified,
      rating: Number(captain.rating),
      ratingCount: captain.ratingCount,
      walletBalance: Number(captain.walletBalance),
      totalDeliveries,
      // بتتحسب من `trip_offers` — null لو الكابتن لسه ما اتعرض عليه عروض.
      acceptanceRate,
      joinedYear: captain.createdAt.getFullYear(),
      documentsSummary: this.summarise(this.buildDocumentMatrix(documents, new Date())),
      companyId: captain.companyId,
      companyName: captain.company?.nameAr ?? null,
    };
  }

  /**
   * توزيعات المندوب — لو تابع لشركة، دي أرباحه: الشركة بتدفعله عن رحلاته
   * (مش المنصة، فمالوش محفظة سحب). كل صف = حصته في تسوية شركة، بحالة الدفع.
   */
  async myDistributions(captainId: string) {
    const rows = await this.prisma.captainDistribution.findMany({
      where: { captainId },
      include: {
        companySettlement: { select: { periodEnd: true, company: { select: { nameAr: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    let paid = 0;
    let pending = 0;
    for (const r of rows) {
      const amount = Number(r.amount);
      if (r.status === 'PAID') paid += amount;
      else pending += amount;
    }

    return {
      totalPaid: Number(paid.toFixed(2)),
      totalPending: Number(pending.toFixed(2)),
      tripCount: rows.reduce((s, r) => s + r.tripCount, 0),
      distributions: rows.map((r) => ({
        id: r.id,
        companyName: r.companySettlement.company.nameAr,
        periodEnd: r.companySettlement.periodEnd.toISOString(),
        amount: Number(r.amount),
        tripCount: r.tripCount,
        status: r.status,
        reference: r.reference,
        paidAt: r.paidAt?.toISOString() ?? null,
      })),
    };
  }

  private toPayoutMethodView(method: {
    id: string;
    destination: PayoutDestination;
    label: string;
    accountRef: string;
    isDefault: boolean;
    createdAt: Date;
  }): PayoutMethodView {
    return {
      id: method.id,
      destination: method.destination,
      label: method.label,
      accountRef: this.maskAccountRef(method.accountRef),
      isDefault: method.isDefault,
      createdAt: method.createdAt.toISOString(),
    };
  }

  private toTransactionView(entry: {
    id: string;
    type: WalletEntryType;
    amount: Prisma.Decimal;
    balanceAfter: Prisma.Decimal;
    descriptionAr: string;
    orderId: string | null;
    withdrawalId: string | null;
    createdAt: Date;
  }): WalletTransactionView {
    return {
      id: entry.id,
      type: entry.type,
      amount: Number(entry.amount),
      balanceAfter: Number(entry.balanceAfter),
      descriptionAr: entry.descriptionAr,
      orderId: entry.orderId,
      withdrawalId: entry.withdrawalId,
      createdAt: entry.createdAt.toISOString(),
    };
  }

  private toWithdrawalView(request: {
    id: string;
    amount: Prisma.Decimal;
    status: WithdrawalStatus;
    destination: PayoutDestination;
    destinationRef: string;
    rejectReason: string | null;
    reviewedAt: Date | null;
    transferredAt: Date | null;
    createdAt: Date;
  }): WithdrawalView {
    return {
      id: request.id,
      amount: Number(request.amount),
      status: request.status,
      destination: request.destination,
      // لازم يتقنّع فعلاً — الصف بيتخزّن بالمرجع كامل، ولو حطينا النقط قدامه
      // بس الرقم بيفضل ظاهر للأدمن وفي أي تصدير.
      destinationRef: this.maskTail(request.destinationRef),
      rejectReason: request.rejectReason,
      reviewedAt: request.reviewedAt?.toISOString() ?? null,
      transferredAt: request.transferredAt?.toISOString() ?? null,
      createdAt: request.createdAt.toISOString(),
    };
  }

  /** آخر ٤ أرقام بس — للهوية الوطنية. */
  private maskTail(value: string, keep = 4): string {
    if (value.length <= keep) return '••••';
    return `•••• ${value.slice(-keep)}`;
  }

  /** أول ٤ وآخر ٤ — «SA03 •••• 7519». اللي في النص مابيخرجش من الـ API أبداً. */
  private maskAccountRef(value: string): string {
    const clean = value.replace(/\s+/g, '');
    if (clean.length <= 8) return this.maskTail(clean);
    return `${clean.slice(0, 4)} •••• ${clean.slice(-4)}`;
  }

  private money(value: number): number {
    return Number(value.toFixed(2));
  }

  private paging(query: PaginationDto): { page: number; pageSize: number; skip: number } {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    return { page, pageSize, skip: (page - 1) * pageSize };
  }

  private daysUntil(date: Date | null, now: Date): number | null {
    if (!date) return null;
    return Math.ceil((this.startOfDay(date).getTime() - this.startOfDay(now).getTime()) / DAY_MS);
  }

  /** YYYY-MM-DD بالتوقيت المحلي — مش toISOString عشان ما ينزلقش ليوم UTC تاني. */
  private dateKey(date: Date): string {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  private startOfDay(date: Date): Date {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  /** اليوم = من نص الليل · الأسبوع = من آخر سبت · الشهر = من أول يوم في الشهر. */
  private resolveRange(range: EarningsRange): { from: Date; to: Date } {
    const now = new Date();
    const from = this.startOfDay(now);

    if (range === EarningsRange.WEEK) {
      // getDay(): ٦ = السبت. بنرجع لآخر سبت عشان السلسلة تبدأ بيه.
      from.setDate(from.getDate() - ((from.getDay() + 1) % 7));
    } else if (range === EarningsRange.MONTH) {
      from.setDate(1);
    }

    return { from, to: now };
  }

  private eachDay(from: Date, to: Date): Date[] {
    const days: Date[] = [];
    const cursor = this.startOfDay(from);
    const last = this.startOfDay(to);
    while (cursor <= last) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }
}
