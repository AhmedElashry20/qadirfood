// شاشة ١٧: إتمام الطلب — العنوان، وقت التوصيل، الكوبون، ملخص الفاتورة
// كل حاجة هنا حقيقية: الكوبون بيتأكد من السيرفر، والطلب بيتبعت لـ POST /orders.
// أي رفض من السيرفر (تحت الحد الأدنى، كوبون غلط، عنوان بره النطاق) بيظهر للعميل زي ما هو.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/enums.dart';
import '../../core/format.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../models/address.dart';
import '../../models/loyalty.dart';
import '../../models/order.dart';
import '../../providers/cart_provider.dart';
import '../../providers/checkout_provider.dart';
import '../../providers/location_provider.dart';
import '../../providers/loyalty_provider.dart';
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
    final scheduledFor = ref.watch(scheduledForProvider);
    // الإكرامية بتتصفّر بصرياً على الكاش — السيرفر بيرفضها، فعرضها بيوعد بحاجة
    // مش هتحصل.
    final tipAllowed = payment.type != PaymentType.cash;
    final tip = tipAllowed ? ref.watch(tipProvider) : 0.0;

    // ── نقاط الولاء ──
    // السقف = المجموع ناقص خصم الكوبون: نفس القاعدة اللي في السيرفر، عشان
    // الرقم المعروض يطابق اللي هيتخصم فعلاً.
    final loyalty = ref.watch(loyaltyProvider).value ?? LoyaltySummary.empty;
    final headroom = (bill.subtotal - bill.discount).clamp(0, double.infinity).toDouble();
    final redeemRequested = ref.watch(redeemPointsProvider);
    final quote = redeemRequested > 0
        ? (ref.watch(redemptionQuoteProvider(headroom)).value ?? RedemptionQuote.zero)
        : RedemptionQuote.zero;

    final minOrderMet = ref.watch(minOrderMetProvider);
    final isSubmitting = ref.watch(checkoutProvider).isLoading;
    // «جدولة» من غير وقت محدّد = طلب ناقص. بنقفل الزر بدل ما نبعته كطلب فوري
    // والعميل يفتكر إنه جدوله.
    final scheduleReady = slot != DeliverySlot.scheduled || scheduledFor != null;
    final canSubmit =
        address != null && !cart.isEmpty && minOrderMet && scheduleReady && !isSubmitting;

    // الحالات المقفولة بتقول للعميل السبب بدل ما يفضل يضغط على زر ميّت.
    final buttonLabel = isSubmitting
        ? 'جاري إرسال الطلب…'
        : (!cart.isEmpty && !minOrderMet)
            ? 'الحد الأدنى ${money(cart.minOrderTotal)} ر.س'
            : !scheduleReady
                ? 'اختر وقت التوصيل'
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
                    Text('📍 التوصيل إلى', style: _cardTitle),
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
                Text('⏱ وقت التوصيل', style: _cardTitle),
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
                        subtitle: scheduledFor == null
                            ? 'اختر وقت'
                            : scheduleLabel(scheduledFor),
                        selected: slot == DeliverySlot.scheduled,
                        onTap: () async {
                          ref
                              .read(deliverySlotProvider.notifier)
                              .select(DeliverySlot.scheduled);
                          await _pickSchedule(context, ref);
                        },
                      ),
                    ),
                  ],
                ),
                if (slot == DeliverySlot.scheduled) ...[
                  const SizedBox(height: 10),
                  InkWell(
                    onTap: () => _pickSchedule(context, ref),
                    borderRadius: BorderRadius.circular(QRadius.sm),
                    child: Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
                      decoration: BoxDecoration(
                        color: QColors.tintSoft,
                        borderRadius: BorderRadius.circular(QRadius.sm),
                        border: Border.all(
                          color: scheduledFor == null ? QColors.border : QColors.brand,
                          width: 1.5,
                        ),
                      ),
                      child: Row(
                        children: [
                          Icon(Icons.event, size: 18, color: QColors.brand),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              scheduledFor == null
                                  ? 'حدّد وقت التسليم'
                                  : scheduleLabel(scheduledFor),
                              style: TextStyle(
                                fontFamily: 'Cairo',
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: QColors.ink,
                              ),
                            ),
                          ),
                          Text('تغيير', style: _goldLink),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'أقل وقت للجدولة بعد $kMinScheduleLeadMinutes دقيقة من الآن',
                    style: TextStyle(
                      fontFamily: 'Cairo',
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                      color: QColors.label,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 14),

          // ── إكرامية المندوب ──
          // بتروح ١٠٠٪ للمندوب — مافيش عليها ضريبة ولا عمولة منصة.
          QCard(
            padding: cardPadding,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('🤝 إكرامية المندوب', style: _cardTitle),
                const SizedBox(height: 4),
                Text(
                  tipAllowed
                      ? 'توصل للمندوب كاملة'
                      : 'الإكرامية مع الدفع الإلكتروني — الدفع نقداً يُسلَّم للمندوب مباشرة',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 11.5,
                    fontWeight: FontWeight.w600,
                    color: QColors.label,
                  ),
                ),
                if (tipAllowed) ...[
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      for (final preset in kTipPresets) ...[
                        Expanded(
                          child: _TipChip(
                            amount: preset,
                            selected: tip == preset,
                            onTap: () => ref.read(tipProvider.notifier).select(preset),
                          ),
                        ),
                        if (preset != kTipPresets.last) const SizedBox(width: 8),
                      ],
                    ],
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 14),

          // ── نقاط الولاء ──
          // بتظهر بس لو البرنامج مفعّل والرصيد يكفّي الحد الأدنى — كارت بيقول
          // «عندك ٣ نقاط» مالوش قيمة للعميل.
          if (loyalty.canRedeem) ...[
            QCard(
              padding: cardPadding,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(child: Text('⭐ استبدال نقاطي', style: _cardTitle)),
                      QSwitch(
                        value: redeemRequested > 0,
                        onChanged: (on) => ref
                            .read(redeemPointsProvider.notifier)
                            .select(on ? loyalty.points : 0),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'رصيدك ${loyalty.points} نقطة · تعادل ${ltr(money(loyalty.valueSar))} ر.س',
                    style: TextStyle(
                      fontFamily: 'Cairo',
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                      color: QColors.label,
                    ),
                  ),
                  if (redeemRequested > 0) ...[
                    const SizedBox(height: 10),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                      decoration: BoxDecoration(
                        color: QColors.tintSoft,
                        borderRadius: BorderRadius.circular(QRadius.sm),
                      ),
                      child: Text(
                        quote.points == 0
                            // السقف أقل من الحد الأدنى للاستبدال — بنقول السبب
                            // بدل ما المفتاح يبان شغّال والخصم صفر.
                            ? 'قيمة الطلب الحالية لا تكفي لاستبدال نقاط'
                            : 'ستُستخدم ${quote.points} نقطة — خصم '
                                '${ltr(money(quote.discountSar))} ر.س',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                          color: quote.points == 0 ? QColors.label : QColors.brand,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 14),
          ],

          // ── الدفع ──
          QCard(
            padding: cardPadding,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('💳 الدفع', style: _cardTitle),
                    InkWell(
                      onTap: () => context.push(QRoutes.paymentMethods),
                      child: Text('تغيير', style: _goldLink),
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
                      style: TextStyle(
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
                            style: TextStyle(
                              fontFamily: 'Cairo',
                              fontSize: 13.5,
                              fontWeight: FontWeight.w800,
                              color: QColors.ink,
                            ),
                            children: [
                              const TextSpan(text: '🎟 كوبون: '),
                              TextSpan(
                                text: coupon.code,
                                style: TextStyle(color: QColors.success),
                              ),
                              const TextSpan(text: ' مفعّل'),
                            ],
                          ),
                        ),
                      ),
                      // كوبون التوصيل المجاني بيصفّر رسوم التوصيل مش بيعمل خصم،
                      // فالمبلغ بيبقى صفر — نعرض «توصيل مجاني» بدل «-0».
                      if (coupon.freeDelivery)
                        Text(
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
                : Row(
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
                    Expanded(
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
                      Text(
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
                  Row(
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
                if (quote.discountSar > 0) ...[
                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'خصم النقاط',
                        style: TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: QColors.success,
                        ),
                      ),
                      Text(
                        ltr('-${money(quote.discountSar)}'),
                        style: QText.num(size: 13, color: QColors.success),
                      ),
                    ],
                  ),
                ],
                if (tip > 0) ...[
                  const SizedBox(height: 10),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'إكرامية المندوب',
                        style: TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: QColors.label,
                        ),
                      ),
                      QPrice(value: tip, size: 13, showCurrency: false),
                    ],
                  ),
                ],
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  child: Divider(color: QColors.line, height: 1),
                ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'المطلوب دفعه',
                      style: TextStyle(
                        fontFamily: 'Cairo',
                        fontSize: 16,
                        fontWeight: FontWeight.w900,
                        color: QColors.ink,
                      ),
                    ),
                    // `bill.total` محسوب محلياً من غير خصم النقاط (اللي بيتحسب
                    // على السيرفر)، والإكرامية برّه `order.total` أصلاً — فالرقم
                    // المعروض بيجمع التلاتة عشان يطابق اللي هيتخصم فعلاً.
                    QPrice(
                      value: (bill.total - quote.discountSar).clamp(0, double.infinity) + tip,
                      size: 16,
                    ),
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
              ? SizedBox(
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
      _showError(context, 'تعذّر إرسال الطلب — حاول مرة أخرى');
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
          style: TextStyle(
            fontFamily: 'Cairo',
            fontSize: 13.5,
            fontWeight: FontWeight.w800,
            color: QColors.brand,
          ),
        ),
        behavior: SnackBarBehavior.floating,
        backgroundColor: QColors.inkSurface,
        duration: const Duration(seconds: 3),
      ),
    );
}

final _cardTitle = TextStyle(
  fontFamily: 'Cairo',
  fontSize: 14,
  fontWeight: FontWeight.w800,
  color: QColors.ink,
);

final _goldLink = TextStyle(
  fontFamily: 'Cairo',
  fontSize: 12.5,
  fontWeight: FontWeight.w700,
  color: QColors.gold,
);

/// منتقي وقت التسليم — تاريخ ثم ساعة.
///
/// بيفرض نفس حدود السيرفر (`scheduling.ts`): أقرب وقت = دلوقتي + المهلة الدنيا،
/// وأقصى مدى = الأفق المسموح. لو العميل اختار وقت النهاردة أقرب من المهلة،
/// بنرفعه لأقرب وقت مسموح بدل ما السيرفر يرفض الطلب كله بعد ما يضغط تأكيد.
Future<void> _pickSchedule(BuildContext context, WidgetRef ref) async {
  final earliest = ScheduledForNotifier.earliest();
  final latest = ScheduledForNotifier.latest();
  final current = ref.read(scheduledForProvider) ?? earliest;

  final date = await showDatePicker(
    context: context,
    initialDate: current.isBefore(earliest) ? earliest : current,
    firstDate: DateTime(earliest.year, earliest.month, earliest.day),
    lastDate: latest,
    helpText: 'يوم التسليم',
  );
  if (date == null || !context.mounted) return;

  final time = await showTimePicker(
    context: context,
    initialTime: TimeOfDay.fromDateTime(current.isBefore(earliest) ? earliest : current),
    helpText: 'وقت التسليم',
  );
  if (time == null) return;

  var chosen = DateTime(date.year, date.month, date.day, time.hour, time.minute);
  // الترقية الصامتة لأقرب وقت مسموح: أرحم من رفض بعد الضغط على «تأكيد».
  if (chosen.isBefore(earliest)) chosen = earliest;

  ref.read(scheduledForProvider.notifier).select(chosen);
}

/// زر إكرامية جاهز — «بدون» للصفر.
class _TipChip extends StatelessWidget {
  const _TipChip({required this.amount, required this.selected, required this.onTap});

  final double amount;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(QRadius.sm),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? QColors.tintSoft : QColors.surface,
          borderRadius: BorderRadius.circular(QRadius.sm),
          border: Border.all(
            color: selected ? QColors.brand : QColors.border,
            width: selected ? 2 : 1.5,
          ),
        ),
        child: Text(
          amount == 0 ? 'بدون' : ltr(money(amount)),
          style: TextStyle(
            fontFamily: 'Cairo',
            fontSize: 13,
            fontWeight: FontWeight.w800,
            color: selected ? QColors.brand : QColors.ink,
          ),
        ),
      ),
    );
  }
}

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
              style: TextStyle(
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
                style: TextStyle(
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
          Text('🎟 أضف كوبون', style: QText.section),
          const SizedBox(height: 14),
          QField(hint: 'اكتب كود الكوبون', controller: _controller),
          const SizedBox(height: 14),
          QButton(
            label: _applying ? 'جاري التحقق…' : 'تفعيل',
            enabled: !_applying,
            leading: _applying
                ? SizedBox(
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
