// الصنف ومجموعات الخيارات (حجم إجباري + إضافات اختيارية بحد أقصى).
// `restaurantId` في الموديل = **معرّف الفرع** (نفس Restaurant.id) لأنه ده اللي الطلب بيتبعت بيه.

/// قسم في منيو المطعم — «الأكثر طلباً»، «برجر»، «سايدز»…
class MenuSection {
  const MenuSection({required this.id, required this.name, required this.items});

  final String id;
  final String name;
  final List<MenuItem> items;

  factory MenuSection.fromJson(Map<String, dynamic> json, {required String restaurantId}) =>
      MenuSection(
        id: json['id'] as String,
        name: (json['nameAr'] ?? json['nameEn'] ?? '') as String,
        items: [
          for (final raw in (json['items'] as List<dynamic>? ?? const []))
            MenuItem.fromJson(raw as Map<String, dynamic>, restaurantId: restaurantId),
        ],
      );
}

class MenuItem {
  const MenuItem({
    required this.id,
    required this.restaurantId,
    required this.name,
    required this.description,
    required this.imageUrl,
    required this.price,
    this.oldPrice,
    this.optionGroups = const [],
    this.isAvailable = true,
  });

  final String id;

  /// معرّف الفرع اللي الصنف تابع له.
  final String restaurantId;
  final String name;
  final String description;
  final String imageUrl;

  /// السعر بعد الخصم (المعروض).
  final double price;

  /// السعر قبل الخصم — يظهر مشطوباً لو موجود.
  final double? oldPrice;
  final List<OptionGroup> optionGroups;
  final bool isAvailable;

  bool get hasDiscount => oldPrice != null && oldPrice! > price;

  int? get discountPercent => hasDiscount ? (100 - (price / oldPrice! * 100)).round() : null;

  factory MenuItem.fromJson(Map<String, dynamic> json, {required String restaurantId}) => MenuItem(
        id: json['id'] as String,
        restaurantId: restaurantId,
        name: (json['nameAr'] ?? json['nameEn'] ?? '') as String,
        description: (json['descriptionAr'] as String?) ?? '',
        imageUrl: (json['imageUrl'] as String?) ?? '',
        price: (json['price'] as num?)?.toDouble() ?? 0,
        oldPrice: (json['oldPrice'] as num?)?.toDouble(),
        // availability: AVAILABLE | OUT_OF_STOCK | HIDDEN
        isAvailable: (json['availability'] as String?) != 'OUT_OF_STOCK' &&
            (json['availability'] as String?) != 'HIDDEN',
        optionGroups: [
          for (final raw in (json['optionGroups'] as List<dynamic>? ?? const []))
            OptionGroup.fromJson(raw as Map<String, dynamic>),
        ],
      );
}

/// مجموعة خيارات: إما اختيار واحد إجباري (الحجم) أو متعدد اختياري (الإضافات).
class OptionGroup {
  const OptionGroup({
    required this.id,
    required this.name,
    required this.options,
    this.isRequired = false,
    this.maxSelections = 1,
    this.minSelections = 0,
  });

  final String id;
  final String name;
  final List<ItemOption> options;
  final bool isRequired;

  /// 1 = راديو، أكبر من 1 = تشيك بوكس بحد أقصى.
  final int maxSelections;
  final int minSelections;

  bool get isSingleChoice => maxSelections == 1;

  /// type: SINGLE → اختيار واحد · MULTI → maxSelect (أو كل الخيارات لو مش محدد).
  factory OptionGroup.fromJson(Map<String, dynamic> json) {
    final options = [
      for (final raw in (json['options'] as List<dynamic>? ?? const []))
        ItemOption.fromJson(raw as Map<String, dynamic>),
    ];
    final isSingle = (json['type'] as String?) == 'SINGLE';
    final maxSelect = (json['maxSelect'] as num?)?.toInt();
    final multiMax = (maxSelect == null || maxSelect < 1) ? options.length : maxSelect;

    return OptionGroup(
      id: json['id'] as String,
      name: (json['nameAr'] ?? json['nameEn'] ?? '') as String,
      options: options,
      isRequired: json['isRequired'] as bool? ?? false,
      maxSelections: isSingle ? 1 : (multiMax < 1 ? 1 : multiMax),
      minSelections: (json['minSelect'] as num?)?.toInt() ?? 0,
    );
  }
}

class ItemOption {
  const ItemOption({required this.id, required this.name, this.extraPrice = 0});

  final String id;
  final String name;

  /// صفر = «مجاناً» في التصميم.
  final double extraPrice;

  bool get isFree => extraPrice == 0;

  factory ItemOption.fromJson(Map<String, dynamic> json) => ItemOption(
        id: json['id'] as String,
        name: (json['nameAr'] ?? json['nameEn'] ?? '') as String,
        extraPrice: (json['extraPrice'] as num?)?.toDouble() ?? 0,
      );
}
