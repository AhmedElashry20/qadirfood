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
// الاتنين محليين — الـ API مافيهوش جدولة، فاللي مش افتراضي بيروح في customerNotes.

/// «أسرع وقت» أو «جدولة».
enum DeliverySlot { asap, scheduled }

class DeliverySlotNotifier extends Notifier<DeliverySlot> {
  @override
  DeliverySlot build() => DeliverySlot.asap;

  void select(DeliverySlot slot) => state = slot;
}

final deliverySlotProvider =
    NotifierProvider<DeliverySlotNotifier, DeliverySlot>(DeliverySlotNotifier.new);

/// «توصيل للباب» أو «استلام من الشارع».
enum DropOff { door, curb }

class DropOffNotifier extends Notifier<DropOff> {
  @override
  DropOff build() => DropOff.door;

  void select(DropOff value) => state = value;
}

final dropOffProvider = NotifierProvider<DropOffNotifier, DropOff>(DropOffNotifier.new);

/// الملاحظات اللي بتوصل للمطعم — بنكتب بس اللي مش افتراضي.
String? checkoutNotes({required DeliverySlot slot, required DropOff drop}) {
  final parts = [
    if (drop == DropOff.curb) 'استلام من الشارع',
    if (slot == DeliverySlot.scheduled) 'توصيل مجدول',
  ];
  return parts.isEmpty ? null : parts.join(' · ');
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
      throw ApiException('السلة فاضية');
    }
    if (!ref.read(minOrderMetProvider)) {
      throw ApiException('الحد الأدنى للطلب من الفرع ده ${money(cart.minOrderTotal)} ر.س');
    }

    final payment = ref.read(selectedPaymentProvider);
    final coupon = ref.read(appliedCouponProvider);
    final notes = checkoutNotes(
      slot: ref.read(deliverySlotProvider),
      drop: ref.read(dropOffProvider),
    );

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
          );

      ref.read(cartProvider.notifier).clear();
      ref.read(appliedCouponProvider.notifier).clear();
      ref.invalidate(ordersProvider);

      state = const AsyncData(null);
      return order;
    } catch (error, stack) {
      state = AsyncError(error, stack);
      rethrow;
    }
  }
}

final checkoutProvider = NotifierProvider<CheckoutNotifier, AsyncValue<void>>(CheckoutNotifier.new);
