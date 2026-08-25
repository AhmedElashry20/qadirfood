// العربة (محلية — مسوّدة عند العميل) + حساب الفاتورة بنفس معادلة السيرفر بالظبط.
// المرجع: apps/api/src/orders/orders.service.ts
//   subtotal = Σ (سعر الصنف + الإضافات) × الكمية
//   discount = الكوبون (نسبة → subtotal × % ، بحد أقصى maxDiscount · أو مبلغ ثابت)
//   taxable  = subtotal − discount + deliveryFee
//   vat      = taxable × 15%
//   total    = taxable + vat
// مهم: الضريبة بتتحسب **بعد** الخصم وعلى رسوم التوصيل كمان (مش زي المحاكاة القديمة).
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/cart.dart';
import '../models/menu_item.dart';
import '../models/order.dart';
import '../models/restaurant.dart';
import 'checkout_provider.dart';

/// نسبة ضريبة القيمة المضافة — نفس VAT_PERCENT في الـ API (١٥٪).
const kVatRate = 0.15;

class CartNotifier extends Notifier<Cart> {
  @override
  Cart build() => const Cart();

  /// إضافة صنف بخياراته. لو الصنف بنفس الخيارات موجود، بنزوّد الكمية بس.
  /// بنخزّن كمان رسوم التوصيل والحد الأدنى بتوع الفرع جوه السلة نفسها،
  /// عشان الفاتورة تتحسب من غير أي نداء شبكة.
  void add(
    Restaurant restaurant,
    MenuItem item, {
    List<ItemOption> options = const [],
    int quantity = 1,
    String? notes,
  }) {
    // سلة واحدة لمطعم واحد — تغيير المطعم يفضّي السلة.
    final lines = state.restaurantId == restaurant.id ? [...state.lines] : <CartLine>[];

    final key = _lineKey(item, options, notes);
    final index = lines.indexWhere((l) => l.id == key);

    if (index >= 0) {
      lines[index] = lines[index].copyWith(quantity: lines[index].quantity + quantity);
    } else {
      lines.add(
        CartLine(
          id: key,
          item: item,
          quantity: quantity,
          selectedOptions: options,
          notes: notes,
        ),
      );
    }

    state = Cart(
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      deliveryFee: restaurant.deliveryFee,
      minOrderTotal: restaurant.minOrderTotal,
      lines: lines,
    );
  }

  void increment(String lineId) => _setQuantity(lineId, 1);

  void decrement(String lineId) => _setQuantity(lineId, -1);

  void remove(String lineId) {
    final lines = state.lines.where((l) => l.id != lineId).toList();
    state = lines.isEmpty ? const Cart() : state.copyWith(lines: lines);
  }

  void clear() => state = const Cart();

  void _setQuantity(String lineId, int delta) {
    final lines = [...state.lines];
    final i = lines.indexWhere((l) => l.id == lineId);
    if (i < 0) return;

    final next = lines[i].quantity + delta;
    if (next <= 0) {
      remove(lineId);
      return;
    }
    lines[i] = lines[i].copyWith(quantity: next);
    state = state.copyWith(lines: lines);
  }

  /// الملاحظات جزء من هوية السطر — نفس الصنف بملاحظتين مختلفتين = سطرين مش سطر بكمية ٢.
  static String _lineKey(MenuItem item, List<ItemOption> options, String? notes) {
    final ids = options.map((o) => o.id).toList()..sort();
    return '${item.id}|${ids.join(',')}|${notes ?? ''}';
  }
}

final cartProvider = NotifierProvider<CartNotifier, Cart>(CartNotifier.new);

/// فاتورة الطلب — نفس أرقام السيرفر بالظبط قبل ما الطلب يتبعت.
class Bill {
  const Bill({
    required this.subtotal,
    required this.deliveryFee,
    required this.vat,
    required this.discount,
  });

  final double subtotal;
  final double deliveryFee;
  final double vat;
  final double discount;

  /// الأساس الخاضع للضريبة: المجموع − الخصم + التوصيل.
  double get taxable => subtotal - discount + deliveryFee;

  double get total => taxable + vat;
}

final billProvider = Provider<Bill>((ref) {
  final cart = ref.watch(cartProvider);
  final coupon = ref.watch(appliedCouponProvider);

  final subtotal = cart.subtotal;
  // رسوم التوصيل من الفرع نفسه (اتحفظت في السلة وقت أول إضافة).
  final deliveryFee = cart.deliveryFee;
  // ملاحظة: السيرفر مابيعملش «توصيل مجاني» كخصم على الرسوم — كوبون التوصيل المجاني
  // بيتحوّل عنده لخصم عادي (percentOff/amountOff)، فمابنصفّرش deliveryFee هنا.
  final discount = coupon == null ? 0.0 : discountOf(coupon, subtotal);

  final vat = (subtotal - discount + deliveryFee) * kVatRate;
  return Bill(subtotal: subtotal, deliveryFee: deliveryFee, vat: vat, discount: discount);
});

/// خصم الكوبون على مجموع فرعي معيّن — نسخة طبق الأصل من حساب السيرفر.
double discountOf(Coupon coupon, double subtotal) {
  final percent = coupon.percent;
  var discount = percent != null ? subtotal * percent / 100 : (coupon.amountOff ?? 0);

  final cap = coupon.maxDiscount;
  if (cap != null && cap > 0 && discount > cap) discount = cap;

  return discount;
}

/// الحد الأدنى للطلب من الفرع اتحقق؟ — نفس الشرط اللي السيرفر بيرفض بيه الطلب
/// («الحد الأدنى للطلب من الفرع ده N ر.س»). الرقم نفسه في `cart.minOrderTotal`.
final minOrderMetProvider = Provider<bool>((ref) {
  final cart = ref.watch(cartProvider);
  return cart.subtotal >= cart.minOrderTotal;
});
