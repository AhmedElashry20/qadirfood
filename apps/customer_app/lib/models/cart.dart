// العربة — السعر المعروض محلي، والحساب النهائي (ضريبة/خصم/توصيل) بيرجع من السيرفر مع الطلب.
import 'menu_item.dart';

/// سطر في السلة: صنف + الخيارات المختارة + الكمية.
class CartLine {
  const CartLine({
    required this.id,
    required this.item,
    required this.quantity,
    required this.selectedOptions,
    this.notes,
  });

  /// مفتاح فريد للسطر (نفس الصنف بخيارات مختلفة = سطرين).
  final String id;
  final MenuItem item;
  final int quantity;
  final List<ItemOption> selectedOptions;
  final String? notes;

  double get unitPrice => item.price + selectedOptions.fold(0.0, (sum, o) => sum + o.extraPrice);

  double get lineTotal => unitPrice * quantity;

  /// «وسط · جبنة إضافية» — يظهر تحت اسم الصنف في السلة.
  String get optionsLabel => selectedOptions.map((o) => o.name).join(' · ');

  /// معرّفات الخيارات اللي بتتبعت للسيرفر.
  List<String> get optionIds => [for (final o in selectedOptions) o.id];

  /// عنصر في جسم POST /orders.
  Map<String, dynamic> toOrderItemJson() => {
        'menuItemId': item.id,
        'quantity': quantity,
        if (notes != null && notes!.isNotEmpty) 'notes': notes,
        'optionIds': optionIds,
      };

  CartLine copyWith({int? quantity, List<ItemOption>? selectedOptions, String? notes}) => CartLine(
        id: id,
        item: item,
        quantity: quantity ?? this.quantity,
        selectedOptions: selectedOptions ?? this.selectedOptions,
        notes: notes ?? this.notes,
      );
}

/// السلة كلها — سلة واحدة لمطعم واحد (زي التصميم: «السلة · Burger Lab»).
class Cart {
  const Cart({
    this.restaurantId,
    this.restaurantName,
    this.lines = const [],
    this.deliveryFee = 0,
    this.minOrderTotal = 0,
  });

  /// معرّف **الفرع** (نفس Restaurant.id) — بيتبعت كـ branchId في الطلب.
  final String? restaurantId;
  final String? restaurantName;
  final List<CartLine> lines;

  /// رسوم توصيل الفرع وقت ما اتحطّ أول صنف — الفاتورة بتتحسب بيها من غير نداء شبكة.
  final double deliveryFee;

  /// الحد الأدنى للطلب من الفرع — السيرفر بيرفض الطلب لو المجموع الفرعي أقل منه.
  final double minOrderTotal;

  /// نفس `restaurantId` — بالاسم اللي الـ API بيستخدمه.
  String? get branchId => restaurantId;

  bool get isEmpty => lines.isEmpty;
  int get itemCount => lines.fold(0, (sum, l) => sum + l.quantity);
  double get subtotal => lines.fold(0.0, (sum, l) => sum + l.lineTotal);

  /// أصناف الطلب زي ما POST /orders عايزها.
  List<Map<String, dynamic>> toOrderItemsJson() =>
      [for (final line in lines) line.toOrderItemJson()];

  Cart copyWith({
    String? restaurantId,
    String? restaurantName,
    List<CartLine>? lines,
    double? deliveryFee,
    double? minOrderTotal,
  }) =>
      Cart(
        restaurantId: restaurantId ?? this.restaurantId,
        restaurantName: restaurantName ?? this.restaurantName,
        lines: lines ?? this.lines,
        deliveryFee: deliveryFee ?? this.deliveryFee,
        minOrderTotal: minOrderTotal ?? this.minOrderTotal,
      );
}
