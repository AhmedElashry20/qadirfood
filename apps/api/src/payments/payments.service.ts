// المنطق المالي لجانب العميل: التحصيل والاسترداد.
//
// قاعدة الموديول: **كل حركة فلوس ليها صف**. قبل كده `orders.paymentStatus`
// كان بيتغيّر لوحده من غير أي أثر — يعني «اتدفع» من غير معرفة إمتى ولا بأي
// عملية ولا مين استرد. دلوقتي:
//   • `transactions` = عملية التحصيل (واحدة للطلب).
//   • `refunds`      = كل استرداد لوحده، بمين عمله والسبب.
// و`orders.paymentStatus` بقى **مشتق** من الاتنين دول، مش مصدر مستقل.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, PaymentMethod, PaymentStatus, Prisma, RefundLiability, RefundStatus, UserRole } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import Decimal from 'decimal.js';
import { commissionToReverse as computeCommissionReverse } from './refund-policy';

import { AuditService } from '../audit/audit.module';
import { CaptainsService } from '../captains/captains.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common';
import { CashGateway, PaymentGateway, SandboxGateway } from './payment-gateway';
import { MoyasarGateway } from './moyasar-gateway';
import type { CreateRefundDto } from './payments.dto';

/** الطرق اللي بتتحصّل إلكترونياً — الكاش بره لأنه بيتحصّل عند الباب. */
// WALLET مش مدرجة: مافيش شحن/خصم محفظة للعميل، فمش طريقة دفع إلكترونية حقيقية.
// (createOrder بيرفضها أصلاً على مستوى الـ DTO.)
const ONLINE_METHODS: PaymentMethod[] = [
  PaymentMethod.MADA,
  PaymentMethod.CARD,
  PaymentMethod.APPLE_PAY,
];

export const isOnlineMethod = (method: PaymentMethod) => ONLINE_METHODS.includes(method);

// حالتين متّفق عليهم عبر كل المستهلكين (السعة، التقارير، التسويات) عشان
// مايختلفوش في حساب فلوس مين:
//
//   • «بتحجز سعة» (RESERVING): الاسترداد ده بيقلّل المتاح للاسترداد على الطلب —
//     حتى لو لسه مستني موافقة أو لسه ماتحصّلش. أي حاجة مش مرفوضة/فاشلة.
//   • «فلوس خرجت» (SETTLED): الاسترداد اتنفّذ فعلاً وبيتحسب في التقارير والتسويات.
//     المستني موافقة مش منهم — لسه ممكن يترفض.
const RESERVING_STATUSES: RefundStatus[] = [
  RefundStatus.AWAITING_APPROVAL,
  RefundStatus.PENDING,
  RefundStatus.COMPLETED,
];
export const SETTLED_REFUND_STATUSES: RefundStatus[] = [RefundStatus.PENDING, RefundStatus.COMPLETED];

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sandbox: SandboxGateway,
    private readonly cash: CashGateway,
    private readonly moyasar: MoyasarGateway,
    private readonly captains: CaptainsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /**
   * اختيار البوابة: الكاش دايماً `cash`. المدفوعات الإلكترونية بتروح لميسّر لو
   * `PAYMENT_PROVIDER=moyasar` (إنتاج)، وإلا `sandbox` (تطوير — مش بيحرّك فلوس).
   * بكده نفس الكود بيشتغل في التطوير والإنتاج بتغيير متغيّر واحد.
   */
  private onlineGateway(): PaymentGateway {
    return this.config.get<string>('PAYMENT_PROVIDER') === 'moyasar' ? this.moyasar : this.sandbox;
  }

  private gatewayFor(method: PaymentMethod): PaymentGateway {
    return isOnlineMethod(method) ? this.onlineGateway() : this.cash;
  }

  /** فوق الحد ده الاسترداد محتاج موافقة أدمن تاني. 0 = كله بيتنفّذ من غير موافقة. */
  private approvalThreshold(): number {
    return Number(this.config.get('REFUND_APPROVAL_THRESHOLD') ?? 100);
  }

  /**
   * بيتنادى بعد إنشاء الطلب على طول. بيعمل صف العملية وبيحاول يحصّل.
   *
   * أي فشل هنا **مابيسقّطش الطلب** — الطلب اتعمل خلاص والمطعم اتبلّغ.
   * العملية بتفضل PENDING والأدمن بيشوفها في اللوحة.
   *
   * بترجّع حالة الدفع النهائية عشان رد إنشاء الطلب يطلع بيها من غير قراءة تانية.
   */
  async openCharge(orderId: string): Promise<{ status: PaymentStatus; checkoutUrl: string | null }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { transaction: true },
    });
    if (!order) return { status: PaymentStatus.PENDING, checkoutUrl: null };
    if (order.transaction) {
      return { status: order.paymentStatus, checkoutUrl: order.transaction.checkoutUrl };
    }

    const gateway = this.gatewayFor(order.paymentMethod);

    const transaction = await this.prisma.transaction.create({
      data: {
        orderId: order.id,
        provider: gateway.name,
        method: order.paymentMethod,
        amount: order.total,
        status: PaymentStatus.PENDING,
      },
    });

    if (!isOnlineMethod(order.paymentMethod)) {
      return { status: PaymentStatus.PENDING, checkoutUrl: null }; // كاش — بيتحصّل وقت التسليم
    }

    try {
      const result = await gateway.charge({
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: Number(order.total),
        method: order.paymentMethod,
      });

      await this.prisma.$transaction([
        this.prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            providerRefId: result.providerRefId,
            status: result.captured ? PaymentStatus.PAID : PaymentStatus.PENDING,
            paidAt: result.captured ? new Date() : null,
            checkoutUrl: result.redirectUrl ?? null,
            rawPayload: (result.raw ?? {}) as Prisma.InputJsonValue,
          },
        }),
        ...(result.captured
          ? [
              this.prisma.order.update({
                where: { id: order.id },
                data: { paymentStatus: PaymentStatus.PAID },
              }),
            ]
          : []),
      ]);

      return {
        status: result.captured ? PaymentStatus.PAID : PaymentStatus.PENDING,
        checkoutUrl: result.redirectUrl ?? null,
      };
    } catch (error) {
      this.logger.error(`فشل تحصيل الطلب ${order.orderNumber}: ${(error as Error).message}`);
      await this.prisma.$transaction([
        this.prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: PaymentStatus.FAILED },
        }),
        this.prisma.order.update({
          where: { id: order.id },
          data: { paymentStatus: PaymentStatus.FAILED },
        }),
      ]);

      return { status: PaymentStatus.FAILED, checkoutUrl: null };
    }
  }

  /** تحصيل الكاش عند التسليم — بيتنادى من `markDelivered`. */
  async captureCashOnDelivery(orderId: string): Promise<void> {
    const transaction = await this.prisma.transaction.findUnique({ where: { orderId } });
    if (!transaction) return;
    if (transaction.status === PaymentStatus.PAID) return;

    await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: PaymentStatus.PAID, paidAt: new Date() },
    });
  }

  /**
   * رد البوابة (webhook). في بوابة حقيقية ده اللي بيأكّد الدفع مش رد `charge`،
   * لأن 3-D Secure بتحصل على جهاز العميل بعد ما إحنا خلصنا.
   */
  async handleWebhook(providerRefId: string, status: 'PAID' | 'FAILED', raw?: Record<string, unknown>) {
    const transaction = await this.prisma.transaction.findFirst({ where: { providerRefId } });
    if (!transaction) throw new NotFoundException('عملية غير معروفة');

    // البوابات بتعيد إرسال الـ webhook — نفس النتيجة تاني مالهاش أثر.
    if (transaction.status === PaymentStatus.PAID && status === 'PAID') return { ok: true, repeated: true };

    const paid = status === 'PAID';
    await this.prisma.$transaction([
      this.prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          status: paid ? PaymentStatus.PAID : PaymentStatus.FAILED,
          paidAt: paid ? new Date() : null,
          rawPayload: (raw ?? {}) as Prisma.InputJsonValue,
        },
      }),
      this.prisma.order.update({
        where: { id: transaction.orderId },
        data: { paymentStatus: paid ? PaymentStatus.PAID : PaymentStatus.FAILED },
      }),
    ]);

    return { ok: true, repeated: false };
  }

  /**
   * webhook ميسّر — بيتنادى من الـ controller بعد التحقق من `secret_token`.
   *
   * مبدأ أمان أساسي: **مانصدّقش جسم الـ webhook لوحده**. بنطلع رقم الفاتورة منه،
   * وبعدين نرجع نسأل ميسّر بالـ API عن الحالة الرسمية (`resolveStatus`) قبل ما
   * نأكّد الدفع — عشان لو حد زوّر الطلب مايقدرش يأكّد دفعة ماتمّتش.
   */
  async handleMoyasarWebhook(body: Record<string, unknown>) {
    const data = (body?.data ?? {}) as Record<string, unknown>;
    const metadata = (data?.metadata ?? {}) as Record<string, unknown>;

    // رقم الفاتورة هو `providerRefId` اللي خزّناه وقت الإنشاء.
    let invoiceId = (data.invoice_id as string) || '';
    if (!invoiceId && typeof data.id === 'string' && String(data.id).startsWith('inv_')) {
      invoiceId = data.id as string;
    }
    // لو مافيش رقم فاتورة في الـ payload، نوصله من الطلب.
    if (!invoiceId && typeof metadata.orderId === 'string') {
      const tx = await this.prisma.transaction.findFirst({
        where: { orderId: metadata.orderId as string },
        select: { providerRefId: true },
      });
      invoiceId = tx?.providerRefId ?? '';
    }
    if (!invoiceId) {
      this.logger.warn('webhook ميسّر من غير رقم فاتورة نعرفه — اتجاهل');
      return { ok: true, ignored: true };
    }

    const status = await this.moyasar.resolveStatus(invoiceId);
    if (!status) return { ok: true, pending: true }; // لسه معلّقة رسمياً
    return this.handleWebhook(invoiceId, status, data);
  }

  /**
   * المبلغ اللي لسه ينفع يترد = المحصّل − اللي اترد (بدون المحاولات الفاشلة).
   *
   * طلب ماتدفعش أصلاً بيرجّع صفر — مش إجمالي الطلب. الفرق ده مهم لأن اللوحة
   * بتعطّل زرار الاسترداد على الرقم ده، فلو رجّعنا الإجمالي هيبان إن في فلوس
   * تترد على طلب محصّلش قرش.
   */
  private async refundableAmount(orderId: string, tx: Prisma.TransactionClient = this.prisma) {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { transaction: true } });
    if (!order) throw new NotFoundException('الطلب غير موجود');

    // بنحجز على أي استرداد لسه حي (بما فيه المستني موافقة) — عشان مايتعملش
    // استردادين كبار على نفس الطلب والاتنين يستنوا موافقة ويعدّوا فوق المدفوع.
    const refunds = await tx.refund.findMany({
      where: { orderId, status: { in: RESERVING_STATUSES } },
    });

    const uncollected =
      order.paymentStatus === PaymentStatus.PENDING || order.paymentStatus === PaymentStatus.FAILED;
    const paid = uncollected ? new Decimal(0) : new Decimal(order.total.toString());
    const refunded = refunds.reduce((sum, r) => sum.plus(r.amount.toString()), new Decimal(0));
    return { order, paid, refunded, remaining: Decimal.max(0, paid.minus(refunded)) };
  }

  /**
   * استرداد كامل أو جزئي — الأدمن بس.
   *
   * القفل على صف الطلب مقصود: طلبين استرداد في نفس اللحظة كانوا هيقروا نفس
   * المجموع ويعدّوا الاتنين، فيترد أكتر من المدفوع.
   */
  async refund(user: AuthUser, orderId: string, dto: CreateRefundDto) {
    if (user.role !== UserRole.ADMIN) throw new ForbiddenException('الاسترداد للأدمن بس');

    let orderNumber = orderId;
    const created = await this.prisma.$transaction(async (tx) => {
      // `orders.id` نصّي (Prisma بتولّد uuid في التطبيق) — من غير cast.
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
      const { order, paid, refunded, remaining } = await this.refundableAmount(orderId, tx);
      orderNumber = order.orderNumber; // للسجل — أوضح من الـ UUID

      if (order.paymentStatus === PaymentStatus.PENDING) {
        throw new BadRequestException('الطلب لسه ماتدفعش — مافيش مبلغ يترد');
      }
      if (order.paymentStatus === PaymentStatus.FAILED) {
        throw new BadRequestException('عملية الدفع فشلت أصلاً — مافيش مبلغ يترد');
      }
      if (remaining.lte(0)) {
        throw new BadRequestException(`الطلب استرد بالكامل (${refunded.toFixed(2)} ر.س)`);
      }

      const amount = dto.amount === undefined ? remaining : new Decimal(dto.amount);
      const liability = dto.liability ?? RefundLiability.NONE;
      if (amount.lte(0)) throw new BadRequestException('المبلغ لازم يكون أكبر من صفر');
      if (amount.gt(remaining)) {
        throw new BadRequestException(
          `أقصى مبلغ متاح للاسترداد ${remaining.toFixed(2)} ر.س (المدفوع ${paid.toFixed(2)} · المسترد ${refunded.toFixed(2)})`,
        );
      }

      // فوق الحد ⇒ محجوز مستني موافقة أدمن تاني (مايتنفّذش دلوقتي). تحته ⇒ ينفّذ زي ما كان.
      const needsApproval = amount.gt(this.approvalThreshold());

      return tx.refund.create({
        data: {
          orderId,
          amount: amount.toFixed(2),
          reasonAr: dto.reason,
          liability,
          commissionReversed: this.commissionToReverse(order, amount, liability).toFixed(2),
          provider: order.transaction?.provider ?? this.gatewayFor(order.paymentMethod).name,
          createdById: user.userId,
          status: needsApproval ? RefundStatus.AWAITING_APPROVAL : RefundStatus.PENDING,
        },
      });
    });

    // مستني موافقة ⇒ ماينفّذش، بيتسجّل ويستنى أدمن تاني.
    if (created.status === RefundStatus.AWAITING_APPROVAL) {
      await this.audit.record(
        user,
        AuditAction.REFUND_CREATE,
        'refund',
        created.id,
        `طلب استرداد ${Number(created.amount).toFixed(2)} ر.س للطلب ${orderNumber} — مستني موافقة (فوق ${this.approvalThreshold()})`,
        { orderId: created.orderId, orderNumber, amount: Number(created.amount), liability: created.liability, awaitingApproval: true },
      );
      return { ...this.mapRefund(created), requiresApproval: true };
    }

    await this.audit.record(
      user,
      AuditAction.REFUND_CREATE,
      'refund',
      created.id,
      `استرداد ${Number(created.amount).toFixed(2)} ر.س للطلب ${orderNumber} (${created.liability})`,
      { orderId: created.orderId, orderNumber, amount: Number(created.amount), liability: created.liability, reason: created.reasonAr },
    );

    return this.executeRefund(created.id);
  }

  /**
   * أدمن تاني بيوافق على استرداد كبير — وبعدها بيتنفّذ.
   *
   * **فصل المهام**: اللي وافق لازم يكون غير اللي طلب. ده جوهر الرقابة — مايبقاش
   * نفس الشخص بيطلب ويوافق على فلوس كبيرة.
   */
  async approveRefund(user: AuthUser, refundId: string) {
    if (user.role !== UserRole.ADMIN) throw new ForbiddenException('الموافقة للأدمن بس');
    const refund = await this.prisma.refund.findUnique({ where: { id: refundId } });
    if (!refund) throw new NotFoundException('الاسترداد غير موجود');
    if (refund.status !== RefundStatus.AWAITING_APPROVAL) {
      throw new BadRequestException('الاسترداد ده مش مستني موافقة');
    }
    if (refund.createdById && refund.createdById === user.userId) {
      throw new ForbiddenException('ماينفعش توافق على استرداد إنت طلبته — لازم أدمن تاني');
    }

    // مطالبة ذرّية: بننقل الحالة من AWAITING_APPROVAL لـ PENDING بشرط إنها لسه
    // AWAITING_APPROVAL. لو أدمنين اتنين وافقوا في نفس اللحظة، واحد بس هيكسب
    // (count=1) وهو اللي بينفّذ — التاني count=0 فبيترفض. من غير ده كان الاسترداد
    // بيتنفّذ على البوابة مرتين والعميل بياخد فلوسه مرتين.
    const claimed = await this.prisma.refund.updateMany({
      where: { id: refundId, status: RefundStatus.AWAITING_APPROVAL },
      data: { status: RefundStatus.PENDING, approvedById: user.userId },
    });
    if (claimed.count === 0) {
      throw new ConflictException('الاسترداد اتراجعت حالته للتو — حدّث وحاول من جديد');
    }

    await this.audit.record(
      user,
      AuditAction.REFUND_APPROVE,
      'refund',
      refundId,
      `الموافقة على استرداد ${Number(refund.amount).toFixed(2)} ر.س وتنفيذه`,
      { orderId: refund.orderId, amount: Number(refund.amount), createdById: refund.createdById },
    );

    // بعد الموافقة بيتنفّذ زي أي استرداد عادي (بوابة/كاش، خصم كابتن، مزامنة حالة).
    return this.executeRefund(refundId);
  }

  /** أدمن تاني بيرفض الموافقة — الاسترداد ما بيتنفّذش وبيتحرّر من حجز السعة. */
  async rejectRefundApproval(user: AuthUser, refundId: string, reason: string) {
    if (user.role !== UserRole.ADMIN) throw new ForbiddenException('الرفض للأدمن بس');
    const trimmed = reason?.trim();
    if (!trimmed) throw new BadRequestException('سبب الرفض مطلوب');

    const refund = await this.prisma.refund.findUnique({ where: { id: refundId } });
    if (!refund) throw new NotFoundException('الاسترداد غير موجود');
    if (refund.status !== RefundStatus.AWAITING_APPROVAL) {
      throw new BadRequestException('الاسترداد ده مش مستني موافقة');
    }
    if (refund.createdById && refund.createdById === user.userId) {
      throw new ForbiddenException('ماينفعش ترفض استرداد إنت طلبته — لازم أدمن تاني');
    }

    const updated = await this.prisma.refund.update({
      where: { id: refundId },
      data: { status: RefundStatus.REJECTED, approvedById: user.userId, approvalRejectReason: trimmed },
    });

    await this.audit.record(
      user,
      AuditAction.REFUND_REJECT,
      'refund',
      refundId,
      `رفض الموافقة على استرداد ${Number(refund.amount).toFixed(2)} ر.س — ${trimmed}`,
      { orderId: refund.orderId, amount: Number(refund.amount), reason: trimmed },
    );

    return this.mapRefund(updated);
  }

  /**
   * العمولة اللي بترجع للمطعم مع الاسترداد.
   *
   * القاعدة: **المنصة ماتكسبش عمولة على بيع اترد** — بس بس لما البيع هو اللي
   * فشل (إلغاء) أو المطعم هو السبب. لو الغلط من المنصة أو الكابتن، المطعم
   * سلّم شغله صح وياخد مستحقه كامل، والعمولة تفضل زي ما هي.
   *
   * بالنسبة والتناسب: الاسترداد الجزئي بيرجّع الجزء المقابل ليه من العمولة،
   * مش العمولة كلها.
   */
  private commissionToReverse(
    order: { total: Prisma.Decimal; commission: Prisma.Decimal },
    refundAmount: Decimal,
    liability: RefundLiability,
  ): Decimal {
    // السياسة نفسها في دالة نقية مختبَرة (`refund-policy.ts`).
    return computeCommissionReverse(
      { total: order.total.toString(), commission: order.commission.toString() },
      refundAmount.toString(),
      liability,
    );
  }

  /**
   * تنفيذ الاسترداد على البوابة. منفصل عن التسجيل عشان لو البوابة وقعت،
   * يفضل عندنا صف PENDING نقدر نعيد المحاولة عليه بدل ما القرار يضيع.
   */
  private async executeRefund(refundId: string) {
    const refund = await this.prisma.refund.findUniqueOrThrow({
      where: { id: refundId },
      include: { order: { include: { transaction: true } } },
    });

    const gateway = this.gatewayFor(refund.order.paymentMethod);
    let status: RefundStatus = RefundStatus.PENDING;
    let providerRefId: string | null = null;
    let failReason: string | null = null;

    try {
      const result = await gateway.refund({
        providerRefId: refund.order.transaction?.providerRefId ?? '',
        amount: Number(refund.amount),
        reasonAr: refund.reasonAr,
      });
      providerRefId = result.providerRefId || null;
      status = result.settled ? RefundStatus.COMPLETED : RefundStatus.PENDING;
    } catch (error) {
      status = RefundStatus.FAILED;
      failReason = (error as Error).message;
      this.logger.error(`فشل استرداد ${refund.id}: ${failReason}`);
    }

    const updated = await this.prisma.refund.update({
      where: { id: refund.id },
      data: {
        status,
        providerRefId,
        failReason,
        completedAt: status === RefundStatus.COMPLETED ? new Date() : null,
      },
    });

    // الخصم من الكابتن بيتنفّذ بس لو الاسترداد نفسه عدّى — ماينفعش نخصم منه
    // على استرداد فشل. والدالة idempotent فإعادة المحاولة ماتخصمش مرتين.
    if (
      status !== RefundStatus.FAILED &&
      refund.liability === RefundLiability.CAPTAIN &&
      refund.order.captainId
    ) {
      await this.captains.debitRefundLiability(
        refund.order.captainId,
        refund.orderId,
        refund.id,
        Number(refund.amount),
        `خصم استرداد الطلب ${refund.order.orderNumber} — ${refund.reasonAr}`,
      );
    }

    await this.syncOrderPaymentStatus(refund.orderId);
    return this.mapRefund(updated);
  }

  /**
   * حالة الدفع في الطلب = خلاصة الاسترداد. مابنكتبهاش بالإيد من أي مكان تاني.
   *
   * الاسترداد المعلّق (الكاش) بيتحسب هنا: القرار اتاخد خلاص والمبلغ محجوز،
   * فلو ماحسبناهوش هيبان الطلب متاح للاسترداد تاني.
   */
  private async syncOrderPaymentStatus(orderId: string) {
    const { order, paid, refunded } = await this.refundableAmount(orderId);
    if (order.paymentStatus === PaymentStatus.PENDING || order.paymentStatus === PaymentStatus.FAILED) return;

    const status = refunded.gte(paid)
      ? PaymentStatus.REFUNDED
      : refunded.gt(0)
        ? PaymentStatus.PARTIALLY_REFUNDED
        : PaymentStatus.PAID;

    if (status !== order.paymentStatus) {
      await this.prisma.order.update({ where: { id: orderId }, data: { paymentStatus: status } });
    }
  }

  /**
   * استرداد تلقائي عند الإلغاء بعد الدفع — بيتنادى من `cancelOrder`.
   * فشله مابيوقفش الإلغاء: الإلغاء قرار تشغيلي، والفلوس ليها صف PENDING
   * بيبان في اللوحة لو ماعدّاش.
   */
  async refundOnCancel(orderId: string, actorUserId: string, reasonAr: string) {
    try {
      // نفس قفل مسار الاسترداد اليدوي: بنقفل صف الطلب FOR UPDATE قبل ما نحسب
      // المتبقّي وننشئ الاسترداد — عشان استرداد إلغاء واسترداد يدوي متزامنين
      // مايقروش نفس المتبقّي والاتنين يعدّوا فوق المدفوع.
      const refundId = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
        const { order, remaining } = await this.refundableAmount(orderId, tx);
        if (order.paymentStatus !== PaymentStatus.PAID || remaining.lte(0)) return null;

        const refund = await tx.refund.create({
          data: {
            orderId,
            amount: remaining.toFixed(2),
            reasonAr,
            // الإلغاء = البيع ماتمّش، فالعمولة بترجع كاملة مع الفلوس. لو طلع
            // إن حد بعينه سبب الإلغاء، الأدمن بيغيّر الجهة من اللوحة.
            liability: RefundLiability.NONE,
            commissionReversed: this.commissionToReverse(order, remaining, RefundLiability.NONE).toFixed(2),
            provider: order.transaction?.provider ?? this.gatewayFor(order.paymentMethod).name,
            createdById: actorUserId,
            status: RefundStatus.PENDING,
          },
        });
        return refund.id;
      });

      if (!refundId) return null;
      // التنفيذ على البوابة بره القفل — نداء شبكة مايتقفلش عليه صف الطلب.
      return this.executeRefund(refundId);
    } catch (error) {
      this.logger.error(`فشل الاسترداد التلقائي للطلب ${orderId}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * تأكيد استرداد اتنفّذ بره النظام — الكاش أساساً.
   *
   * `CashGateway` عمرها ما بترجّع `settled`، فالصف بيفضل PENDING لحد ما المحاسب
   * يسلّم العميل فلوسه ويقفله من هنا. من غير المسار ده الاسترداد الكاش كان
   * هيفضل معلّق للأبد ومحدش يعرف اتنفّذ ولا لأ.
   */
  async settleRefund(user: AuthUser, refundId: string, noteAr?: string) {
    const refund = await this.prisma.refund.findUnique({ where: { id: refundId } });
    if (!refund) throw new NotFoundException('الاسترداد غير موجود');
    if (refund.status === RefundStatus.COMPLETED) throw new BadRequestException('الاسترداد متسوّي خلاص');
    if (refund.status === RefundStatus.FAILED) {
      throw new BadRequestException('الاسترداد فشل — أعد المحاولة بدل التسوية اليدوية');
    }

    const updated = await this.prisma.refund.update({
      where: { id: refundId },
      data: {
        status: RefundStatus.COMPLETED,
        completedAt: new Date(),
        // مين سوّاه يدوي بيحلّ محل مين طلبه — المسؤولية على التنفيذ مش الطلب.
        createdById: user.userId,
        reasonAr: noteAr ? `${refund.reasonAr} · تسوية يدوية: ${noteAr}` : refund.reasonAr,
      },
    });

    await this.syncOrderPaymentStatus(refund.orderId);
    await this.audit.record(
      user,
      AuditAction.REFUND_SETTLE,
      'refund',
      refundId,
      `تسوية يدوية لاسترداد ${Number(refund.amount).toFixed(2)} ر.س${noteAr ? ` — ${noteAr}` : ''}`,
      { orderId: refund.orderId, amount: Number(refund.amount), note: noteAr },
    );
    return this.mapRefund(updated);
  }

  /** إعادة محاولة استرداد فشل — الصف بيتحفظ عشان ده بالظبط. */
  async retryRefund(refundId: string, actor?: AuthUser) {
    const refund = await this.prisma.refund.findUnique({ where: { id: refundId } });
    if (!refund) throw new NotFoundException('الاسترداد غير موجود');
    if (refund.status !== RefundStatus.FAILED) {
      throw new BadRequestException('إعادة المحاولة للاستردادات الفاشلة بس');
    }

    // نفس مبدأ المطالبة الذرّية: من FAILED لـ PENDING بشرط إنها لسه FAILED.
    // إعادتين محاولة متزامنتين → واحدة بس بتنفّذ فعلاً على البوابة.
    const claimed = await this.prisma.refund.updateMany({
      where: { id: refundId, status: RefundStatus.FAILED },
      data: { status: RefundStatus.PENDING, failReason: null },
    });
    if (claimed.count === 0) {
      throw new ConflictException('الاسترداد مش في حالة فشل دلوقتي — يمكن اتنفّذ أو اتعاد بالفعل');
    }
    if (actor) {
      await this.audit.record(actor, AuditAction.REFUND_RETRY, 'refund', refundId, `إعادة محاولة استرداد ${Number(refund.amount).toFixed(2)} ر.س`, {
        orderId: refund.orderId,
        amount: Number(refund.amount),
      });
    }
    return this.executeRefund(refundId);
  }

  /** تفاصيل الدفع لطلب — للأدمن، وللعميل صاحب الطلب. */
  async paymentOf(user: AuthUser, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        transaction: true,
        refunds: {
          orderBy: { createdAt: 'desc' },
          include: { createdBy: { select: { fullName: true } } },
        },
      },
    });
    if (!order) throw new NotFoundException('الطلب غير موجود');
    if (user.role === UserRole.CUSTOMER && order.customerId !== user.customerId) {
      throw new ForbiddenException();
    }
    if (user.role !== UserRole.CUSTOMER && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('غير مصرح');
    }

    const { paid, refunded, remaining } = await this.refundableAmount(orderId);

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      method: order.paymentMethod,
      status: order.paymentStatus,
      /// قيمة الطلب — بتفضل زي ما هي حتى لو ماتحصّلش.
      total: Number(order.total),
      /// المحصّل فعلاً — صفر لو الدفع لسه معلّق أو فشل.
      collectedTotal: Number(paid),
      refundedTotal: Number(refunded),
      refundableAmount: Number(remaining),
      transaction: order.transaction
        ? {
            id: order.transaction.id,
            provider: order.transaction.provider,
            providerRefId: order.transaction.providerRefId,
            status: order.transaction.status,
            amount: Number(order.transaction.amount),
            paidAt: order.transaction.paidAt,
            createdAt: order.transaction.createdAt,
          }
        : null,
      refunds: order.refunds.map((r) => ({ ...this.mapRefund(r), createdByName: r.createdBy?.fullName ?? null })),
    };
  }

  /** كل الاستردادات — لصفحة المدفوعات في اللوحة. */
  async listRefunds(status: RefundStatus | undefined, page = 1, pageSize = 20) {
    const where = status ? { status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.refund.findMany({
        where,
        include: { order: { select: { orderNumber: true, paymentMethod: true } }, createdBy: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.refund.count({ where }),
    ]);

    return {
      data: rows.map((r) => ({
        ...this.mapRefund(r),
        orderNumber: r.order.orderNumber,
        paymentMethod: r.order.paymentMethod,
        createdByName: r.createdBy?.fullName ?? null,
      })),
      total,
      page,
      pageSize,
    };
  }

  private mapRefund(refund: {
    id: string;
    orderId: string;
    amount: Prisma.Decimal;
    reasonAr: string;
    liability: RefundLiability;
    commissionReversed: Prisma.Decimal;
    status: RefundStatus;
    provider: string;
    providerRefId: string | null;
    failReason: string | null;
    approvalRejectReason?: string | null;
    createdAt: Date;
    completedAt: Date | null;
  }) {
    return {
      id: refund.id,
      orderId: refund.orderId,
      amount: Number(refund.amount),
      reasonAr: refund.reasonAr,
      liability: refund.liability,
      commissionReversed: Number(refund.commissionReversed),
      status: refund.status,
      provider: refund.provider,
      providerRefId: refund.providerRefId,
      failReason: refund.failReason,
      approvalRejectReason: refund.approvalRejectReason ?? null,
      createdAt: refund.createdAt,
      completedAt: refund.completedAt,
    };
  }
}
