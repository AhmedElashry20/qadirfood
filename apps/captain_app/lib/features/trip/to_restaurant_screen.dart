// شاشة ٩: الطريق للمطعم — خريطة + توجيه + زر «وصلت للمطعم».
//
// ══════════════════════════════════════════════════════════════════════════
//                    إيه الحقيقي وإيه اللي مالوش مصدر هنا
// ══════════════════════════════════════════════════════════════════════════
//  ✅ بيانات الرحلة وإحداثيات الفرع — GET /orders/:id (بيعدّي على mapOrder).
//  ✅ بث موقع الكابتن — سوكيت `captain:location` كل ٥ ثواني عشان شاشة تتبّع
//     العميل تشوفه بيتحرك (LocationBroadcaster.start بـ orderId).
//  ⚠️ **المسافة والوقت تقديريان على خط مستقيم** — مافيش routing API (لا Google
//     Directions ولا OSRM متوصّل). المسافة من distanceKm() والوقت ≈ ٣ دقايق/كم.
//  ❌ **رقم تليفون الفرع مش موجود في رد الطلب** — mapOrder بيرجّع branch.nameAr
//     و branch.address و lat/lng بس. فزرار الاتصال بالمطعم موقوف بوضوح.
//  ❌ **المحادثة** — مافيش أي مسار شات في الـ API.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/format.dart' as fmt;
import '../../core/location_service.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../models/order.dart';
import '../../providers/active_trip_provider.dart';
import '../../widgets/common.dart';
import '../../widgets/map_view.dart';

/// تقدير الوقت: ٣ دقايق لكل كيلومتر — **مش من routing API**، مجرد تقريب
/// لسرعة مدينة ~٢٠ كم/س. لو اتوصّل محرك مسارات، الرقم ده يتشال.
const _kMinutesPerKm = 3;

class ToRestaurantScreen extends ConsumerStatefulWidget {
  const ToRestaurantScreen({super.key, required this.orderId});

  final String orderId;

  @override
  ConsumerState<ToRestaurantScreen> createState() => _ToRestaurantScreenState();
}

class _ToRestaurantScreenState extends ConsumerState<ToRestaurantScreen> {
  @override
  void initState() {
    super.initState();
    // بث الموقع مربوط بالطلب — من غير الـ orderId السيرفر مايعرفش الموقع ده
    // بتاع أنهي طلب وشاشة تتبّع العميل بتفضل فاضية.
    // ومابنعملش setOrder(null) هنا: الرحلة لسه شغالة لحد شاشة التسليم.
    ref.read(locationBroadcasterProvider).start(orderId: widget.orderId);
  }

  @override
  Widget build(BuildContext context) {
    final tripAsync = ref.watch(tripProvider(widget.orderId));

    return Scaffold(
      backgroundColor: QColors.inkSurface,
      body: tripAsync.when(
        loading: () => const QLoading(),
        error: (error, _) => SafeArea(
          child: QErrorView(
            message: error is ApiException ? error.message : 'تعذّر تحميل بيانات الرحلة',
            onRetry: () => ref.invalidate(tripProvider(widget.orderId)),
          ),
        ),
        data: (trip) => _Body(trip: trip),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({required this.trip});

  final CaptainTrip trip;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // آخر موقع معروف — LocationBroadcaster مش Notifier فمافيش إعادة بناء تلقائية
    // مع كل تحديث؛ الشاشة بتقرا آخر نقطة عند البناء.
    final captain = ref.read(locationBroadcasterProvider).lastKnown;
    final destination = trip.pickupPoint;
    final center = destination ?? captain ?? kRiyadh;

    // المسافة بتتحسب بس لما نعرف النقطتين — غير كده بنعرض العنوان من غير أرقام.
    final km = (captain != null && destination != null) ? distanceKm(captain, destination) : null;

    return Column(
      children: [
        _NavHeader(
          instruction: 'الملاحة للمطعم',
          address: trip.restaurantAddress,
          distanceKm: km,
        ),
        Expanded(
          child: Stack(
            children: [
              Positioned.fill(
                child: QMap(center: center, zoom: 14, captain: captain, destination: destination),
              ),
              Align(alignment: Alignment.bottomCenter, child: _PickupSheet(trip: trip)),
            ],
          ),
        ),
      ],
    );
  }
}

/// هيدر الملاحة الأسود — مربع السهم + التعليمة + العنوان + الوقت المقدّر.
class _NavHeader extends StatelessWidget {
  const _NavHeader({required this.instruction, required this.address, this.distanceKm});

  final String instruction;
  final String address;
  final double? distanceKm;

  @override
  Widget build(BuildContext context) {
    final km = distanceKm;
    final minutes = km == null ? null : (km * _kMinutesPerKm).round();

    return QDarkHeader(
      height: 118,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Container(
            width: 46,
            height: 46,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: QColors.brand,
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Text('⬆️', style: TextStyle(fontSize: 22)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                // «متبقي 2.4 كم — الملاحة للمطعم»، أو التعليمة لوحدها لو المسافة مجهولة.
                Text.rich(
                  TextSpan(
                    children: [
                      if (km != null) ...[
                        const TextSpan(text: 'متبقي '),
                        TextSpan(
                          text: fmt.ltr('${fmt.money(km)} كم'),
                          style: QText.num(size: 17, weight: FontWeight.w900, color: Colors.white),
                        ),
                        const TextSpan(text: ' — '),
                      ],
                      TextSpan(text: instruction),
                    ],
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 17,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                  ),
                ),
                if (address.trim().isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    address,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontFamily: 'Cairo',
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                      color: QColors.darkSub,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (minutes != null) ...[
            const SizedBox(width: 10),
            Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                QLtr(
                  child: Text(
                    '$minutes',
                    style: QText.num(size: 17, weight: FontWeight.w800, color: QColors.brand),
                  ),
                ),
                Text(
                  'دقائق',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 10.5,
                    fontWeight: FontWeight.w700,
                    color: QColors.darkSub,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// الشيت الأبيض — بيانات الاستلام + زرار «وصلت للمطعم».
class _PickupSheet extends StatelessWidget {
  const _PickupSheet({required this.trip});

  final CaptainTrip trip;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(QSpace.screenH, 18, QSpace.screenH, 30),
      decoration: BoxDecoration(
        color: QColors.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(QRadius.sheet)),
        boxShadow: kFloatShadow,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'الاستلام من ${trip.restaurantName}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: QText.cardTitle.copyWith(fontSize: 16, fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      'طلب ${fmt.ltr(trip.number)} · ${fmt.ltr('${trip.itemCount}')} صنف',
                      style: QText.tiny.copyWith(fontSize: 12.5, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
              // رقم الفرع مش في رد الطلب — الزرار شكله موجود بس بيقول الحقيقة.
              _RoundAction(
                emoji: '📞',
                background: QColors.chip,
                onTap: () => _snack(context, 'رقم المطعم غير متاح في الـ API'),
              ),
              const SizedBox(width: 8),
              _RoundAction(
                emoji: '💬',
                background: QColors.chip,
                onTap: () => _snack(context, 'المحادثة قريباً'),
              ),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: QButton(
              label: 'وصلت للمطعم',
              style: QButtonStyle.dark,
              onPressed: () => context.push(QRoutes.tripPickup(trip.id)),
            ),
          ),
        ],
      ),
    );
  }
}

/// زرار دايري ٤٢×٤٢ (اتصال / محادثة).
class _RoundAction extends StatelessWidget {
  const _RoundAction({required this.emoji, required this.background, this.onTap});

  final String emoji;
  final Color background;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: Container(
        width: 42,
        height: 42,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: background, shape: BoxShape.circle),
        child: Text(emoji, style: const TextStyle(fontSize: 18)),
      ),
    );
  }
}

void _snack(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        backgroundColor: QColors.inkSurface,
        content: Text(
          message,
          style: QText.body.copyWith(fontSize: 14, color: QColors.brand),
        ),
      ),
    );
}
