// شاشة ١٠: استلام الطلب — مطابقة كود الاستلام + تأكيد الأصناف.
//
// ══════════════════════════════════════════════════════════════════════════
//                    إيه الحقيقي وإيه اللي مالوش مصدر هنا
// ══════════════════════════════════════════════════════════════════════════
//  ✅ **كود الاستلام** حقيقي — `order.pickupCode` بييجي في رد الطلب،
//     و PATCH /orders/:id/pickup بيطابقه على السيرفر ويرمي «كود الاستلام غير صحيح».
//  ✅ **قائمة الأصناف** حقيقية — `order.items` بأسمائها وكمياتها وخياراتها.
//  ❌ **تأكيد الأصناف (الـ checklist)** محلي بالكامل — مافيش عمود ولا endpoint
//     يستقبل «الكابتن راجع الأصناف»؛ ده تنبيه للكابتن نفسه بس.
//  ❌ **حقيبة التبريد** — مافيش حقل في الطلب ولا في الـ DTO خالص.
//  ❌ **صورة الطلب** — مافيش رفع ملفات في الـ API ولا عمود للصورة.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/format.dart' as fmt;
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../models/order.dart';
import '../../providers/active_trip_provider.dart';
import '../../widgets/common.dart';

class PickupScreen extends ConsumerWidget {
  const PickupScreen({super.key, required this.orderId});

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tripAsync = ref.watch(tripProvider(orderId));

    return tripAsync.when(
      loading: () => const Scaffold(backgroundColor: QColors.canvas, body: QLoading()),
      error: (error, _) => Scaffold(
        backgroundColor: QColors.canvas,
        appBar: const QHeader(title: 'استلام الطلب'),
        body: QErrorView(
          message: error is ApiException ? error.message : 'مش قادرين نجيب بيانات الطلب',
          onRetry: () => ref.invalidate(tripProvider(orderId)),
        ),
      ),
      data: (trip) => _PickupForm(trip: trip),
    );
  }
}

class _PickupForm extends ConsumerStatefulWidget {
  const _PickupForm({required this.trip});

  final CaptainTrip trip;

  @override
  ConsumerState<_PickupForm> createState() => _PickupFormState();
}

class _PickupFormState extends ConsumerState<_PickupForm> {
  /// تأكيد كل صنف — **حالة محلية بس**، مافيش أي حقل في الـ API بيستقبلها.
  late final List<bool> _checked =
      List<bool>.filled(widget.trip.items.length, false, growable: false);

  /// حقيبة التبريد — محلية كمان (مافيش حقل في الطلب).
  bool _needsCooler = false;

  bool _submitting = false;

  bool get _allChecked => _checked.every((value) => value);

  Future<void> _confirmPickup() async {
    final trip = widget.trip;
    setState(() => _submitting = true);

    try {
      await ref.read(activeTripProvider.notifier).pickup(trip.id, trip.pickupCode);
      if (!mounted) return;
      context.go(QRoutes.tripToCustomer(trip.id));
    } on ApiException catch (e) {
      // السيرفر بيرفض الكود الغلط أو الحالة الغلط — بنعرض رسالته العربية زي ما هي.
      if (!mounted) return;
      setState(() => _submitting = false);
      _snack(context, e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _submitting = false);
      _snack(context, 'مش قادرين نأكّد الاستلام — جرّب تاني');
    }
  }

  @override
  Widget build(BuildContext context) {
    final trip = widget.trip;

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: QHeader(
        title: 'استلام الطلب ${fmt.ltr(trip.number)}',
        subtitle: Text(
          trip.restaurantName,
          style: const TextStyle(
            fontFamily: 'Cairo',
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: QColors.gold,
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(QSpace.screenH),
        children: [
          _PickupCodeBanner(code: trip.pickupCode),
          const SizedBox(height: 14),
          _ItemsChecklist(
            trip: trip,
            checked: _checked,
            onToggle: (index) => setState(() => _checked[index] = !_checked[index]),
          ),
          const SizedBox(height: 14),
          _CoolerCard(
            value: _needsCooler,
            onChanged: (value) => setState(() => _needsCooler = value),
          ),
          const SizedBox(height: 14),
          const _PhotoDropzone(),
        ],
      ),
      bottomNavigationBar: QBottomBar(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: double.infinity,
              child: QButton(
                label: 'استلمت الطلب — انطلق 🛵',
                enabled: _allChecked,
                loading: _submitting,
                onPressed: _confirmPickup,
              ),
            ),
            if (!_allChecked) ...[
              const SizedBox(height: 8),
              Text('(أكّد كل الأصناف)', style: QText.tiny.copyWith(color: QColors.faint)),
            ],
          ],
        ),
      ),
    );
  }
}

/// بانر كود الاستلام — الكابتن بيقوله للموظف والسيرفر بيطابقه في الـ PATCH.
class _PickupCodeBanner extends StatelessWidget {
  const _PickupCodeBanner({required this.code});

  final String code;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: QColors.tint,
        borderRadius: BorderRadius.circular(QRadius.lg),
      ),
      child: Row(
        children: [
          const Text('🅿️', style: TextStyle(fontSize: 22)),
          const SizedBox(width: 10),
          Expanded(
            child: Text.rich(
              TextSpan(
                children: [
                  const TextSpan(text: 'أخبر الموظف برقم الاستلام: '),
                  TextSpan(
                    text: fmt.ltr(code.isEmpty ? '—' : code),
                    style: QText.num(size: 17, weight: FontWeight.w800),
                  ),
                ],
              ),
              style: const TextStyle(
                fontFamily: 'Cairo',
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: QColors.goldDeep,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// تحقق الأصناف — العرض حقيقي والتأكيد محلي.
class _ItemsChecklist extends StatelessWidget {
  const _ItemsChecklist({required this.trip, required this.checked, required this.onToggle});

  final CaptainTrip trip;
  final List<bool> checked;
  final ValueChanged<int> onToggle;

  @override
  Widget build(BuildContext context) {
    return QCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('تحقق من الأصناف', style: QText.section.copyWith(fontSize: 14)),
          const SizedBox(height: 10),
          if (trip.items.isEmpty)
            Text('مافيش أصناف في الطلب', style: QText.tiny.copyWith(color: QColors.faint))
          else
            for (var i = 0; i < trip.items.length; i++) ...[
              if (i != 0) const Divider(color: QColors.line, height: 18),
              _ItemRow(
                item: trip.items[i],
                checked: checked[i],
                onTap: () => onToggle(i),
              ),
            ],
          if (trip.hasNotes) ...[
            const SizedBox(height: 12),
            Text(
              '📝 ${trip.customerNotes!.trim()}',
              style: const TextStyle(
                fontFamily: 'Cairo',
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                color: QColors.danger,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ItemRow extends StatelessWidget {
  const _ItemRow({required this.item, required this.checked, required this.onTap});

  final TripItem item;
  final bool checked;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          QLtr(
            child: Text(
              '${item.quantity}×',
              style: QText.num(size: 14, weight: FontWeight.w800, color: QColors.gold),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.nameAr, style: QText.body.copyWith(fontSize: 14)),
                if (item.hasOptions) ...[
                  const SizedBox(height: 2),
                  Text(item.optionsLabel, style: QText.tiny.copyWith(fontWeight: FontWeight.w600)),
                ],
                if (item.notes != null && item.notes!.trim().isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    '📝 ${item.notes!.trim()}',
                    style: QText.tiny.copyWith(color: QColors.danger, fontWeight: FontWeight.w600),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 10),
          QCheckBox(checked: checked, onTap: onTap),
        ],
      ),
    );
  }
}

/// حقيبة التبريد — سويتش محلي، مافيش حقل مقابل في الـ API.
class _CoolerCard extends StatelessWidget {
  const _CoolerCard({required this.value, required this.onChanged});

  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return QCard(
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('🧊 الطلب يحتاج حقيبة تبريد؟', style: QText.body.copyWith(fontSize: 14)),
                const SizedBox(height: 2),
                Text(
                  '(محلي — مافيش حقل في الـ API)',
                  style: QText.tiny.copyWith(color: QColors.faint, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
          QSwitch(value: value, onChanged: onChanged),
        ],
      ),
    );
  }
}

/// مربع الصورة — شكل التصميم موجود بس الرفع مش متاح (مافيش تخزين متوصّل).
class _PhotoDropzone extends StatelessWidget {
  const _PhotoDropzone();

  @override
  Widget build(BuildContext context) {
    return QCard(
      borderColor: QColors.border,
      color: QColors.tintSoft,
      onTap: () => _snack(context, 'رفع الصور محتاج ربط التخزين'),
      padding: const EdgeInsets.symmetric(vertical: 22, horizontal: 16),
      child: Column(
        children: [
          const Text('📷', style: TextStyle(fontSize: 30)),
          const SizedBox(height: 8),
          Text(
            'صوّر الطلب قبل الانطلاق (اختياري)',
            textAlign: TextAlign.center,
            style: QText.tiny.copyWith(fontWeight: FontWeight.w700),
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
