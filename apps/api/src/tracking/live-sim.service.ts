// محاكاة الحركة الحيّة — تخلّي الكباتن يتحرّكوا على خريطة اللوحة فعلاً.
//
// ⚠️ للتطوير/العرض بس (متحكوم بـ `LIVE_SIM`). مش بديل عن مواقع حقيقية — لما
// الكباتن يبعتوا مواقعهم من التطبيق، دي بتتوقف تلقائياً عن أي كابتن بيبثّ فعلاً.
// بتحرّك المواقع في الذاكرة وتبثّها كل بضع ثواني، ومابتكتبش في قاعدة البيانات
// كل تكّة (الخريطة بتتحرّك من السوكيت؛ التحميل الأولي من آخر موقع محفوظ).

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CaptainStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from './tracking.gateway';

interface SimPoint {
  lat: number;
  lng: number;
  /** اتجاه بسيط للحركة — بيتغيّر أحياناً عشان تبان طبيعية مش عشوائية بحتة. */
  headingRad: number;
}

@Injectable()
export class LiveSimService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LiveSimService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly positions = new Map<string, SimPoint>();
  /** كباتن محجوزين لرحلة حيّة (DemoFlow بيسوقهم) — بنسيبهم له مننجيّرهمش. */
  private readonly claimed = new Set<string>();
  /** كل ~٦ تكّات بنثبّت الموقع في قاعدة البيانات عشان التحميل الأولي مايرجعش لبعيد. */
  private tick = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TrackingGateway,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    const enabled = String(this.config.get('LIVE_SIM') ?? '').toLowerCase();
    if (enabled !== '1' && enabled !== 'true') return;
    if (this.config.get('NODE_ENV') === 'production') return;

    // نبدأ من آخر مواقع معروفة للكباتن الأونلاين.
    const captains = await this.prisma.captain.findMany({
      where: { status: { in: [CaptainStatus.ONLINE, CaptainStatus.ON_TRIP] } },
      select: { id: true },
    });
    for (const c of captains) {
      const pt = await this.prisma.getPoint('captains', 'lastLocation', c.id);
      if (pt) this.positions.set(c.id, { lat: pt.lat, lng: pt.lng, headingRad: this.pseudoAngle(c.id) });
    }

    if (!this.positions.size) {
      this.logger.warn('LIVE_SIM يعمل لكن لا يوجد كباتن متصلون بمواقع — لا حركة');
      return;
    }

    this.logger.warn(`LIVE_SIM شغّال — بيحرّك ${this.positions.size} كابتن على الخريطة (تطوير بس)`);
    this.timer = setInterval(() => void this.step(), 3000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ── تنسيق مع محرّك الرحلات الحيّة (DemoFlow) ──────────────────────
  // لما رحلة حقيقية تبدأ، الكابتن بيتساق على مساره branch→بيت العميل، فبنسيبه
  // للـ DemoFlow ومنجيّرهوش هنا. وبعد التسليم بيرجع لنا من آخر نقطة.

  /** احجز كابتن لرحلة — LiveSim هيوقف تحريكه لحد ما يترجّع. */
  claimForTrip(captainId: string) {
    this.claimed.add(captainId);
  }

  /** رجّع كابتن بعد التسليم من نقطة التسليم — يكمّل تسكّعه من هناك. */
  releaseFromTrip(captainId: string, lat: number, lng: number) {
    this.claimed.delete(captainId);
    this.positions.set(captainId, { lat, lng, headingRad: this.pseudoAngle(captainId) });
  }

  private async step() {
    this.tick += 1;
    const persist = this.tick % 6 === 0;

    for (const [captainId, p] of this.positions) {
      if (this.claimed.has(captainId)) continue; // في رحلة حيّة — DemoFlow بيسوقه
      // خطوة صغيرة (~٢٠–٤٠ متر) في اتجاه بيتغيّر تدريجياً — حركة طبيعية.
      p.headingRad += this.wander(captainId, this.tick);
      const stepDeg = 0.00025 + (this.hash(captainId + this.tick) % 20) / 100000; // ~25–45m
      p.lat += Math.cos(p.headingRad) * stepDeg;
      p.lng += Math.sin(p.headingRad) * stepDeg;

      // نخلّيهم حوالين الرياض — لو ابتعدوا نرجّعهم للمركز.
      if (Math.abs(p.lat - 24.7136) > 0.05 || Math.abs(p.lng - 46.6753) > 0.05) {
        p.headingRad = Math.atan2(46.6753 - p.lng, 24.7136 - p.lat);
      }

      this.gateway.broadcastCaptainLocation(captainId, Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6)));

      if (persist) {
        // كتابة نادرة — عشان التحميل الأولي للخريطة يبان قريب من الواقع.
        await this.prisma
          .setPoint('captains', 'lastLocation', captainId, p.lat, p.lng)
          .catch(() => undefined);
      }
    }
  }

  /** زاوية بدء شبه-عشوائية ثابتة لكل كابتن (من غير Math.random عشان الاختبارات). */
  private pseudoAngle(seed: string): number {
    return (this.hash(seed) % 628) / 100; // 0..2π تقريباً
  }

  /** انحراف بسيط في الاتجاه كل خطوة — بيخلّي المسار منحني مش خط مستقيم. */
  private wander(captainId: string, tick: number): number {
    return ((this.hash(captainId + '#' + tick) % 40) - 20) / 200; // ±0.1 راديان تقريباً
  }

  private hash(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }
}
