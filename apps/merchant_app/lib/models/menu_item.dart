// موديل المنيو — من GET /menu/categories (تصنيفات جوّاها أصنافها وخياراتها)
// و GET /menu/items/search.
//
// الرد صفوف Prisma خام: price و extraPrice (Decimal) بيوصلوا كـ String.
import '../core/enums.dart';
import '../core/format.dart';

/// اختيار واحد جوّه مجموعة — «وسط» أو «جبنة إضافية».
class MenuOption {
  const MenuOption({
    required this.id,
    required this.nameAr,
    this.nameEn = '',
    this.extraPrice = 0,
    this.isAvailable = true,
  });

  final String id;
  final String nameAr;
  final String nameEn;
  final double extraPrice;
  final bool isAvailable;

  bool get isFree => extraPrice <= 0;

  factory MenuOption.fromJson(Map<String, dynamic> json) => MenuOption(
        id: asText(json['id']),
        nameAr: asText(json['nameAr']),
        nameEn: asText(json['nameEn']),
        extraPrice: asMoney(json['extraPrice']),
        isAvailable: json['isAvailable'] as bool? ?? true,
      );
}

/// مجموعة خيارات على الصنف — «الحجم» (SINGLE) أو «الإضافات» (MULTI).
class MenuOptionGroup {
  const MenuOptionGroup({
    required this.id,
    required this.nameAr,
    required this.type,
    this.nameEn = '',
    this.isRequired = false,
    this.minSelect = 0,
    this.maxSelect = 1,
    this.sortOrder = 0,
    this.options = const [],
  });

  final String id;
  final String nameAr;
  final String nameEn;

  /// "SINGLE" = اختيار واحد · "MULTI" = اختيارات متعددة.
  final String type;
  final bool isRequired;
  final int minSelect;
  final int maxSelect;
  final int sortOrder;
  final List<MenuOption> options;

  bool get isSingle => type == 'SINGLE';

  factory MenuOptionGroup.fromJson(Map<String, dynamic> json) => MenuOptionGroup(
        id: asText(json['id']),
        nameAr: asText(json['nameAr']),
        nameEn: asText(json['nameEn']),
        type: asText(json['type'], 'SINGLE'),
        isRequired: json['isRequired'] as bool? ?? false,
        minSelect: asInt(json['minSelect']),
        maxSelect: asInt(json['maxSelect'], 1),
        sortOrder: asInt(json['sortOrder']),
        options: [
          for (final raw in (json['options'] as List<dynamic>? ?? const []))
            MenuOption.fromJson(raw as Map<String, dynamic>),
        ],
      );
}

class MerchantMenuItem {
  const MerchantMenuItem({
    required this.id,
    required this.categoryId,
    required this.nameAr,
    required this.price,
    required this.availability,
    this.nameEn = '',
    this.descriptionAr,
    this.imageUrl,
    this.oldPrice,
    this.calories,
    this.sortOrder = 0,
    this.branchId,
    this.optionGroups = const [],
  });

  final String id;
  final String categoryId;
  final String nameAr;
  final String nameEn;
  final String? descriptionAr;
  final String? imageUrl;
  final double price;

  /// السعر قبل الخصم — مافيش عمود ليه في جدول menu_items، فبيفضل null دايماً
  /// من الـ API الحالي. سايبينه في الموديل عشان شارة «خصم» في الشاشة.
  final double? oldPrice;

  final int? calories;
  final ItemAvailability availability;
  final int sortOrder;

  /// null = الصنف متاح في كل فروع المطعم.
  final String? branchId;

  final List<MenuOptionGroup> optionGroups;

  bool get isAvailable => availability.isOn;
  bool get hasDiscount => oldPrice != null && oldPrice! > price;

  factory MerchantMenuItem.fromJson(Map<String, dynamic> json) => MerchantMenuItem(
        id: asText(json['id']),
        categoryId: asText(json['categoryId']),
        nameAr: asText(json['nameAr']),
        nameEn: asText(json['nameEn']),
        descriptionAr: json['descriptionAr'] as String?,
        imageUrl: json['imageUrl'] as String?,
        price: asMoney(json['price']),
        oldPrice: asMoneyOrNull(json['oldPrice']),
        calories: asIntOrNull(json['calories']),
        availability: ItemAvailability.fromWire(asText(json['availability'], 'AVAILABLE')),
        sortOrder: asInt(json['sortOrder']),
        branchId: json['branchId'] as String?,
        optionGroups: [
          for (final raw in (json['optionGroups'] as List<dynamic>? ?? const []))
            MenuOptionGroup.fromJson(raw as Map<String, dynamic>),
        ],
      );
}

class MenuCategory {
  const MenuCategory({
    required this.id,
    required this.nameAr,
    this.nameEn = '',
    this.sortOrder = 0,
    this.isActive = true,
    this.items = const [],
  });

  final String id;
  final String nameAr;
  final String nameEn;
  final int sortOrder;
  final bool isActive;
  final List<MerchantMenuItem> items;

  int get itemCount => items.length;

  /// عدد الأصناف الموقوفة في التصنيف — بيظهر كشارة في شاشة المنيو.
  int get unavailableCount => items.where((i) => !i.isAvailable).length;

  factory MenuCategory.fromJson(Map<String, dynamic> json) => MenuCategory(
        id: asText(json['id']),
        nameAr: asText(json['nameAr']),
        nameEn: asText(json['nameEn']),
        sortOrder: asInt(json['sortOrder']),
        isActive: json['isActive'] as bool? ?? true,
        items: [
          for (final raw in (json['items'] as List<dynamic>? ?? const []))
            MerchantMenuItem.fromJson(raw as Map<String, dynamic>),
        ],
      );
}
