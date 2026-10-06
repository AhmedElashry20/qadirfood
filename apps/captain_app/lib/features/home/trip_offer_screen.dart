// شاشة ٨ ⭐: عرض مهمة — المطعم، المسافة، المستحق، عداد تنازلي + صوت تنبيه.
//
// الشاشة دي بتتفتح **لوحدها** من الرئيسية أول ما عرض يوصل على السوكيت
// (`ref.listen` على [tripOfferProvider] في home_screen.dart).
//
// دورة حياة العرض:
//   • بيوصل على `trip:offer` → الشاشة بتتفتح والصوت بيرن كل ٤ ثواني.
//   • «قبول» → `trip:offer_response` ثم بنستنى `trip:offer_result`. القبول
//     **سباق بين الكباتن**: `won: false` معناها كابتن تاني سبقنا.
//   • «رفض» → `trip:offer_response` وبنقفل على طول (مافيش نتيجة نستناها).
//   • المهلة خلصت (العدّاد أو `trip:offer_expired`) → بنقفل برسالة.
//
// ⚠️ العرض بيعيش في الذاكرة بس — مافيش endpoint يجيب العروض المعلّقة، فلو
// الشاشة اتقفلت بأي طريقة تانية العرض بيضيع خالص.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/location_service.dart';
import '../../core/router.dart';
import '../../core/sound_service.dart';
import '../../core/theme.dart';
import '../../models/trip_offer.dart';
import '../../providers/captain_status_provider.dart';
import '../../providers/trip_offer_provider.dart';
import '../../widgets/map_view.dart';
import '../../widgets/trip_offer_card.dart';

/// تعتيم الخريطة ورا الشيت — نفس `filter: brightness(0.55)` في التصميم.
const _kDim = ColorFilter.matrix(<double>[
  0.55, 0, 0, 0, 0, //
  0, 0.55, 0, 0, 0, //
  0, 0, 0.55, 0, 0, //
  0, 0, 0, 1, 0, //
]);

class TripOfferScreen extends ConsumerStatefulWidget {
  const TripOfferScreen({super.key});

  @override
  ConsumerState<TripOfferScreen> createState() => _TripOfferScreenState();
}

class _TripOfferScreenState extends ConsumerState<TripOfferScreen> {
  /// نسخة محلية من العرض — بتفضل موجودة بعد ما البروڤايدر يتفضّى عشان الشاشة
  /// ماتفضاش وهي بتقفل.
  TripOffer? _snapshot;

  /// بنستنى نتيجة السباق.
  bool _busy = false;

  /// إحنا اللي بنقفل الشاشة (قبول/رفض/انتهاء) — بيمنع الـ listener من تكرار الإغلاق.
  bool _handled = false;

  /// بنمسك الخدمة في متغير عشان `dispose` ماتحتاجش `ref`.
  late final AlertSoundService _sound = ref.read(alertSoundProvider);

  @override
  void initState() {
    super.initState();
    // الصوت بيرن لحد ما الشاشة تقفل — الكابتن ماسك الموبايل وهو ماشي.
    WidgetsBinding.instance.addPostFrameCallback((_) => _sound.startRepeating());
  }

  @override
  void dispose() {
    _sound.stop();
    super.dispose();
  }

  void _close({String? message}) {
    if (_handled) return;
    _handled = true;

    _sound.stop();
    ref.read(tripOfferProvider.notifier).clear();

    if (message != null) _snack(context, message);
    if (context.mounted && context.canPop()) context.pop();
  }

  Future<void> _accept() async {
    final offer = _snapshot;
    if (_busy || offer == null) return;

    setState(() {
      _busy = true;
      // بنمنع الـ listener من القفل لما البروڤايدر يتفضّى جوّه accept().
      _handled = true;
    });

    try {
      final won = await ref.read(tripOfferProvider.notifier).accept();
      if (!context.mounted) return;

      _sound.stop();

      if (won) {
        // بقينا في رحلة: بنبعت الحالة للسيرفر وبنبدأ بث الموقع بالـ orderId
        // (من غيره الموقع مايوصلش لشاشة تتبّع العميل).
        ref.read(captainStatusProvider.notifier).setOnTrip(orderId: offer.orderId);
        context.go(QRoutes.trip(offer.orderId));
        return;
      }

      _snack(context, 'أُسنِد الطلب لكابتن آخر');
      if (context.canPop()) context.pop();
    } on ApiException catch (e) {
      if (!context.mounted) return;
      _snack(context, e.message);
      setState(() {
        _busy = false;
        _handled = false;
      });
    }
  }

  Future<void> _reject() async {
    final offer = _snapshot;
    if (_busy || offer == null) return;

    _handled = true;
    await ref.read(tripOfferProvider.notifier).reject();
    if (!context.mounted) return;

    _sound.stop();
    if (context.canPop()) context.pop();
  }

  @override
  Widget build(BuildContext context) {
    final offer = ref.watch(tripOfferProvider);
    if (offer != null) _snapshot = offer;

    // العرض اتلغى من السيرفر (`trip:offer_expired` / `trip:cancelled`) وإحنا
    // مش بنقفل بنفسنا — يبقى المهلة خلصت.
    ref.listen<TripOffer?>(tripOfferProvider, (previous, next) {
      if (next == null && !_handled) _close(message: 'انتهت مهلة العرض');
    });

    final current = _snapshot;
    if (current == null) {
      // اتفتحت من غير عرض (مسار مباشر) — بنقفل بهدوء.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (context.mounted && context.canPop()) context.pop();
      });
      return Scaffold(backgroundColor: QColors.inkSurface);
    }

    final center =
        current.pickupPoint ?? ref.read(locationBroadcasterProvider).lastKnown ?? kRiyadh;

    return Scaffold(
      backgroundColor: QColors.inkSurface,
      body: Stack(
        children: [
          Positioned.fill(
            child: ColorFiltered(
              colorFilter: _kDim,
              child: QMap(
                center: center,
                captain: ref.read(locationBroadcasterProvider).lastKnown,
                destination: current.dropoffPoint,
                zoom: 13,
                // خلفية بس — مايتحركش تحت الشيت.
                interactive: false,
              ),
            ),
          ),
          Align(
            alignment: Alignment.bottomCenter,
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.fromLTRB(24, 22, 24, 30),
              decoration: BoxDecoration(
                color: QColors.surface,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
                boxShadow: kFloatShadow,
              ),
              child: SafeArea(
                top: false,
                child: QTripOfferCard(
                  offer: current,
                  accepting: _busy,
                  onAccept: _accept,
                  onReject: _reject,
                  onExpired: () => _close(message: 'انتهت مهلة العرض'),
                ),
              ),
            ),
          ),
        ],
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
        behavior: SnackBarBehavior.floating,
        content: Text(
          message,
          style: TextStyle(
            fontFamily: 'Cairo',
            fontSize: 13.5,
            fontWeight: FontWeight.w700,
            color: QColors.brand,
          ),
        ),
      ),
    );
}
