// شاشة ٢١ ⭐: تتبع الطلب لحظياً — Socket.IO حقيقي:
// * موقع الكابتن بيتحرّك مع كل `captain:location`.
// * شريط المراحل بيتحرّك مع `order:status_changed`.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import '../../core/api_client.dart';
import '../../core/enums.dart';
import '../../core/format.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../models/order.dart';
import '../../providers/order_tracking_provider.dart';
import '../../providers/orders_provider.dart';
import '../../widgets/common.dart';
import '../../widgets/live_map.dart';
import '../../widgets/order_status_stepper.dart';

class LiveTrackingScreen extends ConsumerWidget {
  const LiveTrackingScreen({super.key, required this.orderId});

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tracking = ref.watch(orderTrackingProvider(orderId));

    // الكابتن بيتعيّن أثناء الطلب — البروڤايدر بيعيد تحميل الطلب أول ما الحالة تتغيّر.
    final captain = ref.watch(orderProvider(orderId)).value?.captain;

    return Scaffold(
      backgroundColor: QColors.canvas,
      body: tracking.when(
        loading: () => Center(child: CircularProgressIndicator(color: QColors.brand)),
        error: (e, _) => _ErrorView(
          message: e is ApiException ? e.message : 'تعذّر تحميل تتبع الطلب',
          onRetry: () => ref.invalidate(orderTrackingProvider(orderId)),
        ),
        data: (t) => _TrackingView(orderId: orderId, tracking: t, captain: captain),
      ),
    );
  }
}

class _TrackingView extends StatelessWidget {
  const _TrackingView({required this.orderId, required this.tracking, required this.captain});

  final String orderId;
  final TrackingState tracking;
  final Captain? captain;

  @override
  Widget build(BuildContext context) {
    final t = tracking;
    final delivered = t.status == OrderStatus.delivered;

    return Stack(
      fit: StackFit.expand,
      children: [
        // ── الخريطة: ماركر الكابتن بيتحرّك مع كل `captain:location` ──
        LiveMap(
          center: LatLng(t.captainLat, t.captainLng),
          zoom: 14,
          captain: LatLng(t.captainLat, t.captainLng),
          destination: LatLng(t.destLat, t.destLng),
        ),

        // ── رجوع + شارة الوصول المتوقع ──
        SafeArea(
          child: Align(
            alignment: Alignment.topCenter,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  // الشاشة بتتفتح بـ go بعد الدفع (ستاك فاضي) — فـ maybePop مش هيرجع لحاجة.
                  QBackButton(
                    light: true,
                    onTap: () => context.canPop() ? context.pop() : context.go(QRoutes.home),
                  ),
                  const Spacer(),
                  _EtaPill(minutes: t.etaMinutes, delivered: delivered),
                ],
              ),
            ),
          ),
        ),

        // ── الشيت السفلي: المراحل + الكابتن ──
        Align(
          alignment: Alignment.bottomCenter,
          child: Container(
            width: double.infinity,
            decoration: BoxDecoration(
              color: QColors.surface,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(QRadius.sheet)),
              boxShadow: kFloatShadow,
            ),
            padding: EdgeInsets.fromLTRB(
              QSpace.screenH,
              20,
              QSpace.screenH,
              20 + MediaQuery.of(context).padding.bottom,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(
                  child: Container(
                    width: 44,
                    height: 5,
                    decoration: BoxDecoration(
                      color: QColors.border,
                      borderRadius: BorderRadius.circular(QRadius.pill),
                    ),
                  ),
                ),
                const SizedBox(height: QSpace.gapLg),
                OrderStatusStepper(status: t.status),
                if (captain != null) ...[
                  const SizedBox(height: QSpace.gapLg),
                  _CaptainCard(captain: captain!, orderId: orderId),
                ] else if (!delivered) ...[
                  const SizedBox(height: QSpace.gapLg),
                  const _NoCaptainCard(),
                ],
                if (delivered) ...[
                  const SizedBox(height: QSpace.gapLg),
                  QButton(
                    label: 'قيّم الطلب ★',
                    // push مش go — شاشة التقييم بتعمل pop لما تخلص.
                    onPressed: () => context.push(QRoutes.rate(orderId)),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

/// «⏱ يوصل خلال 12 دقيقة» — بيل أسود فوق الخريطة.
class _EtaPill extends StatelessWidget {
  const _EtaPill({required this.minutes, required this.delivered});

  final int minutes;
  final bool delivered;

  static final _text = TextStyle(
    fontFamily: 'Cairo',
    fontSize: 13,
    fontWeight: FontWeight.w800,
    color: QColors.brand,
  );

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: QColors.inkSurface,
        borderRadius: BorderRadius.circular(QRadius.pill),
        boxShadow: kCardShadow,
      ),
      child: delivered
          ? Text('✓ تم التوصيل', style: _text)
          : Text.rich(
              TextSpan(
                children: [
                  const TextSpan(text: '⏱ يوصل خلال '),
                  TextSpan(
                    text: '$minutes',
                    style: QText.num(size: 13, weight: FontWeight.w700, color: QColors.brand),
                  ),
                  const TextSpan(text: ' دقيقة'),
                ],
              ),
              style: _text,
            ),
    );
  }
}

/// كارت الكابتن: صورة + تقييم + اتصال/محادثة.
class _CaptainCard extends StatelessWidget {
  const _CaptainCard({required this.captain, required this.orderId});

  final Captain captain;

  /// محتاجينه لفتح المحادثة — الرسايل مربوطة بالطلب مش بالمندوب.
  final String orderId;

  @override
  Widget build(BuildContext context) {
    final phone = captain.phone;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: QColors.canvas,
        borderRadius: BorderRadius.circular(QRadius.lg),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: QColors.inkSurface, shape: BoxShape.circle),
            child: Text(
              captain.initial,
              style: QText.num(size: 17, weight: FontWeight.w800, color: QColors.brand),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${captain.name} — كابتن التوصيل',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 14.5,
                    fontWeight: FontWeight.w800,
                    color: QColors.ink,
                  ),
                ),
                const SizedBox(height: 2),
                Row(
                  children: [
                    Text(
                      '${rating(captain.rating)}★',
                      style: QText.num(size: 12, weight: FontWeight.w700, color: QColors.ink),
                    ),
                    Flexible(
                      child: Text(
                        ' · ${captain.vehicle}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: QColors.textMuted,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          _CircleAction(
            emoji: '📞',
            color: QColors.brand,
            // مافيش اتصال جوّه التطبيق لسه — بنعرض رقم الكابتن اللي جاي من الـ API.
            onTap: () => _snack(
              context,
              phone == null || phone.isEmpty ? 'قريباً' : 'جوال الكابتن: ${ltr(phone)}',
            ),
          ),
          const SizedBox(width: 8),
          _CircleAction(
            emoji: '💬',
            color: QColors.chip,
            onTap: () => context.push(QRoutes.orderChat, extra: orderId),
          ),
        ],
      ),
    );
  }
}

/// لسه مافيش كابتن متعيّن على الطلب.
class _NoCaptainCard extends StatelessWidget {
  const _NoCaptainCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: QColors.canvas,
        borderRadius: BorderRadius.circular(QRadius.lg),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: QColors.chip, shape: BoxShape.circle),
            child: const Text('🛵', style: TextStyle(fontSize: 20)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              'جاري تعيين كابتن…',
              style: TextStyle(
                fontFamily: 'Cairo',
                fontSize: 14.5,
                fontWeight: FontWeight.w800,
                color: QColors.ink,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CircleAction extends StatelessWidget {
  const _CircleAction({required this.emoji, required this.color, required this.onTap});

  final String emoji;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: Container(
        width: 42,
        height: 42,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        child: Text(emoji, style: const TextStyle(fontSize: 17)),
      ),
    );
  }
}

/// خطأ تحميل + إعادة محاولة.
class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Stack(
        children: [
          const Align(
            alignment: AlignmentDirectional.topStart,
            child: Padding(padding: EdgeInsets.all(16), child: QBackButton()),
          ),
          Center(
            child: Padding(
              padding: const EdgeInsets.all(QSpace.screenH),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(message, textAlign: TextAlign.center, style: QText.body),
                  const SizedBox(height: QSpace.gapLg),
                  QButton(label: 'إعادة المحاولة', onPressed: onRetry),
                ],
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
        content: Text(message, style: QText.body.copyWith(color: QColors.brand)),
        behavior: SnackBarBehavior.floating,
        backgroundColor: QColors.inkSurface,
        duration: const Duration(seconds: 3),
      ),
    );
}
