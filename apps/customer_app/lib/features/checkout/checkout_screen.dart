// شاشة ١٧: إتمام الطلب — العنوان، وقت التوصيل، الكوبون، ملخص الفاتورة
// كل حاجة هنا حقيقية: الكوبون بيتأكد من السيرفر، والطلب بيتبعت لـ POST /orders.
// أي رفض من السيرفر (تحت الحد الأدنى، كوبون غلط، عنوان بره النطاق) بيظهر للعميل زي ما هو.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../models/address.dart';
import '../../providers/cart_provider.dart';
import '../../providers/checkout_provider.dart';
import '../../providers/location_provider.dart';
import '../../widgets/common.dart';
import 'payment_method_screen.dart';
import 'payment_webview_screen.dart';

class CheckoutScreen extends ConsumerWidget {
  const CheckoutScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartProvider);
    final bill = ref.watch(billProvider);
    // ممكن يكون null — العميل لسه ماضافش عنوان (أو القائمة لسه بتحمّل).
    final address = ref.watch(selectedAddressProvider);
    final payment = ref.watch(selectedPaymentProvider);
    final coupon = ref.watch(appliedCouponProvider);
    final slot = ref.watch(deliverySlotProvider);
    final drop = ref.watch(dropOffProvider);

    final minOrderMet = ref.watch(minOrderMetProvider);
    final isSubmitting = ref.watch(checkoutProvider).isLoading;
    final canSubmit = address != null && !cart.isEmpty && minOrderMet && !isSubmitting;

    // الحالات المقفولة بتقول للعميل السبب بدل ما يفضل يضغط على زر ميّت.
    final buttonLabel = isSubmitting
        ? 'جاري إرسال الطلب…'
        : (!cart.isEmpty && !minOrderMet)
            ? 'الحد الأدنى ${money(cart.minOrderTotal)} ر.س'
            : 'تأكيد الطلب';

    final addressText = address == null
        ? 'اختر عنوان التوصيل'
        : address.details.isNotEmpty
            ? address.details
            : address.title;

    const cardPadding = EdgeInsets.symmetric(horizontal: 16, vertical: 14);

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: const QHeader(title: 'إتمام الطلب'),
      body: ListView(
        padding: const EdgeInsets.all(QSpace.screenH),
        children: [
          // ── العنوان + طريقة التسليم ──
          QCard(
            padding: cardPadding,
            // من غير عنوان، الكارت كله بيودّي لقائمة العناوين.
            onTap: address == null ? () => context.push(QRoutes.addresses) : null,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('📍 التوصيل إلى', style: _cardTitle),
                    InkWell(
                      onTap: () => context.push(QRoutes.addresses),
                      child: Text(address == null ? 'إضافة' : 'تغيير', style: _goldLink),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  addressText,
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: address == null ? QColors.hint : QColors.label,
                  ),
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    QChip(
                      label: 'توصيل للباب',
                      selected: drop == DropOff.door,
                      onTap: () => ref.read(dropOffProvider.notifier).select(DropOff.door),
                    ),
                    const SizedBox(width: 8),
                    QChip(
                      label: 'استلام من الشارع',
                      selected: drop == DropOff.curb,
                      onTap: () => ref.read(dropOffProvider.notifier).select(DropOff.curb),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // ── وقت التوصيل ──
          QCard(
            padding: cardPadding,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('⏱ وقت التوصيل', style: _cardTitle),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: _SlotBox(
                        title: 'أسرع وقت',
                        subtitle: '25-35 min',
                        numericSubtitle: true,
                        selected: slot == DeliverySlot.asap,
                        onTap: () =>
                            ref.read(deliverySlotProvider.notifier).select(DeliverySlot.asap),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _SlotBox(
                        title: 'جدولة',
                        subtitle: 'اختر وقت',
                        selected: slot == DeliverySlot.scheduled,
                        onTap: () =>
                            ref.read(deliverySlotProvider.notifier).select(DeliverySlot.scheduled),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // ── الدفع ──
          QCard(
            padding: cardPadding,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('💳 الدفع', style: _cardTitle),
                    InkWell(
                      onTap: () => context.push(QRoutes.paymentMethods),
                      child: const Text('تغيير', style: _goldLink),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    QPaymentBadge(type: payment.type),
                    const SizedBox(width: 10),
                    // مافيش بطاقات محفوظة في الـ API — الاسم بس.
                    Text(
                      payment.title,
                      style: const TextStyle(
                        fontFamily: 'Cairo',
                        fontSize: 13.5,
                        fontWeight: FontWeight.w800,
                        color: QColors.ink,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),

          // ── الكوبون ──
          QCard(
            padding: cardPadding,
            onTap: coupon != null ? null : () => _openCouponSheet(context),
            child: coupon != null
                ? Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text.rich(
                          TextSpan(
                            style: const TextStyle(
                              fontFamily: 'Cairo',
                              fontSize: 13.5,
                              fontWeight: FontWeight.w800,
                              color: QColors.ink,
                            ),
                            children: [
                              const TextSpan(text: '🎟 كوبون: '),
                              TextSpan(
                                text: coupon.code,
                                style: const TextStyle(color: QColors.success),
                              ),
                              const TextSpan(text: ' مفعّل'),
                            ],
                          ),
                        ),
                      ),
                      // كوبون التوصيل المجاني بيصفّر رسوم التوصيل مش بيعمل خصم،
                      // فالمبلغ بيبقى صفر — نعرض «توصيل مجاني» بدل «-0».
                      if (coupon.freeDelivery)
                        const Text(
                          'توصيل مجاني',
                          style: TextStyle(
                            fontFamily: 'Cairo',
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            color: QColors.success,
                          ),
                        )
                      else if (bill.discount > 0)
                        Text(
                          ltr('-${money(bill.discount)}'),
                          style: QText.num(size: 13, color: QColors.success),
                        ),
                    ],
                  )
                : const Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('🎟 عندك كوبون؟', style: _cardTitle),
                      Text('أضف كوبون', style: _goldLink),
                    ],
                  ),
          ),
          const SizedBox(height: 14),

          // ── الفاتورة ──
          QCard(
            child: Column(
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Expanded(
                      child: Text(
                        'الإجمالي الفرعي + التوصيل + الضريبة',
                        style: TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: QColors.label,
                        ),
                      ),
                    ),
                    QPrice(
                      value: bill.subtotal + bill.deliveryFee + bill.vat,
                      size: 13,
                      showCurrency: false,
                    ),
                  ],
                ),
                if (bill.discount > 0) ...[
                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text(
                        'خصم الكوبون',
                        style: TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: QColors.success,
                        ),
                      ),
                      Text(
                        ltr('-${money(bill.discount)}'),
                        style: QText.num(size: 13, color: QColors.success),
                      ),
                    ],
                  ),
                ] else if (coupon?.freeDelivery ?? false) ...[
                  const SizedBox(height: 10),
                  const Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'التوصيل',
                        style: TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: QColors.success,
                        ),
                      ),
                      Text(
                        'مجاني',
                        style: TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          color: QColors.success,
                        ),
                      ),
                    ],
                  ),
                ],
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Divider(color: QColors.line, height: 1),
                ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'المطلوب دفعه',
                      style: TextStyle(
                        fontFamily: 'Cairo',
                        fontSize: 16,
                        fontWeight: FontWeight.w900,
                        color: QColors.ink,
                      ),
                    ),
                    QPrice(value: bill.total, size: 16),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: QBottomBar(
        child: QButton(
          style: QButtonStyle.dark,
          label: buttonLabel,
          enabled: canSubmit,
          leading: isSubmitting
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: QColors.brand),
                )
              : null,
          trailing: QPrice(value: bill.total, size: 15, color: QColors.brand),
          onPressed: address == null ? null : () => _submit(context, ref, address),
        ),
      ),
    );
  }

  /// POST /orders — السيرفر هو اللي بيقرر (حد أدنى، كوبون، نطاق التوصيل).
  Future<void> _submit(BuildContext context, WidgetRef ref, Address address) async {
    try {
      final order = await ref.read(checkoutProvider.notifier).submit(address: address);
      if (!context.mounted) return;

      // طلب بطاقة محتاج دفع إلكتروني → نفتح صفحة الدفع الآمنة قبل شاشة النجاح.
      final checkoutUrl = order.checkoutUrl;
      if (checkoutUrl != null && checkoutUrl.isNotEmpty) {
        final paid = await Navigator.of(context).push<bool?>(
          MaterialPageRoute(
            builder: (_) => PaymentWebViewScreen(orderId: order.id, checkoutUrl: checkoutUrl),
          ),
        );
        if (!context.mounted) return;
        if (paid == false) {
          // الدفع فشل — الطلب موجود بس معلّق الدفع، فمنروحش لشاشة النجاح.
          // نوجّه العميل لتفاصيل الطلب عشان يعيد المحاولة، ونعرض سبب واضح.
          context.go(QRoutes.orderDetails(order.id));
          _showError(context, 'فشل الدفع — تقدر تعيد المحاولة من صفحة الطلب');
          return;
        }
        // نجاح أو معلّق: بنكمّل لشاشة الطلب على أي حال (حالة الدفع بتتحدّث لحظياً).
      }
      context.go(QRoutes.orderSuccess(order.id));
    } on ApiException catch (e) {
      // رسالة السيرفر زي ما هي — العميل لازم يعرف ليه الطلب اترفض.
      if (!context.mounted) return;
      _showError(context, e.message);
    } catch (_) {
      if (!context.mounted) return;
      _showError(context, 'ما قدرناش نبعت الطلب — جرّب تاني');
    }
  }

  void _openCouponSheet(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _CouponSheet(),
    );
  }
}

/// رسالة خطأ من السيرفر — خلفية سودا ونص أصفر (نفس ستايل باقي التطبيق).
void _showError(BuildContext context, String message) {
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
            color: QColors.brand,
          ),
        ),
        behavior: SnackBarBehavior.floating,
        backgroundColor: QColors.ink,
        duration: const Duration(seconds: 3),
      ),
    );
}

const _cardTitle = TextStyle(
  fontFamily: 'Cairo',
  fontSize: 14,
  fontWeight: FontWeight.w800,
  color: QColors.ink,
);

const _goldLink = TextStyle(
  fontFamily: 'Cairo',
  fontSize: 12.5,
  fontWeight: FontWeight.w700,
  color: QColors.gold,
);

/// مربع «أسرع وقت» / «جدولة».
class _SlotBox extends StatelessWidget {
  const _SlotBox({
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.onTap,
    this.numericSubtitle = false,
  });

  final String title;
  final String subtitle;
  final bool selected;
  final VoidCallback onTap;

  /// «25-35 min» بخط Outfit.
  final bool numericSubtitle;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(QRadius.sm),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: selected ? QColors.tintSoft : QColors.surface,
          borderRadius: BorderRadius.circular(QRadius.sm),
          border: Border.all(
            color: selected ? QColors.brand : QColors.border,
            width: selected ? 2 : 1.5,
          ),
        ),
        child: Column(
          children: [
            Text(
              title,
              style: const TextStyle(
                fontFamily: 'Cairo',
                fontSize: 13.5,
                fontWeight: FontWeight.w800,
                color: QColors.ink,
              ),
            ),
            const SizedBox(height: 3),
            if (numericSubtitle)
              // «25-35 min» بيتقلب لـ «min 25-35» تحت الـ RTL من غير عزل.
              QLtr(
                child: Text(
                  subtitle,
                  style: QText.num(size: 11.5, weight: FontWeight.w600, color: QColors.textMuted),
                ),
              )
            else
              Text(
                subtitle,
                style: const TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 11.5,
                  fontWeight: FontWeight.w600,
                  color: QColors.textMuted,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// شيت «أضف كوبون» — الكود بيتأكد من السيرفر (POST /customer/coupons/validate).
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

  Future<void> _apply() async {
    final code = _controller.text.trim();
    if (code.isEmpty || _applying) return;

    setState(() => _applying = true);
    try {
      await ref.read(appliedCouponProvider.notifier).apply(code);
      if (!mounted) return;
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _applying = false);
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(
              e.message,
              style: const TextStyle(
                fontFamily: 'Cairo',
                fontSize: 13.5,
                fontWeight: FontWeight.w800,
                color: Colors.white,
              ),
            ),
            behavior: SnackBarBehavior.floating,
            backgroundColor: QColors.danger,
            duration: const Duration(seconds: 3),
          ),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: QSpace.screenH,
        right: QSpace.screenH,
        top: 20,
        bottom: 20 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('🎟 أضف كوبون', style: QText.section),
          const SizedBox(height: 14),
          QField(hint: 'اكتب كود الكوبون', controller: _controller),
          const SizedBox(height: 14),
          QButton(
            label: _applying ? 'جاري التحقق…' : 'تفعيل',
            enabled: !_applying,
            leading: _applying
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: QColors.ink),
                  )
                : null,
            onPressed: _apply,
          ),
        ],
      ),
    );
  }
}
