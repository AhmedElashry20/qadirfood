// شاشة ٧: الرئيسية — خريطة + زر كبير أونلاين/أوفلاين + ملخص اليوم.
//
// ══════════════════════════════════════════════════════════════════════════
//                    إيه الحقيقي وإيه اللي مالوش مصدر هنا
// ══════════════════════════════════════════════════════════════════════════
//  ✅ «طلبات اليوم» و«أرباح اليوم» — محسوبين من GET /orders?status[]=DELIVERED
//     (مافيش endpoint للأرباح، الحساب بيتم على الجهاز في EarningsRepository).
//  ✅ «عندك رحلة شغالة» — من GET /orders بفلتر حالات الرحلة الجارية.
//  ❌ «ساعات متصل» — **مافيش أي مصدر**: جدول `shifts` مالوش controller ومافيش
//     تتبّع لوقت الأونلاين. بنعرض «—» ومابنخترعش رقم.
//  ⚠️ حالة أونلاين/أوفلاين سوكيت بس ومافيش REST يقراها، فبتبدأ أوفلاين مع كل
//     تشغيل للتطبيق (شوف providers/captain_status_provider.dart).
//
// ملاحظة على البروڤايدرز المحلية تحت: `earningsProvider` و `activeTripProvider`
// بتوع إجنت تاني (lib/providers/earnings_provider.dart و active_trip_provider.dart)،
// فبنقرا من الـ repositories مباشرة هنا عشان مانتعلّقش بملفات لسه بتتكتب.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/enums.dart';
import '../../core/format.dart' as fmt;
import '../../core/location_service.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../data/captain_repository.dart';
import '../../models/earnings.dart';
import '../../models/order.dart';
import '../../models/trip_offer.dart';
import '../../providers/auth_provider.dart';
import '../../providers/captain_status_provider.dart';
import '../../providers/face_provider.dart';
import '../../providers/trip_offer_provider.dart';
import '../../widgets/big_toggle.dart';
import '../../widgets/map_view.dart';

/// ملخص النهاردة — محسوب على الجهاز (مافيش endpoint للأرباح).
/// autoDispose عشان الرئيسية بتتشال من الشجرة وقت الرحلة (context.go)، فأول ما
/// الكابتن يرجع بعد التوصيل يتعمل fetch جديد بدل ما القيمة القديمة تتجمّد.
final _todaySummaryProvider = FutureProvider.autoDispose<EarningsSummary>(
  (ref) => ref.watch(earningsRepositoryProvider).summary(EarningsRange.today),
);

/// الرحلة الجارية — أول طلب حالته CAPTAIN_ASSIGNED / PICKED_UP / ON_THE_WAY.
/// autoDispose برضه — كارت «عندك رحلة شغالة» لازم يختفي أول ما الكابتن يرجع
/// للرئيسية بعد ما يسلّم، مش يفضل ظاهر على القيمة المخزّنة.
final _activeTripProvider = FutureProvider.autoDispose<CaptainTrip?>(
  (ref) => ref.watch(tripsRepositoryProvider).active(),
);

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(captainStatusProvider);
    final activeTrip = ref.watch(_activeTripProvider).valueOrNull;

    // أول ما عرض يوصل على السوكيت نفتح شاشة العرض فوق الرئيسية.
    // الشرط `previous == null` بيمنع فتحها مرتين لو الحالة اتحدّثت وهي مفتوحة.
    ref.listen<TripOffer?>(tripOfferProvider, (previous, next) {
      if (next != null && previous == null) context.push(QRoutes.offer);
    });

    // آخر موقت معروف — الخريطة بتتمركز عليه أول ما تتبني.
    // (LocationBroadcaster مش Notifier، فالمركز مابيتحدّثش لوحده مع كل تحديث.)
    final center = ref.read(locationBroadcasterProvider).lastKnown ?? kRiyadh;

    return Scaffold(
      backgroundColor: QColors.inkSurface,
      body: Stack(
        children: [
          Positioned.fill(
            child: QMap(center: center, captain: center, zoom: 14),
          ),

          // ── الشريط العلوي ──
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const _AvatarTile(),
                  _StatusPill(status: status),
                ],
              ),
            ),
          ),

          // ── الشيت السفلي ──
          Align(
            alignment: Alignment.bottomCenter,
            child: _BottomSheet(status: status, activeTrip: activeTrip),
          ),
        ],
      ),
    );
  }
}

/// مربع الحرف الأول — بيودّي للملف الشخصي.
class _AvatarTile extends ConsumerWidget {
  const _AvatarTile();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // [captainProvider] ممكن يرمي (الكابتن لسه ملوش طلبات) — ساعتها بنرجع
    // لاسم الجلسة، ولو مافيش بنعرض «؟».
    final captain = ref.watch(captainProvider).valueOrNull;
    final fallback = ref.watch(authProvider).fullName.trim();
    final initial = captain?.initial ?? (fallback.isEmpty ? '؟' : fallback.substring(0, 1));

    return InkWell(
      onTap: () => context.push(QRoutes.profile),
      borderRadius: BorderRadius.circular(QRadius.md),
      child: Container(
        width: 44,
        height: 44,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: QColors.inkSurface,
          borderRadius: BorderRadius.circular(QRadius.md),
          boxShadow: kFloatShadow,
        ),
        child: Text(
          initial,
          style: TextStyle(
            fontFamily: 'Cairo',
            fontSize: 18,
            fontWeight: FontWeight.w900,
            color: QColors.brand,
          ),
        ),
      ),
    );
  }
}

/// كبسولة الحالة البيضا — نقطة ملوّنة + نص الحالة.
class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.status});

  final CaptainStatus status;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
      decoration: BoxDecoration(
        color: QColors.surface,
        borderRadius: BorderRadius.circular(QRadius.pill),
        boxShadow: kFloatShadow,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(color: status.color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 8),
          Text(
            status.ar,
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 12.5,
              fontWeight: FontWeight.w800,
              color: QColors.ink,
            ),
          ),
        ],
      ),
    );
  }
}

class _BottomSheet extends ConsumerWidget {
  const _BottomSheet({required this.status, required this.activeTrip});

  final CaptainStatus status;
  final CaptainTrip? activeTrip;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(_todaySummaryProvider).valueOrNull;
    final trip = activeTrip;

    // بوابة التحقق اليومي بالوجه — بنقراها بأمان: لو الـ endpoint وقع (`valueOrNull`
    // = null) مابنقفلش الرئيسية، بنسيب الزرار يشتغل عادي بدل ما نحبس الكابتن.
    final faceToday = ref.watch(faceTodayProvider).valueOrNull;
    final needsFaceCheck = faceToday != null && !faceToday.verifiedToday;

    return Container(
      width: double.infinity,
      // الشيت جوّه Stack فوق خريطة full-bleed، فهو راكب عليها أصلاً — ده اللي
      // التصميم بيسمّيه «تداخل ٢٤ بكسل» (نفس مقدار راديوس الشيت).
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 30),
      decoration: BoxDecoration(
        color: QColors.inkSurface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(QRadius.sheet)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 44,
              height: 5,
              decoration: BoxDecoration(
                color: QColors.inkLine,
                borderRadius: BorderRadius.circular(QRadius.pill),
              ),
            ),
            const SizedBox(height: QSpace.gapLg),

            // ── مؤشرات اليوم ──
            Row(
              children: [
                Expanded(
                  child: _Kpi(
                    value: summary == null ? '—' : '${summary.todayOrders}',
                    label: 'طلبات اليوم',
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _Kpi(
                    value: summary == null ? '—' : fmt.money(summary.todayTotal),
                    label: 'أرباح اليوم (ر.س)',
                  ),
                ),
                const SizedBox(width: 10),
                // مافيش مصدر لساعات الأونلاين — «—» مش صفر.
                const Expanded(child: _Kpi(value: '—', label: 'ساعات متصل')),
              ],
            ),
            const SizedBox(height: QSpace.gapLg),

            // ── استلامات الحرم (لمندوب المشي) ──
            InkWell(
              onTap: () => context.push(QRoutes.relayIncoming),
              borderRadius: BorderRadius.circular(14),
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: QColors.surface,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: QColors.line),
                ),
                child: Row(
                  children: [
                    const Text('🕋', style: TextStyle(fontSize: 24)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('استلامات الحرم', style: QText.body.copyWith(fontWeight: FontWeight.w800)),
                          Text(
                            'لمندوب المشي — استلم الطلبات عند البوابة',
                            style: QText.tiny.copyWith(color: QColors.label),
                          ),
                        ],
                      ),
                    ),
                    Icon(Icons.chevron_left, color: QColors.faint),
                  ],
                ),
              ),
            ),
            const SizedBox(height: QSpace.gapLg),

            // رحلة شغالة بتحل محل الزرار الكبير — الكابتن مالوش حق يبقى
            // «متاح» وهو ماسك طلب.
            if (trip != null)
              _ActiveTripCard(trip: trip)
            // تحقّق يومي مطلوب — بنحطّ كارت البوابة بدل الزرار الكبير.
            else if (needsFaceCheck)
              const _FaceGateCard()
            else
              QBigToggle(
                online: status.isOnline,
                // بوابة أمان زيادة: حتى لو الزرار ظهر، مانخلّيش الكابتن يبقى
                // أونلاين قبل تحقّق النهاردة — بنوجّهه للتحقق بدل كده.
                onChanged: (value) {
                  if (value && needsFaceCheck) {
                    context.push(QRoutes.dailyFace);
                    return;
                  }
                  ref.read(captainStatusProvider.notifier).setOnline(value);
                },
              ),
          ],
        ),
      ),
    );
  }
}

class _Kpi extends StatelessWidget {
  const _Kpi({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: QColors.inkSoft,
        borderRadius: BorderRadius.circular(QRadius.md),
      ),
      child: Column(
        children: [
          Text(value, style: QText.num(size: 18, color: QColors.brand)),
          const SizedBox(height: 4),
          Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: QColors.darkSub,
            ),
          ),
        ],
      ),
    );
  }
}

/// كارت بوابة التحقق اليومي — بيحل محل الزرار الكبير لما الكابتن ماتحقّقش
/// النهاردة، وبيودّي لشاشة التصوير. (نفس ستايل [_ActiveTripCard] بس داكن.)
class _FaceGateCard extends StatelessWidget {
  const _FaceGateCard();

  @override
  Widget build(BuildContext context) {
    return Material(
      color: QColors.inkSoft,
      borderRadius: BorderRadius.circular(QRadius.lg),
      child: InkWell(
        onTap: () => context.push(QRoutes.dailyFace),
        borderRadius: BorderRadius.circular(QRadius.lg),
        child: Container(
          constraints: const BoxConstraints(minHeight: QSpace.tapTarget),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              const Text('🤳', style: TextStyle(fontSize: 24)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'مطلوب تحقّق يومي بالوجه',
                      style: TextStyle(
                        fontFamily: 'Cairo',
                        fontSize: 15,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'صوّر سيلفي قبل ما تبدأ الشغل',
                      style: TextStyle(
                        fontFamily: 'Cairo',
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: QColors.darkSub,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
                decoration: BoxDecoration(
                  color: QColors.brand,
                  borderRadius: BorderRadius.circular(QRadius.pill),
                ),
                child: Text(
                  'ابدأ التحقق',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 13,
                    fontWeight: FontWeight.w900,
                    color: QColors.ink,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ActiveTripCard extends StatelessWidget {
  const _ActiveTripCard({required this.trip});

  final CaptainTrip trip;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: QColors.brand,
      borderRadius: BorderRadius.circular(QRadius.lg),
      child: InkWell(
        onTap: () => context.go(QRoutes.trip(trip.id)),
        borderRadius: BorderRadius.circular(QRadius.lg),
        child: Container(
          constraints: const BoxConstraints(minHeight: QSpace.tapTarget),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text.rich(
                      TextSpan(
                        text: 'عندك رحلة شغالة — ',
                        style: TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 15,
                          fontWeight: FontWeight.w900,
                          color: QColors.ink,
                        ),
                        children: [
                          TextSpan(
                            text: fmt.ltr(trip.number),
                            style: QText.num(size: 15, color: QColors.ink),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      trip.stepLabel,
                      style: TextStyle(
                        fontFamily: 'Cairo',
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: QColors.goldOnBrand,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Text(
                'افتح الرحلة ←',
                style: TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 13.5,
                  fontWeight: FontWeight.w900,
                  color: QColors.ink,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
