// شاشة ١١: الطريق للعميل — خريطة + بث الموقع كل ٥ ثواني + بيانات العميل + زر اتصال.
//
// ══════════════════════════════════════════════════════════════════════════
//                    إيه الحقيقي وإيه اللي مالوش مصدر هنا
// ══════════════════════════════════════════════════════════════════════════
//  ✅ **جوال العميل حقيقي** — `customer.user.phone` بييجي في رد الطلب.
//     بس **url_launcher مش متثبت في pubspec** فمافيش فتح لتطبيق الاتصال؛
//     بنعرض الرقم في SnackBar لحد ما الحزمة تتضاف.
//  ✅ إحداثيات العنوان — `address.lat/lng` من GET /orders/:id.
//  ✅ ملاحظات العنوان — `address.notes`.
//  ⚠️ المسافة والوقت تقديريان على خط مستقيم — مافيش routing API.
//  ❌ **المحادثة مع العميل** — مافيش أي مسار شات في الـ API.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/enums.dart';
import '../../core/format.dart' as fmt;
import '../../core/location_service.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../models/order.dart';
import '../../providers/active_trip_provider.dart';
import '../../widgets/common.dart';
import '../../widgets/map_view.dart';

/// نفس تقدير شاشة الطريق للمطعم — ٣ دقايق/كم، **مش من routing API**.
const _kMinutesPerKm = 3;

class ToCustomerScreen extends ConsumerStatefulWidget {
  const ToCustomerScreen({super.key, required this.orderId});

  final String orderId;

  @override
  ConsumerState<ToCustomerScreen> createState() => _ToCustomerScreenState();
}

class _ToCustomerScreenState extends ConsumerState<ToCustomerScreen> {
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    // الرحلة مكمّلة — البث بيفضل شغال بنفس الـ orderId عشان شاشة تتبّع العميل
    // تشوف الكابتن. setOrder(null) بيتنادى في شاشة تأكيد التسليم بس.
    ref.read(locationBroadcasterProvider).start(orderId: widget.orderId);
  }

  /// «وصلت للعميل»: بننقل الحالة لـ ON_THE_WAY **بس لو لسه PICKED_UP**،
  /// عشان لو الكابتن رجع للشاشة دي مانبعتش تحويل غير قانوني والسيرفر يرفضه.
  Future<void> _arrived(CaptainTrip trip) async {
    // طلب داخل الحرم: مندوب المركبة مايوصّلش للعميل — بيسلّم عند البوابة لمندوب المشي.
    if (trip.requiresRelay) {
      unawaited(context.push(QRoutes.relayHandoff(trip.id)));
      return;
    }
    if (trip.status != OrderStatus.pickedUp) {
      unawaited(context.push(QRoutes.tripDeliver(trip.id)));
      return;
    }

    setState(() => _submitting = true);

    try {
      await ref.read(activeTripProvider.notifier).onTheWay(trip.id);
      if (!mounted) return;
      setState(() => _submitting = false);
      unawaited(context.push(QRoutes.tripDeliver(trip.id)));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _submitting = false);
      _snack(context, e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _submitting = false);
      _snack(context, 'تعذّر تحديث حالة الرحلة — حاول مرة أخرى');
    }
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
        data: (trip) => _Body(
          trip: trip,
          submitting: _submitting,
          onArrived: () => _arrived(trip),
        ),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({required this.trip, required this.submitting, required this.onArrived});

  final CaptainTrip trip;
  final bool submitting;
  final VoidCallback onArrived;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final captain = ref.read(locationBroadcasterProvider).lastKnown;
    final destination = trip.dropoffPoint;
    final center = destination ?? captain ?? kRiyadh;
    final km = (captain != null && destination != null) ? distanceKm(captain, destination) : null;

    return Column(
      children: [
        _NavHeader(
          instruction: 'الملاحة للعميل',
          address: [trip.addressLabel, trip.addressDetails]
              .where((part) => part.trim().isNotEmpty)
              .join(' · '),
          distanceKm: km,
        ),
        Expanded(
          child: Stack(
            children: [
              Positioned.fill(
                child: QMap(center: center, zoom: 14, captain: captain, destination: destination),
              ),
              Align(
                alignment: Alignment.bottomCenter,
                child: _CustomerSheet(
                  trip: trip,
                  submitting: submitting,
                  onArrived: onArrived,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// هيدر الملاحة الأسود — نفس شكل شاشة الطريق للمطعم.
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

/// شيت بيانات العميل + زرار «وصلت للعميل».
class _CustomerSheet extends StatelessWidget {
  const _CustomerSheet({
    required this.trip,
    required this.submitting,
    required this.onArrived,
  });

  final CaptainTrip trip;
  final bool submitting;
  final VoidCallback onArrived;

  String get _initial {
    final name = trip.customerName.trim();
    return name.isEmpty ? '؟' : name.substring(0, 1);
  }

  /// «البيت · النرجس · شارع الأمير سلطان» + ملاحظة العنوان بين قوسين لو موجودة.
  String get _addressLine {
    final base = [trip.addressLabel, trip.addressDetails]
        .where((part) => part.trim().isNotEmpty)
        .join(' · ');
    final notes = trip.addressNotes?.trim();
    return (notes == null || notes.isEmpty) ? base : '$base «$notes»';
  }

  @override
  Widget build(BuildContext context) {
    final phone = trip.customerPhone?.trim();

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
              Container(
                width: 46,
                height: 46,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: QColors.inkSurface, shape: BoxShape.circle),
                child: Text(
                  _initial,
                  style: QText.section.copyWith(color: QColors.brand, fontSize: 18),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'التسليم لـ ${trip.customerName.isEmpty ? 'العميل' : trip.customerName}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: QText.cardTitle.copyWith(fontSize: 15.5, fontWeight: FontWeight.w900),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      _addressLine,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: QText.tiny.copyWith(fontSize: 12.5, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              // الرقم موجود فعلاً — اللي ناقص هو حزمة فتح تطبيق الاتصال.
              _RoundAction(
                emoji: '📞',
                background: (phone == null || phone.isEmpty) ? QColors.chip : QColors.brand,
                onTap: () => _snack(
                  context,
                  (phone == null || phone.isEmpty)
                      ? 'رقم العميل غير موجود في الطلب'
                      : 'جاري الاتصال بـ ${fmt.ltr(phone)}',
                ),
              ),
              const SizedBox(width: 8),
              _RoundAction(
                emoji: '💬',
                background: QColors.chip,
                // `trip.id` هو معرّف الطلب — المحادثة مربوطة بالطلب مش بالعميل.
                onTap: () => context.push(QRoutes.orderChat, extra: trip.id),
              ),
            ],
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: QButton(
              label: 'وصلت للعميل',
              style: QButtonStyle.dark,
              loading: submitting,
              onPressed: onArrived,
            ),
          ),
        ],
      ),
    );
  }
}

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
