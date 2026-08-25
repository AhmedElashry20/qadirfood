// إشعارات Push عبر **Firebase Cloud Messaging (FCM)**. نفس مبدأ باقي التكاملات:
// بيشتغل لحظة ما تحط بيانات حساب الخدمة (`FIREBASE_*`)، ومن غيرها بيسجّل في اللوج
// بدل ما يوقّع أي حاجة. توكنات الأجهزة متخزّنة في `User.fcmTokens`.

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type App, cert, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { PrismaService } from '../prisma/prisma.service';

export interface PushPayload {
  title: string;
  body: string;
  /** بيانات إضافية للتطبيق (فتح شاشة الطلب مثلاً) — القيم لازم كلها نصوص في FCM. */
  data?: Record<string, string>;
}

@Injectable()
export class NotificationsService implements OnModuleInit {
  private app?: App;
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
    let privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn('FCM مش متظبّط (FIREBASE_*) — الإشعارات هتتسجّل في اللوج بس');
      return;
    }

    // في ملفات env السطور بتتهرب كـ «\n» — بنرجّعها أسطر حقيقية.
    privateKey = privateKey.replace(/\\n/g, '\n');

    try {
      this.app = initializeApp(
        { credential: cert({ projectId, clientEmail, privateKey }) },
        'notifications',
      );
      this.logger.log('FCM جاهز — الإشعارات هتتبعت فعلاً');
    } catch (error) {
      this.logger.error(`فشل تهيئة FCM: ${(error as Error).message}`);
    }
  }

  /** تسجيل توكن جهاز للمستخدم (من غير تكرار). */
  async registerToken(userId: string, token: string): Promise<void> {
    if (!token) return;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fcmTokens: true },
    });
    if (!user) return;
    if (!user.fcmTokens.includes(token)) {
      await this.prisma.user.update({ where: { id: userId }, data: { fcmTokens: { push: token } } });
    }
  }

  /** إزالة توكن (تسجيل خروج / إلغاء الإذن). */
  async removeToken(userId: string, token: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fcmTokens: true },
    });
    if (!user) return;
    await this.prisma.user.update({
      where: { id: userId },
      data: { fcmTokens: { set: user.fcmTokens.filter((t) => t !== token) } },
    });
  }

  /**
   * إرسال لإشعار لكل أجهزة المستخدم. الفشل مابيرميش استثناء (الإشعار مش حرج على
   * مسار العمل)، وبنشيل التوكنات اللي ميسّر... يعني FCM رفضها (جهاز شال التطبيق).
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.app) {
      this.logger.debug(`[FCM/log] لـ ${userId}: ${payload.title} — ${payload.body}`);
      return;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { fcmTokens: true },
    });
    if (!user?.fcmTokens.length) return;

    try {
      const res = await getMessaging(this.app).sendEachForMulticast({
        tokens: user.fcmTokens,
        notification: { title: payload.title, body: payload.body },
        data: payload.data ?? {},
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default' } } },
      });

      // شيل التوكنات غير الصالحة عشان الدفتر مايكبرش بأجهزة شالت التطبيق.
      const invalid: string[] = [];
      res.responses.forEach((r, i) => {
        const code = r.error?.code;
        if (
          !r.success &&
          (code === 'messaging/invalid-registration-token' ||
            code === 'messaging/registration-token-not-registered')
        ) {
          invalid.push(user.fcmTokens[i]);
        }
      });
      if (invalid.length) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { fcmTokens: { set: user.fcmTokens.filter((t) => !invalid.includes(t)) } },
        });
      }
    } catch (error) {
      this.logger.error(`فشل إرسال إشعار لـ ${userId}: ${(error as Error).message}`);
    }
  }
}
