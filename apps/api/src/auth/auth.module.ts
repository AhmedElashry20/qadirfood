import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, Body, Controller, Post, HttpCode, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { IsEnum, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';
import { AuthService, type OtpRole } from './auth.service';
import type { AuthUser } from '../common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  /**
   * التوقيع لوحده مش كفاية.
   *
   * قبل كده كنا بنرجّع الـ payload زي ما هو، يعني توكن أي حد اتوقف أو اتحذف
   * يفضل شغّال لحد ما يخلص (٧ أيام). أدمن اتفصل النهاردة بيقدر يسترد فلوس
   * لأسبوع جاي. بنتأكد من الحساب لسه موجود وفعّال في كل نداء.
   *
   * ده استعلام على المفتاح الأساسي لكل request — لو الحمل زوّد، الحل كاش
   * قصير في Redis مش إلغاء الفحص.
   */
  async validate(payload: AuthUser): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      select: { isActive: true, role: true },
    });

    if (!user) throw new UnauthorizedException('الحساب غير موجود');
    if (!user.isActive) throw new UnauthorizedException('الحساب موقوف — تواصل مع الدعم');
    // الدور اتغيّر بعد إصدار التوكن ⇒ التوكن مابيعبّرش عن صلاحياته الحالية.
    if (user.role !== payload.role) throw new UnauthorizedException('تغيّرت صلاحيات الحساب — سجّل الدخول مرة أخرى');

    return payload;
  }
}

// ── DTOs ──
class RequestOtpDto {
  @IsString()
  phone!: string;
}

class VerifyOtpDto {
  @IsString()
  phone!: string;

  @IsString()
  code!: string;

  @IsEnum(UserRole)
  @IsIn([UserRole.CUSTOMER, UserRole.CAPTAIN], { message: 'الدور لازم يكون عميل أو كابتن' })
  role!: OtpRole;

  /** إلزامي لتسجيل كابتن جديد — سجل الكابتن مايتعملش من غيره. */
  @IsOptional()
  @IsString()
  nationalId?: string;

  @IsOptional()
  @IsString()
  fullName?: string;
}

class LoginDto {
  @IsString()
  identifier!: string; // إيميل أو جوال

  @IsString()
  @MinLength(6)
  password!: string;

  /** لو الحساب متعدد الفروع، الفرع المختار (شاشة ١). */
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

class RefreshDto {
  @IsString()
  refreshToken!: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // طلب رمز: ٣/دقيقة لكل IP — يمنع إغراق المستخدم بـ SMS (وتكلفتها).
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post('otp/request')
  @HttpCode(200)
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto.phone);
  }

  // تحقّق الرمز: ٥/دقيقة — الدرع الأساسي ضد تخمين الـ OTP (٩٠٠٠ احتمال).
  // مع صلاحية ٥ دقايق، التخمين يبقى عملياً مستحيل.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('otp/verify')
  @HttpCode(200)
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto.phone, dto.code, dto.role, dto.fullName, dto.nationalId);
  }

  // دخول بكلمة مرور: ١٠/دقيقة — ضد تخمين كلمات المرور.
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.loginWithPassword(dto.identifier, dto.password, dto.branchId);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }
}

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN') ?? '7d' },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
