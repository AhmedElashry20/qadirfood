// شاشة ١٦: عربة التسوق
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../models/cart.dart';
import '../../providers/cart_provider.dart';
import '../../providers/checkout_provider.dart';
import '../../widgets/cart_summary.dart';
import '../../widgets/common.dart';

class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartProvider);
    final bill = ref.watch(billProvider);
    final coupon = ref.watch(appliedCouponProvider);

    // السيرفر بيرفض الطلب لو المجموع الفرعي أقل من الحد الأدنى للفرع — فبنقفل الطريق للدفع هنا.
    final minOrderMet = ref.watch(minOrderMetProvider);

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: QHeader(
        title: cart.restaurantName == null ? 'السلة' : 'السلة · ${cart.restaurantName}',
      ),
      body: cart.isEmpty
          ? _Empty(onBrowse: () => context.go(QRoutes.home))
          : ListView(
              padding: const EdgeInsets.all(QSpace.screenH),
              children: [
                for (final line in cart.lines) ...[
                  _CartLineCard(
                    line: line,
                    onIncrement: () => ref.read(cartProvider.notifier).increment(line.id),
                    onDecrement: () => ref.read(cartProvider.notifier).decrement(line.id),
                  ),
                  const SizedBox(height: 14),
                ],
                if (coupon == null)
                  _CouponStrip(onTap: () => _openCouponSheet(context))
                else
                  _AppliedCouponStrip(
                    code: coupon.code,
                    onRemove: () => ref.read(appliedCouponProvider.notifier).clear(),
                  ),
                const SizedBox(height: 14),
                BillSummary(
                  subtotal: bill.subtotal,
                  deliveryFee: bill.deliveryFee,
                  vat: bill.vat,
                  discount: bill.discount,
                  couponCode: coupon?.code,
                ),
              ],
            ),
      bottomNavigationBar: cart.isEmpty
          ? null
          : QBottomBar(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (!minOrderMet) ...[
                    _MinOrderStrip(minOrderTotal: cart.minOrderTotal),
                    const SizedBox(height: 10),
                  ],
                  QButton(
                    label: 'متابعة الدفع ←',
                    enabled: minOrderMet,
                    onPressed: minOrderMet ? () => context.push(QRoutes.checkout) : null,
                  ),
                ],
              ),
            ),
    );
  }

  void _openCouponSheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _CouponSheet(),
    );
  }
}

/// سطر في السلة: صورة + اسم + الخيارات + السعر + عدّاد الكمية.
class _CartLineCard extends StatelessWidget {
  const _CartLineCard({
    required this.line,
    required this.onIncrement,
    required this.onDecrement,
  });

  final CartLine line;
  final VoidCallback onIncrement;
  final VoidCallback onDecrement;

  @override
  Widget build(BuildContext context) {
    return QCard(
      padding: const EdgeInsets.all(12),
      child: Row(
        children: [
          QImage(url: line.item.imageUrl, width: 64, height: 64, radius: QRadius.sm),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  line.item.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 14.5,
                    fontWeight: FontWeight.w800,
                    color: QColors.ink,
                  ),
                ),
                if (line.optionsLabel.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    line.optionsLabel,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: QText.tiny.copyWith(fontSize: 11.5, fontWeight: FontWeight.w600),
                  ),
                ],
                if (line.notes != null && line.notes!.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    '📝 ${line.notes}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: QText.tiny.copyWith(fontSize: 11.5, fontWeight: FontWeight.w600),
                  ),
                ],
                const SizedBox(height: 6),
                QPrice(value: line.lineTotal, size: 14),
              ],
            ),
          ),
          const SizedBox(width: 8),
          QQuantityStepper(
            compact: true,
            quantity: line.quantity,
            onIncrement: onIncrement,
            onDecrement: onDecrement,
          ),
        ],
      ),
    );
  }
}

/// «الحد الأدنى للطلب 40 ر.س» — فوق زر الدفع وهو متعطّل.
class _MinOrderStrip extends StatelessWidget {
  const _MinOrderStrip({required this.minOrderTotal});

  final double minOrderTotal;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: QColors.tint,
        borderRadius: BorderRadius.circular(QRadius.md),
      ),
      child: Text.rich(
        TextSpan(
          children: [
            const TextSpan(text: 'الحد الأدنى للطلب '),
            TextSpan(
              text: money(minOrderTotal),
              style: QText.num(size: 13.5, color: QColors.goldDeep),
            ),
            const TextSpan(text: ' ر.س'),
          ],
        ),
        textAlign: TextAlign.center,
        style: const TextStyle(
          fontFamily: 'Cairo',
          fontSize: 13.5,
          fontWeight: FontWeight.w800,
          color: QColors.goldDeep,
        ),
      ),
    );
  }
}

/// شريط «عندك كوبون؟» — يفتح شيت إدخال الكود.
class _CouponStrip extends StatelessWidget {
  const _CouponStrip({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(QRadius.md),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: QColors.tint,
          borderRadius: BorderRadius.circular(QRadius.md),
          border: Border.all(color: QColors.brandDeep, width: 1.5),
        ),
        child: const Row(
          children: [
            Expanded(
              child: Text(
                '🎟 عندك كوبون؟ أضفه هنا',
                style: TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 13.5,
                  fontWeight: FontWeight.w800,
                  color: QColors.goldDeep,
                ),
              ),
            ),
            // chevron_right بينعكس تلقائياً في RTL فيبقى شمال — زي كل QListTile في التطبيق.
            Icon(Icons.chevron_right, size: 20, color: QColors.goldDeep),
          ],
        ),
      ),
    );
  }
}

/// شريط الكوبون المفعّل — أخضر مع زر «إزالة».
class _AppliedCouponStrip extends StatelessWidget {
  const _AppliedCouponStrip({required this.code, required this.onRemove});

  final String code;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsetsDirectional.fromSTEB(16, 12, 8, 12),
      decoration: BoxDecoration(
        color: QColors.surface,
        borderRadius: BorderRadius.circular(QRadius.md),
        border: Border.all(color: QColors.success, width: 1.5),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              '🎟 $code مفعّل',
              style: const TextStyle(
                fontFamily: 'Cairo',
                fontSize: 13.5,
                fontWeight: FontWeight.w800,
                color: QColors.success,
              ),
            ),
          ),
          TextButton(
            onPressed: onRemove,
            child: const Text(
              'إزالة',
              style: TextStyle(
                fontFamily: 'Cairo',
                fontSize: 13,
                fontWeight: FontWeight.w800,
                color: QColors.gold,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// شيت إدخال كود الكوبون.
class _CouponSheet extends ConsumerStatefulWidget {
  const _CouponSheet();

  @override
  ConsumerState<_CouponSheet> createState() => _CouponSheetState();
}

class _CouponSheetState extends ConsumerState<_CouponSheet> {
  final _controller = TextEditingController();
  bool _applying = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  /// الكوبون بيتحقق منه السيرفر — الرسالة اللي بترجع في [ApiException] هي اللي بتتعرض.
  Future<void> _apply() async {
    if (_applying) return;
    setState(() => _applying = true);

    try {
      await ref.read(appliedCouponProvider.notifier).apply(_controller.text);
      if (!context.mounted) return;
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (!context.mounted) return;
      setState(() => _applying = false);
      _error(e.message);
    } catch (_) {
      if (!context.mounted) return;
      setState(() => _applying = false);
      _error('حصل خطأ');
    }
  }

  void _error(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(
            message,
            style: const TextStyle(
              fontFamily: 'Cairo',
              fontSize: 13.5,
              fontWeight: FontWeight.w800,
              color: Colors.white,
            ),
          ),
          behavior: SnackBarBehavior.floating,
          backgroundColor: QColors.danger,
          duration: const Duration(seconds: 2),
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(
        QSpace.screenH,
        20,
        QSpace.screenH,
        20 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('كوبون الخصم', style: QText.section),
          const SizedBox(height: 14),
          QField(
            hint: 'اكتب كود الكوبون',
            controller: _controller,
            textDirection: TextDirection.ltr,
          ),
          const SizedBox(height: 14),
          QButton(
            label: 'تفعيل',
            enabled: !_applying,
            onPressed: _applying ? null : _apply,
            trailing: _applying
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: QColors.ink),
                  )
                : null,
          ),
        ],
      ),
    );
  }
}

/// السلة فاضية.
class _Empty extends StatelessWidget {
  const _Empty({required this.onBrowse});

  final VoidCallback onBrowse;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(QSpace.screenH),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('🛒', style: TextStyle(fontSize: 56)),
            const SizedBox(height: 14),
            const Text('سلتك فاضية', style: QText.section),
            const SizedBox(height: 6),
            const Text('اختر مطعم وابدأ اطلب', style: QText.caption),
            const SizedBox(height: 20),
            SizedBox(
              width: 200,
              child: QButton(label: 'تصفح المطاعم', onPressed: onBrowse),
            ),
          ],
        ),
      ),
    );
  }
}
