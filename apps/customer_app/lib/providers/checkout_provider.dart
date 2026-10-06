// إتمام الطلب — الكوبون (تحقق من السيرفر)، وقت التوصيل، طريقة الدفع، وإنشاء الطلب الحقيقي.
// كل أخطاء السيرفر بتطلع كـ ApiException برسالتها العربية — الشاشة بتعرض `e.message`.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api_client.dart';
import '../core/enums.dart';
import '../core/format.dart';
import '../data/api_repository.dart';
import '../models/address.dart';
import '../models/order.dart';
import 'cart_provider.dart';
import 'loyalty_provider.dart';
import 'orders_provider.dart';

// ─────────────────────────── الكوبون ───────────────────────────

/// الكوبون المفعّل على السلة — بيتأكد من السيرفر (POST /customer/coupons/validate).
class AppliedCouponNotifier extends Notifier<Coupon?> {
  @override
  Coupon? build() => null;

  /// بيرمي [ApiException] برسالة السيرفر العربية لو الكود غلط/منتهي/تحت الحد الأدنى.
  /// على النجاح: بيخزّن الكوبون وبتتحدّث الفاتورة (billProvider) على طول.
  Future<void> apply(String code) async {
    final trimmed = code.trim().toUpperCase();
    final subtotal = ref.read(cartProvider).subtotal;
    final customer = ref.read(customerRepositoryProvider);

    // ده اللي بيرمي الرسالة العربية لو الكوبون مش صالح — مابنبلعش الخطأ.
    final result = await customer.validateCoupon(trimmed, subtotal);

    state = await _hydrate(customer, result);
  }

  /// السيرفر بيرجّع قيمة الخصم للمجموع الحالي بس (مش النسبة). عشان الفاتورة تفضل
  /// مظبوطة لو العميل زوّد/نقّص أصناف بعد التفعيل، بنحاول نجيب الكوبون كامل
  /// (percentOff/maxDiscount) من GET /customer/coupons ونستعمله في الحساب المحلي.
  /// لو الكود مش في القائمة (كود مخفي مثلاً) بنقع على مبلغ الخصم اللي رجع من التحقق.
  Future<Coupon> _hydrate(CustomerRepository customer, CouponValidation result) async {
    try {
      final all = await customer.coupons();
      for (final c in all) {
        if (c.code.toUpperCase() == result.code.toUpperCase()) return c;
      }
    } on ApiException {
      // مجرد إثراء — التحقق نجح خلاص، فمش هنوقّع التفعيل لو القايمة فشلت.
    }
    return _fromValidation(result);
  }

  static Coupon _fromValidation(CouponValidation result) {
    final description = result.descriptionAr ?? '';
    return Coupon(
      code: result.code,
      title: description.isEmpty ? result.code : '${result.code} — $description',
      subtitle: 'خصم ${money(result.discount)} ر.س',
      badge: '${money(result.discount)} ر.س',
      // مبلغ ثابت = قيمة الخصم اللي السيرفر حسبها للمجموع ده.
      amountOff: result.discount,
      descriptionAr: result.descriptionAr,
    );
  }

  /// تفعيل كوبون جاهز من قائمة الكوبونات (من غير نداء تحقق) — السيرفر هيتحقق منه
  /// تاني وقت إنشاء الطلب على أي حال.
  void applyCoupon(Coupon coupon) => state = coupon;

  void clear() => state = null;
}

final appliedCouponProvider =
    NotifierProvider<AppliedCouponNotifier, Coupon?>(AppliedCouponNotifier.new);

// ─────────────────────── وقت التوصيل والتسليم ───────────────────────

/// أقل مهلة للجدولة — مطابقة لـ `MIN_LEAD_MINUTES` في `api/src/orders/scheduling.ts`.
/// بنفرضها في التطبيق كمان عشان العميل يشوف الحد قبل ما يبعت، مش يتفاجأ بخطأ.
const kMinScheduleLeadMinutes = 30;

/// أقصى مدى للجدولة — مطابق لـ `MAX_HORIZON_DAYS` في السيرفر.
const kMaxScheduleHorizonDays = 7;

/// «أسرع وقت» أو «جدولة».
enum DeliverySlot { asap, scheduled }

class DeliverySlotNotifier extends Notifier<DeliverySlot> {
  @override
  DeliverySlot build() => DeliverySlot.asap;

  void select(DeliverySlot slot) => state = slot;
}

final deliverySlotProvider =
    NotifierProvider<DeliverySlotNotifier, DeliverySlot>(DeliverySlotNotifier.new);

/// وقت التسليم المطلوب للطلب المجدول.
///
/// كان الخيار «جدولة» بيكتب سطر في الملاحظات بس — الـ API ماكانش فيه جدولة
/// أصلاً. بقى فيه عمود `scheduledFor` حقيقي: الطلب بيتخزّن مخفي عن المطعم
/// لحد وقت الإطلاق. فالقيمة دي بتروح للسيرفر مش للملاحظات.
class ScheduledForNotifier extends Notifier<DateTime?> {
  @override
  DateTime? build() => null;

  void select(DateTime? at) => state = at;

  /// أقرب وقت مسموح — دلوقتي + المهلة الدنيا، مقرّب لأعلى لأقرب ربع ساعة.
  static DateTime earliest() {
    final at = DateTime.now().add(const Duration(minutes: kMinScheduleLeadMinutes));
    final remainder = at.minute % 15;
    return DateTime(
      at.year,
      at.month,
      at.day,
      at.hour,
      at.minute + (remainder == 0 ? 0 : 15 - remainder),
    );
  }

  static DateTime latest() =>
      DateTime.now().add(const Duration(days: kMaxScheduleHorizonDays));
}

final scheduledForProvider =
    NotifierProvider<ScheduledForNotifier, DateTime?>(ScheduledForNotifier.new);

// ─────────────────────────── الإكرامية ───────────────────────────

/// الإكراميات الجاهزة المعروضة كأزرار. الصفر = «بدون».
const kTipPresets = <double>[0, 5, 10, 15];

/// إكرامية المندوب — بتروح ١٠٠٪ له، مافيش عليها ضريبة ولا عمولة.
/// السيرفر بيرفضها على الدفع نقداً (الكاش بيتسلّم في اليد).
class TipNotifier extends Notifier<double> {
  @override
  double build() => 0;

  void select(double amount) => state = amount < 0 ? 0 : amount;
}

final tipProvider = NotifierProvider<TipNotifier, double>(TipNotifier.new);

/// «توصيل للباب» أو «استلام من الشارع».
enum DropOff { door, curb }

class DropOffNotifier extends Notifier<DropOff> {
  @override
  DropOff build() => DropOff.door;

  void select(DropOff value) => state = value;
}

final dropOffProvider = NotifierProvider<DropOffNotifier, DropOff>(DropOffNotifier.new);

/// الملاحظات اللي بتوصل للمطعم — بنكتب بس اللي مش افتراضي.
///
/// «توصيل مجدول» اتشال من هنا: بقى عمود `scheduledFor` حقيقي في الطلب، فكتابته
/// في الملاحظات كانت هتكرّر المعلومة وتسيبها نص حر مالوش معنى للسيرفر.
String? checkoutNotes({required DropOff drop}) {
  return drop == DropOff.curb ? 'استلام من الشارع' : null;
}

// ─────────────────────────── الدفع ───────────────────────────
// الـ API بيقبل CASH | MADA | APPLE_PAY | CARD | WALLET — بس الكاش هو اللي بيتسوّى
// فعلياً دلوقتي (مافيش مفاتيح بوابة دفع). مافيش API لبطاقات محفوظة، فالقائمة ثابتة.

/// طرق الدفع المدعومة — `id` = اسم القيمة في الـ API (PaymentType.wire).
/// **المحفظة مستثناة**: لسه مافيش شحن رصيد للعميل، فالسيرفر بيرفضها. هترجع
/// لما نبني المحفظة كاملة (شحن + خصم + استرداد للرصيد).
final paymentMethodsProvider = Provider<List<PaymentMethod>>((ref) {
  return [
    for (final type in PaymentType.values)
      if (type != PaymentType.wallet)
        PaymentMethod(
          id: type.wire,
          type: type,
          title: type.ar,
        ),
  ];
});

/// المختارة — كاش افتراضياً (الوحيدة اللي بتتسوّى فعلياً).
class SelectedPaymentNotifier extends Notifier<String> {
  @override
  String build() => PaymentType.cash.wire;

  void select(String id) => state = id;
}

final selectedPaymentIdProvider =
    NotifierProvider<SelectedPaymentNotifier, String>(SelectedPaymentNotifier.new);

final selectedPaymentProvider = Provider<PaymentMethod>((ref) {
  final id = ref.watch(selectedPaymentIdProvider);
  final methods = ref.watch(paymentMethodsProvider);
  return methods.firstWhere((m) => m.id == id, orElse: () => methods.first);
});

/// «مدى •••• 4382» — مافيش بطاقات محفوظة دلوقتي، فبيرجّع العنوان بس.
String paymentLabelOf(PaymentMethod m) =>
    m.last4 == null ? m.title : '${m.title} ${ltr('•••• ${m.last4}')}';

// ─────────────────────── إنشاء الطلب (POST /orders) ───────────────────────

/// حالة زر «تأكيد الطلب»: `AsyncLoading` أثناء الإرسال، `AsyncError` لو السيرفر رفض.
class CheckoutNotifier extends Notifier<AsyncValue<void>> {
  @override
  AsyncValue<void> build() => const AsyncData(null);

  /// بيبعت السلة كـ طلب حقيقي ويرجّع الطلب اللي السيرفر أنشأه.
  ///
  /// [address] بييجي من شاشة إتمام الطلب (اللي عارضاه أصلاً) — عشان البروڤايدر ده
  /// مايتعلقش بشكل بروڤايدر العناوين.
  ///
  /// على النجاح: بيفضّي السلة والكوبون، ويعمل invalidate لـ [ordersProvider].
  /// على الفشل: [ApiException] بتطلع للشاشة زي ما هي (برسالة السيرفر العربية).
  Future<Order> submit({required Address address}) async {
    final cart = ref.read(cartProvider);
    final branchId = cart.restaurantId;

    if (branchId == null || cart.isEmpty) {
      throw const ApiException('السلة فارغة');
    }
    if (!ref.read(minOrderMetProvider)) {
      throw ApiException('الحد الأدنى للطلب من هذا الفرع ${money(cart.minOrderTotal)} ر.س');
    }

    final payment = ref.read(selectedPaymentProvider);
    final coupon = ref.read(appliedCouponProvider);
    final notes = checkoutNotes(drop: ref.read(dropOffProvider));

    // الجدولة بتتبعت بس لو العميل اختار «جدولة» **وحدّد وقت** — اختيار الخيار
    // من غير وقت بيبقى طلب فوري، مش طلب بوقت مخترع.
    final scheduledFor = ref.read(deliverySlotProvider) == DeliverySlot.scheduled
        ? ref.read(scheduledForProvider)
        : null;

    // الإكرامية للدفع الإلكتروني بس — السيرفر بيرفضها على الكاش، فبنسقّطها هنا
    // بدل ما الطلب كله يفشل على حاجة اختيارية.
    final tip = payment.type == PaymentType.cash ? 0.0 : ref.read(tipProvider);

    // النقاط المطلوب استبدالها — السيرفر بيقيّدها تاني بالرصيد وبسقف الطلب،
    // فلو العميل غيّر السلة بعد التسعير الطلب مايفشلش، الخصم بس بيتعدّل.
    final redeemPoints = ref.read(redeemPointsProvider);

    state = const AsyncLoading();
    try {
      final order = await ref.read(ordersRepositoryProvider).create(
            branchId: branchId,
            addressId: address.id,
            paymentMethod: payment.type.wire,
            couponCode: coupon?.code,
            customerNotes: notes,
            items: [for (final line in cart.lines) OrderItemInput.fromCartLine(line)],
            restaurantName: cart.restaurantName,
            tipAmount: tip,
            scheduledFor: scheduledFor,
            redeemPoints: redeemPoints,
          );

      ref.read(cartProvider.notifier).clear();
      ref.read(appliedCouponProvider.notifier).clear();
      ref.read(redeemPointsProvider.notifier).clear();
      ref.read(tipProvider.notifier).select(0);
      ref.read(scheduledForProvider.notifier).select(null);
      ref.invalidate(ordersProvider);
      // الرصيد اتغيّر (كسب و/أو استبدال) — الشاشة الجاية لازم تقرا الجديد.
      ref.invalidate(loyaltyProvider);

      state = const AsyncData(null);
      return order;
    } catch (error, stack) {
      state = AsyncError(error, stack);
      rethrow;
    }
  }
}

final checkoutProvider = NotifierProvider<CheckoutNotifier, AsyncValue<void>>(CheckoutNotifier.new);
