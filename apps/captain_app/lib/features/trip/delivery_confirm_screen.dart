// شاشة ١٢: تأكيد التسليم — تحصيل النقدي لو الدفع كاش + زر «تم التسليم».
//
// ══════════════════════════════════════════════════════════════════════════
//                    إيه الحقيقي وإيه اللي مالوش مصدر هنا
// ══════════════════════════════════════════════════════════════════════════
//  ✅ **الكاش المطلوب تحصيله** حقيقي — `order.total` مع `paymentStatus`/`paymentMethod`
//     (CaptainTrip.isPrepaid و cashToCollect). الطلب المدفوع إلكترونياً = صفر كاش.
//  ✅ **تأكيد التسليم** حقيقي — PATCH /orders/:id/delivered، وهو اللي بيقفل الحساب
//     المالي على السيرفر (بيحسب captainPayout ويزوّد المحفظة ويرجّع الكابتن ONLINE).
//  ✅ **إثبات التسليم (كود + صورة)** — بقى حقيقي: العميل بيعرض `deliveryCode`،
//     والمندوب بيدخّله + بيصوّر إثبات. `PATCH /orders/:id/delivered` بياخد
//     {code, photoUrl} والسيرفر بيتحقق من الكود ويخزّن الصورة.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/api_client.dart';
import '../../core/enums.dart';
import '../../core/format.dart' as fmt;
import '../../core/location_service.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../data/captain_repository.dart';
import '../../models/order.dart';
import '../../providers/active_trip_provider.dart';
import '../../providers/captain_status_provider.dart';
import '../../widgets/common.dart';

class DeliveryConfirmScreen extends ConsumerStatefulWidget {
  const DeliveryConfirmScreen({super.key, required this.orderId});

  final String orderId;

  @override
  ConsumerState<DeliveryConfirmScreen> createState() => _DeliveryConfirmScreenState();
}

class _DeliveryConfirmScreenState extends ConsumerState<DeliveryConfirmScreen> {
  bool _submitting = false;
  final _codeCtrl = TextEditingController();
  String? _photoUrl; // رابط صورة إثبات التسليم بعد الرفع
  bool _uploading = false;

  @override
  void dispose() {
    _codeCtrl.dispose();
    super.dispose();
  }

  /// كاميرا → رفع على /uploads → رابط. صورة إثبات تسليم الطلب للعميل.
  Future<void> _capturePhoto() async {
    XFile? picked;
    try {
      picked = await ImagePicker().pickImage(source: ImageSource.camera, maxWidth: 1400, imageQuality: 80);
    } catch (_) {
      if (mounted) _snack(context, 'مش قادرين نفتح الكاميرا');
      return;
    }
    if (picked == null || !mounted) return;
    setState(() => _uploading = true);
    try {
      final url = await ref.read(captainRepositoryProvider).uploadFile(File(picked.path), folder: 'deliveries');
      if (mounted) setState(() => _photoUrl = url);
    } on ApiException catch (e) {
      if (mounted) _snack(context, e.message);
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _confirmDelivery(CaptainTrip trip) async {
    final code = _codeCtrl.text.trim();
    if (code.isEmpty) {
      _snack(context, 'أدخل كود التسليم اللي مع العميل');
      return;
    }
    if (_photoUrl == null) {
      _snack(context, 'صوّر إثبات التسليم أول');
      return;
    }
    setState(() => _submitting = true);

    try {
      await ref.read(activeTripProvider.notifier).delivered(trip.id, code, photoUrl: _photoUrl);

      // الرحلة خلصت: الموقع مابقاش مربوط بطلب، والكابتن رجع متاح للعروض.
      // (السيرفر كمان بيرجّع الكابتن ONLINE جوّه markDelivered — بنزامن المحلي معاه.)
      ref.read(locationBroadcasterProvider).setOrder(null);
      ref.read(captainStatusProvider.notifier).setOnline(true);

      if (!mounted) return;
      context.go(QRoutes.tripRate(trip.id));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _submitting = false);
      _snack(context, e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _submitting = false);
      _snack(context, 'مش قادرين نأكّد التسليم — جرّب تاني');
    }
  }

  /// إثبات التسليم: كود العميل + صورة (الاتنين إلزاميين).
  Widget _proofCard() {
    return QCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('إثبات التسليم', style: QText.body.copyWith(fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          Text('اطلب كود التسليم من العميل، وصوّر الطلب عند التسليم.',
              style: QText.tiny.copyWith(color: QColors.label)),
          const SizedBox(height: 12),
          TextField(
            controller: _codeCtrl,
            keyboardType: TextInputType.number,
            textAlign: TextAlign.center,
            style: QText.display.copyWith(letterSpacing: 8, fontWeight: FontWeight.w800),
            decoration: const InputDecoration(hintText: '••••', counterText: ''),
            maxLength: 6,
          ),
          const SizedBox(height: 12),
          InkWell(
            onTap: _uploading ? null : _capturePhoto,
            borderRadius: BorderRadius.circular(12),
            child: Container(
              height: 120,
              decoration: BoxDecoration(
                color: QColors.chip,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: QColors.line),
                image: _photoUrl != null
                    ? DecorationImage(image: NetworkImage('${_photoUrl}'), fit: BoxFit.cover)
                    : null,
              ),
              child: _uploading
                  ? const Center(child: CircularProgressIndicator())
                  : _photoUrl != null
                      ? Align(
                          alignment: Alignment.topLeft,
                          child: Container(
                            margin: const EdgeInsets.all(6),
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(color: QColors.success, borderRadius: BorderRadius.circular(20)),
                            child: Text('✓ اتصوّرت', style: QText.tiny.copyWith(color: Colors.white)),
                          ),
                        )
                      : Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.camera_alt_outlined, size: 30, color: QColors.label),
                              const SizedBox(height: 6),
                              Text('صوّر إثبات التسليم', style: QText.tiny.copyWith(color: QColors.label)),
                            ],
                          ),
                        ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final tripAsync = ref.watch(tripProvider(widget.orderId));

    return tripAsync.when(
      loading: () => const Scaffold(backgroundColor: QColors.canvas, body: QLoading()),
      error: (error, _) => Scaffold(
        backgroundColor: QColors.canvas,
        appBar: const QHeader(title: 'تأكيد التسليم'),
        body: QErrorView(
          message: error is ApiException ? error.message : 'مش قادرين نجيب بيانات الطلب',
          onRetry: () => ref.invalidate(tripProvider(widget.orderId)),
        ),
      ),
      data: (trip) => Scaffold(
        backgroundColor: QColors.canvas,
        appBar: QHeader(
          title: 'تأكيد التسليم',
          subtitle: Text(
            'طلب ${fmt.ltr(trip.number)} · ${trip.customerName}',
            style: QText.tiny.copyWith(fontWeight: FontWeight.w600),
          ),
        ),
        body: ListView(
          padding: const EdgeInsets.all(QSpace.screenH),
          children: [
            _proofCard(),
            const SizedBox(height: 14),
            _PaymentCard(trip: trip),
            const SizedBox(height: 14),
            _OrderSummaryCard(trip: trip),
          ],
        ),
        bottomNavigationBar: QBottomBar(
          child: SizedBox(
            width: double.infinity,
            child: QButton(
              label: 'تم التسليم ✓',
              loading: _submitting,
              onPressed: () => _confirmDelivery(trip),
            ),
          ),
        ),
      ),
    );
  }
}

/// اختيار إثبات التسليم — **معروض موقوف**. الـ endpoint مابياخدش body أصلاً.
class _ProofSection extends StatelessWidget {
  const _ProofSection();

  @override
  Widget build(BuildContext context) {
    return QCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('إثبات التسليم', style: QText.section.copyWith(fontSize: 14)),
          const SizedBox(height: 10),
          Row(
            children: [
              for (final proof in DeliveryProof.values) ...[
                Expanded(
                  child: Container(
                    height: 44,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: QColors.chip,
                      borderRadius: BorderRadius.circular(QRadius.sm),
                      border: Border.all(color: QColors.border),
                    ),
                    child: Text(
                      proof.ar,
                      style: QText.body.copyWith(fontSize: 13.5, color: QColors.faint),
                    ),
                  ),
                ),
                if (proof != DeliveryProof.values.last) const SizedBox(width: 10),
              ],
            ],
          ),
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: QColors.tint,
              borderRadius: BorderRadius.circular(QRadius.md),
            ),
            child: Text.rich(
              TextSpan(
                children: [
                  const TextSpan(
                      text: 'إثبات التسليم (رمز OTP أو صورة) لسه مش مدعوم في الـ API — '),
                  TextSpan(
                    text: fmt.ltr('PATCH /orders/:id/delivered'),
                    style: QText.num(size: 12, weight: FontWeight.w700, color: QColors.goldDeep),
                  ),
                  const TextSpan(text: ' مابياخدش body'),
                ],
              ),
              style: const TextStyle(
                fontFamily: 'Cairo',
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                color: QColors.goldDeep,
                height: 1.6,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// الكاش — الجزء الحقيقي في الشاشة دي.
class _PaymentCard extends StatelessWidget {
  const _PaymentCard({required this.trip});

  final CaptainTrip trip;

  @override
  Widget build(BuildContext context) {
    if (trip.isPrepaid) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        decoration: BoxDecoration(
          color: QColors.successTint,
          borderRadius: BorderRadius.circular(QRadius.lg),
        ),
        child: Row(
          children: [
            const Text('💵', style: TextStyle(fontSize: 20)),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                'الطلب مدفوع إلكترونياً (${trip.paymentLabel}) — لا تحصّل كاش',
                style: QText.body.copyWith(fontSize: 14, color: QColors.success),
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      decoration: BoxDecoration(
        color: QColors.tint,
        borderRadius: BorderRadius.circular(QRadius.lg),
      ),
      child: Row(
        children: [
          const Text('💵', style: TextStyle(fontSize: 20)),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'حصّل من العميل:',
              style: QText.body.copyWith(fontSize: 14, color: QColors.goldDeep),
            ),
          ),
          QPrice(value: trip.cashToCollect, size: 18, color: QColors.goldDeep),
        ],
      ),
    );
  }
}

/// ملخص الطلب — الأصناف والإجمالي.
class _OrderSummaryCard extends StatelessWidget {
  const _OrderSummaryCard({required this.trip});

  final CaptainTrip trip;

  @override
  Widget build(BuildContext context) {
    return QCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('ملخص الطلب', style: QText.section.copyWith(fontSize: 14)),
          const SizedBox(height: 10),
          if (trip.items.isEmpty)
            Text('مافيش أصناف في الطلب', style: QText.tiny.copyWith(color: QColors.faint))
          else
            for (final item in trip.items) ...[
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    QLtr(
                      child: Text(
                        '${item.quantity}×',
                        style: QText.num(size: 13.5, weight: FontWeight.w800, color: QColors.gold),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(item.nameAr, style: QText.body.copyWith(fontSize: 13.5)),
                          if (item.hasOptions)
                            Text(
                              item.optionsLabel,
                              style: QText.tiny.copyWith(fontWeight: FontWeight.w600),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          const Divider(color: QColors.line, height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('الإجمالي', style: QText.body.copyWith(fontSize: 14)),
              QPrice(value: trip.total, size: 16),
            ],
          ),
          const SizedBox(height: 4),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('طريقة الدفع', style: QText.tiny.copyWith(fontWeight: FontWeight.w600)),
              Text(trip.paymentLabel, style: QText.tiny.copyWith(color: QColors.ink)),
            ],
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
        backgroundColor: QColors.ink,
        content: Text(
          message,
          style: QText.body.copyWith(fontSize: 14, color: QColors.brand),
        ),
      ),
    );
}
