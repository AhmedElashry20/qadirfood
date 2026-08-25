// بذرة **الإنتاج** — عكس seed.ts (اللي بيملأ بيانات عرض ويمسح الجداول). دي:
//   • ماتمسحش أي حاجة.
//   • بتعمل **حساب أدمن واحد بس** من متغيّرات البيئة (مش باسورد مزروع ضعيف).
//   • idempotent: لو الأدمن موجود بتحدّث بياناته من غير ما تكرّره.
// بعد كده بتبني نشاطك الحقيقي (مطاعم/مناديب/عملاء) من لوحة الأدمن والتطبيقات.
//
// التشغيل: ADMIN_EMAIL=... ADMIN_PHONE=... ADMIN_PASSWORD=... npm run seed:prod
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim();
  const phone = process.env.ADMIN_PHONE?.trim();
  const rawPassword = process.env.ADMIN_PASSWORD;

  if (!email || !phone || !rawPassword) {
    throw new Error(
      'محتاج ADMIN_EMAIL و ADMIN_PHONE و ADMIN_PASSWORD في البيئة قبل بذرة الإنتاج.',
    );
  }
  if (rawPassword.length < 8) {
    throw new Error('كلمة مرور الأدمن لازم ٨ أحرف على الأقل.');
  }

  const passwordHash = await bcrypt.hash(rawPassword, 10);

  // idempotent: نحدّث لو موجود (بالإيميل أو الجوال)، وإلا ننشئ.
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { phone }] },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { email, phone, passwordHash, role: UserRole.ADMIN, isActive: true },
    });
    console.log(`✓ تم تحديث حساب الأدمن: ${email}`);
  } else {
    await prisma.user.create({
      data: {
        email,
        phone,
        passwordHash,
        fullName: 'مدير المنصة',
        role: UserRole.ADMIN,
        // صلاحيات فاضية = صلاحية كاملة (شوف permissions-core).
        permissions: [],
      },
    });
    console.log(`✓ تم إنشاء حساب الأدمن: ${email}`);
  }

  console.log('جاهز — سجّل دخول اللوحة وابدأ تضيف المطاعم والمناديب الحقيقيين.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
