import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import { ValidationPipe, Logger, BadRequestException } from '@nestjs/common';
import type { ValidationError } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common';

/**
 * أسرار لازمة قبل ما السيرفر يشتغل أصلاً. من غير ده، لو `JWT_SECRET` ناقص كان
 * السيرفر بيقوم عادي ويوقّع توكنات بسرّ `undefined` — كارثة أمنية صامتة. بنقف
 * بصوت عالي بدري بدل ما نكتشف بعدين.
 */
function assertEnv() {
  const required = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`متغيّرات بيئة ناقصة (إلزامية): ${missing.join(', ')}`);
  }

  if (process.env.NODE_ENV === 'production') {
    // في الإنتاج مانقبلش الأسرار الافتراضية ولا لايف السيميوليشن ولا إذاعة الرمز.
    const weak = (v?: string) => !v || v.length < 16 || /change|example|secret123|dev/i.test(v);
    const prodProblems: string[] = [];
    if (weak(process.env.JWT_SECRET)) prodProblems.push('JWT_SECRET ضعيف/افتراضي');
    if (weak(process.env.JWT_REFRESH_SECRET)) prodProblems.push('JWT_REFRESH_SECRET ضعيف/افتراضي');
    if (!process.env.CORS_ORIGINS) prodProblems.push('CORS_ORIGINS لازم يتحدّد في الإنتاج');
    if (process.env.OTP_DEV_ECHO) prodProblems.push('OTP_DEV_ECHO لازم يتقفل في الإنتاج');
    if (process.env.DEMO_FLOW === '1' || process.env.LIVE_SIM === '1') {
      prodProblems.push('DEMO_FLOW/LIVE_SIM لازم يتقفلوا في الإنتاج');
    }
    if (prodProblems.length) throw new Error(`إعداد إنتاج غير آمن: ${prodProblems.join(' · ')}`);
  }
}

async function bootstrap() {
  assertEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // الملفات المرفوعة بتتقدّم من /uploads — التخزين محلي دلوقتي، ولما نربط S3
  // السطر ده بيتشال والـ URLs بتيجي من الـ CDN.
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads/' });

  app.setGlobalPrefix('api', { exclude: ['health'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // أي حقل مش في الـ DTO بيتشال — مهم: العميل مش بيبعت أسعار
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      // التطبيقات بتعرض رسالة السيرفر للمستخدم على طول، فلازم تبقى عربي.
      // حقل ناقص بيكسر أكتر من قاعدة في نفس الوقت (IsString + MaxLength مثلاً)
      // وclass-validator بيرجّعهم بترتيب عشوائي — فبنقدّم أول رسالة عربية
      // مكتوبة بإيدنا، ولو مافيش بنرجّع رسالة عامة بدل الإنجليزي.
      exceptionFactory: (errors) => new BadRequestException(arabicMessages(errors)),
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  app.enableCors({
    // trim لكل عنصر — "a, b" كان بيدخل origin فيه مسافة (" b") فمايطابقش الدومين.
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    credentials: true,
  });

  // Swagger بيكشف كل المسارات والـ DTOs — مفيد في التطوير، لكن في الإنتاج ده
  // سطح هجوم ماحدش محتاجه. بنقفله إلا لو اتفعّل صراحةً بـ ENABLE_SWAGGER.
  const swaggerOn = process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === '1';
  if (swaggerOn) {
    const config = new DocumentBuilder()
      .setTitle('Delivery Platform API')
      .setDescription('منصة توصيل — REST + Socket.IO')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();

    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');

  Logger.log(`API شغال على http://localhost:${port}/api — التوثيق على /docs`, 'Bootstrap');
}

// شبكة أمان على مستوى العملية. أي Promise اترفض من غير ما حد يمسكه (زي
// `void dispatchNow(...)` اللي بتشتغل في الخلفية) كان بيوقّع Node يقتل السيرفر
// كله في النسخ الحديثة. بنسجّله ونكمّل شغل بدل ما التطبيق كله يقع.
process.on('unhandledRejection', (reason) => {
  Logger.error(
    `Promise مرفوض من غير معالجة: ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}`,
    'UnhandledRejection',
  );
});
process.on('uncaughtException', (error: Error) => {
  Logger.error(`استثناء غير ممسوك: ${error.stack ?? error.message}`, 'UncaughtException');
});

void bootstrap();

/** بيسحب كل رسائل التحقق ويفضّل العربي منها. */
function arabicMessages(errors: ValidationError[]): string[] {
  const hasArabic = (text: string) => /[\u0600-\u06FF]/.test(text);

  const collect = (list: ValidationError[], path: string[] = []): string[] =>
    list.flatMap((error) => {
      const here = [...path, error.property];
      const constraints = error.constraints ?? {};

      // حقل ناقص بيكسّر قواعد الشكل كمان (الطول، النوع…)، فبيرجع بكذا رسالة
      // متناقضة زي «مطلوب» و«طويل» مع بعض. «ناقص» بيغلب أي حاجة تانية.
      const missing = constraints.isNotEmpty ?? constraints.isDefined;
      const own = missing ? [missing] : Object.values(constraints);
      const arabic = own.filter(hasArabic);

      // لو الحقل ده ليه رسالة عربية واحدة على الأقل، بنسيب الإنجليزي كله.
      const chosen = arabic.length
        ? arabic
        : own.length
          ? [`قيمة غير صحيحة للحقل «${here.join('.')}»`]
          : [];

      return [...chosen, ...collect(error.children ?? [], here)];
    });

  const messages = collect(errors);
  return messages.length ? messages : ['البيانات المرسلة غير صحيحة'];
}
