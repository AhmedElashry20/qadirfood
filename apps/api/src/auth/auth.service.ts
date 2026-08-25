import { BadRequestException, Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CompanyStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from '../sms/sms.service';
import type { AuthUser } from '../common';

/** الأدوار اللي بتسجّل دخول بالجوال + OTP. Prisma بيولّد الـ enum كـ object، فما ينفعش UserRole.X كنوع. */
export type OtpRole = Extract<UserRole, 'CUSTOMER' | 'CAPTAIN'>;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly sms: SmsService,
  ) {}

  // ────────────────────────────────────────────────────────────
  // العميل والكابتن: جوال + OTP
  // ────────────────────────────────────────────────────────────

  async requestOtp(phone: string) {
    // رمز عشوائي تشفيرياً (مش Math.random اللي بيتنبّأ بيه).
    const code = String(randomInt(1000, 10000));

    await this.prisma.otpCode.create({
      data: { phone, code, expiresAt: new Date(Date.now() + 5 * 60 * 1000) },
    });

    // إرسال فعلي عبر مزوّد الـ SMS (Unifonic). الفشل مابيوقّفش المسار — بيتسجّل بس،
    // والمستخدم يقدر يعيد الطلب. في التطوير المزوّد «log» فمابيبعتش رسالة حقيقية.
    void this.sms
      .send(phone, `رمز الدخول لقادر فود: ${code}\nصالح لمدة ٥ دقائق.`)
      .catch((e) => this.logger.error(`فشل إرسال OTP: ${(e as Error).message}`));

    // إظهار الكود في الرد **fail-closed**: بيحصل بس لو `OTP_DEV_ECHO` مفعّل صراحةً
    // **و** مش إنتاج — عشان أي بيئة من غير NODE_ENV مظبوط ماتسرّبش الرمز لأي حد
    // يطلبه (كان ده ثغرة استيلاء على الحساب).
    const echo = String(this.config.get('OTP_DEV_ECHO') ?? '').toLowerCase();
    const devEcho =
      (echo === '1' || echo === 'true') && this.config.get('NODE_ENV') !== 'production';
    if (devEcho) this.logger.warn(`OTP لـ ${phone}: ${code}`);

    return { sent: true, expiresInSeconds: 300, ...(devEcho ? { devCode: code } : {}) };
  }

  async verifyOtp(
    phone: string,
    code: string,
    role: OtpRole,
    fullName?: string,
    nationalId?: string,
  ) {
    const otp = await this.prisma.otpCode.findFirst({
      where: { phone, code, consumed: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      // رمز غلط: بنزوّد عدّاد المحاولات على آخر رمز حيّ للرقم ده، وبعد ٥ محاولات
      // بنبطّله — فحتى مهاجم بيوزّع على IPات كتير مايقدرش يخمّن الـ ٤ أرقام.
      const MAX_ATTEMPTS = 5;
      const latest = await this.prisma.otpCode.findFirst({
        where: { phone, consumed: false, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      });
      if (latest) {
        const attempts = latest.attempts + 1;
        await this.prisma.otpCode.update({
          where: { id: latest.id },
          data: { attempts, ...(attempts >= MAX_ATTEMPTS ? { consumed: true } : {}) },
        });
      }
      throw new UnauthorizedException('رمز التحقق غير صحيح أو منتهي');
    }

    let user = await this.prisma.user.findUnique({
      where: { phone },
      include: { customer: true, captain: true },
    });

    // أول تسجيل دخول = إنشاء الحساب
    if (!user) {
      // مهم: التحقق من البيانات الناقصة **قبل** ما نحرق الرمز، وإلا المستخدم
      // يرجع يكمّل بياناته ويلاقي الرمز اتستهلك ويضطر يطلب واحد جديد.
      if (!fullName) throw new BadRequestException('الاسم مطلوب للتسجيل لأول مرة');

      // الكابتن لازم يتعمله سجل في `captains` كمان، وإلا التوكن هيطلع من غير
      // captainId فمش هيقدر يستلم طلبات ولا يشوف رحلاته.
      if (role === UserRole.CAPTAIN && !nationalId) {
        throw new BadRequestException('رقم الهوية مطلوب لتسجيل كابتن جديد');
      }

      user = await this.prisma.user.create({
        data: {
          phone,
          fullName,
          role,
          ...(role === UserRole.CUSTOMER ? { customer: { create: {} } } : {}),
          ...(role === UserRole.CAPTAIN ? { captain: { create: { nationalId: nationalId! } } } : {}),
        },
        include: { customer: true, captain: true },
      });
    }

    if (!user.isActive) throw new UnauthorizedException('الحساب موقوف — تواصل مع الدعم');

    // حساب قديم اتعمل قبل التصليح ده (يوزر كابتن من غير سجل كابتن) — نمنعه
    // بوضوح بدل ما ندّيه توكن ناقص يفشل في كل نداء بعد كده.
    if (user.role === UserRole.CAPTAIN && !user.captain) {
      throw new UnauthorizedException('حساب الكابتن غير مكتمل — تواصل مع الدعم لاستكمال التسجيل');
    }

    // الرمز بيتحرق دلوقتي بس — بعد ما التحقق كله عدّى.
    await this.prisma.otpCode.update({ where: { id: otp.id }, data: { consumed: true } });

    return this.issueTokens({
      userId: user.id,
      role: user.role,
      customerId: user.customer?.id,
      captainId: user.captain?.id,
    });
  }

  // ────────────────────────────────────────────────────────────
  // المطعم والأدمن: إيميل/جوال + كلمة مرور
  // ────────────────────────────────────────────────────────────

  /**
   * لو الحساب على أكتر من فرع، بنرجّع قائمة الفروع من غير توكن كامل —
   * المستخدم يختار الفرع، وساعتها بس بنصدر توكن مربوط بالفرع ده (شاشة ١).
   */
  async loginWithPassword(identifier: string, password: string, branchId?: string) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { phone: identifier }] },
      include: { merchantsOf: { include: { branch: true } }, companiesOf: { include: { company: true } } },
    });

    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('بيانات الدخول غير صحيحة');
    }
    if (!user.isActive) throw new UnauthorizedException('الحساب موقوف');

    if (user.role === UserRole.ADMIN) {
      return this.issueTokens({ userId: user.id, role: user.role });
    }

    if (user.role === UserRole.COMPANY) {
      const membership = user.companiesOf[0];
      if (!membership) throw new UnauthorizedException('هذا الحساب غير مرتبط بأي شركة');
      if (membership.company.status === CompanyStatus.SUSPENDED) {
        throw new UnauthorizedException('الشركة موقوفة — تواصل مع الدعم');
      }
      return this.issueTokens({ userId: user.id, role: user.role, companyId: membership.companyId });
    }

    if (user.role !== UserRole.MERCHANT || !user.merchantsOf.length) {
      throw new UnauthorizedException('هذا الحساب غير مرتبط بأي فرع');
    }

    if (!branchId) {
      if (user.merchantsOf.length === 1) {
        return this.issueTokens({
          userId: user.id,
          role: user.role,
          branchId: user.merchantsOf[0].branchId,
        });
      }
      // متعدد الفروع → لازم يختار
      return {
        requiresBranchSelection: true,
        branches: user.merchantsOf.map((m) => ({
          id: m.branch.id,
          nameAr: m.branch.nameAr,
          city: m.branch.city,
          role: m.role,
        })),
      };
    }

    const membership = user.merchantsOf.find((m) => m.branchId === branchId);
    if (!membership) throw new UnauthorizedException('غير مصرح لك بالدخول على هذا الفرع');

    return this.issueTokens({ userId: user.id, role: user.role, branchId });
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwt.verify<AuthUser>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
      const { userId, role, branchId, captainId, customerId, companyId } = payload;
      return this.issueTokens({ userId, role, branchId, captainId, customerId, companyId });
    } catch {
      throw new UnauthorizedException('جلسة منتهية — سجّل الدخول من جديد');
    }
  }

  private async issueTokens(user: AuthUser) {
    const accessToken = this.jwt.sign(user, {
      secret: this.config.get<string>('JWT_SECRET'),
      expiresIn: this.config.get<string>('JWT_EXPIRES_IN') ?? '7d',
    });

    const refreshToken = this.jwt.sign(user, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '30d',
    });

    const profile = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { id: true, fullName: true, phone: true, email: true, role: true, avatarUrl: true },
    });

    return { accessToken, refreshToken, user: profile, branchId: user.branchId };
  }

  static hashPassword(plain: string) {
    return bcrypt.hash(plain, 10);
  }
}
