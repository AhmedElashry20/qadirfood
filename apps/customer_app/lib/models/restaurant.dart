// المطعم والتصنيف — الموديل بيتبني من BranchDto اللي راجع من الـ API.
// ملاحظة مهمة: `id` هنا = **معرّف الفرع (branchId)** لأنه ده اللي الطلبات والمنيو بيشتغلوا بيه.
import 'menu_item.dart';

class Restaurant {
  const Restaurant({
    required String id,
    String? branchId,
    this.restaurantId,
    required this.name,
    required this.cuisine,
    required this.coverUrl,
    this.logoUrl,
    required this.rating,
    required this.ratingCount,
    required this.distanceKm,
    required this.etaMinMinutes,
    required this.etaMaxMinutes,
    required this.deliveryFee,
    double? minOrder,
    double? minOrderTotal,
    this.isOpen = true,
    this.isFavorite = false,
    this.opensAtLabel,
    this.discountPercent,
    this.badge,
    this.branchName,
    this.address,
    this.lat,
    this.lng,
    this.categoryIds = const [],
    this.sections = const [],
  })  : id = id,
        branchId = branchId ?? id,
        minOrder = minOrder ?? minOrderTotal ?? 0.0;

  /// معرّف الفرع (نفس `branchId`) — كل الراوتس والطلبات بتستخدمه.
  final String id;

  /// نفس `id` — موجود بالاسم ده عشان الوضوح عند إنشاء الطلب.
  final String branchId;

  /// معرّف المطعم الأب في الـ API (مش الفرع).
  final String? restaurantId;

  /// اسم المطعم (restaurantNameAr).
  final String name;

  /// «برجر · أمريكي»
  final String cuisine;
  final String coverUrl;
  final String? logoUrl;
  final double rating;
  final int ratingCount;
  final double distanceKm;
  final int etaMinMinutes;
  final int etaMaxMinutes;

  /// صفر = توصيل مجاني.
  final double deliveryFee;
  final double minOrder;
  final bool isOpen;
  final bool isFavorite;

  /// «يفتح 4:00 PM» — يظهر فوق الكارت وهو مقفول.
  final String? opensAtLabel;
  final int? discountPercent;

  /// شارة فوق الصورة: «الأكثر طلباً» / «توصيل مجاني».
  final String? badge;

  /// اسم الفرع نفسه («فرع النخيل») — بيرجع من الـ API في `nameAr`.
  final String? branchName;

  /// عنوان الفرع النصي (من تفاصيل الفرع).
  final String? address;
  final double? lat;
  final double? lng;

  final List<String> categoryIds;
  final List<MenuSection> sections;

  /// نفس `minOrder` — بالاسم اللي بيرجع من الـ API.
  double get minOrderTotal => minOrder;

  bool get isFreeDelivery => deliveryFee == 0;
  String get etaLabel => '$etaMinMinutes-$etaMaxMinutes';

  /// كل أصناف المطعم في قائمة واحدة (للبحث ولتبويب «الأكثر طلباً»).
  List<MenuItem> get allItems => [for (final s in sections) ...s.items];

  /// BranchDto (القائمة أو التفاصيل) → Restaurant.
  /// المنيو بييجي من نداء منفصل، فبنمرره هنا أو بنضيفه بعدين بـ [copyWith].
  factory Restaurant.fromJson(
    Map<String, dynamic> json, {
    List<MenuSection> sections = const [],
  }) {
    final logoUrl = json['logoUrl'] as String?;
    final coverUrl = (json['coverUrl'] as String?) ?? logoUrl ?? '';
    final deliveryFee = (json['deliveryFee'] as num?)?.toDouble() ?? 0;
    final isOpen = json['isOpenNow'] as bool? ?? (json['status'] == 'OPEN');

    return Restaurant(
      id: json['id'] as String,
      branchId: json['id'] as String,
      restaurantId: json['restaurantId'] as String?,
      name: (json['restaurantNameAr'] ?? json['nameAr'] ?? '') as String,
      cuisine: (json['cuisineAr'] as String?) ?? '',
      coverUrl: coverUrl,
      logoUrl: logoUrl,
      rating: (json['rating'] as num?)?.toDouble() ?? 0,
      ratingCount: (json['ratingCount'] as num?)?.toInt() ?? 0,
      distanceKm: (json['distanceKm'] as num?)?.toDouble() ?? 0,
      etaMinMinutes: (json['etaMinMinutes'] as num?)?.toInt() ?? 0,
      etaMaxMinutes: (json['etaMaxMinutes'] as num?)?.toInt() ?? 0,
      deliveryFee: deliveryFee,
      minOrderTotal: (json['minOrderTotal'] as num?)?.toDouble() ?? 0,
      isOpen: isOpen,
      isFavorite: json['isFavorite'] as bool? ?? false,
      opensAtLabel: isOpen ? null : _opensAtLabel(json['workingHours']),
      badge: deliveryFee == 0 ? 'توصيل مجاني' : null,
      branchName: json['nameAr'] as String?,
      address: json['address'] as String?,
      lat: (json['lat'] as num?)?.toDouble(),
      lng: (json['lng'] as num?)?.toDouble(),
      sections: sections,
    );
  }

  /// «يفتح 10:00» — من مواعيد عمل اليوم لو الفرع مقفول.
  static String? _opensAtLabel(dynamic workingHours) {
    if (workingHours is! List) return null;
    // الـ API: 0 = الأحد … 6 = السبت · Dart: 1 = الاثنين … 7 = الأحد
    final today = DateTime.now().weekday % 7;
    for (final raw in workingHours) {
      if (raw is! Map) continue;
      if (raw['weekday'] != today) continue;
      if (raw['isClosed'] == true) return null;
      final opensAt = raw['opensAt'] as String?;
      return opensAt == null ? null : 'يفتح $opensAt';
    }
    return null;
  }

  Restaurant copyWith({
    String? name,
    String? cuisine,
    String? coverUrl,
    bool? isOpen,
    bool? isFavorite,
    double? distanceKm,
    List<String>? categoryIds,
    List<MenuSection>? sections,
  }) =>
      Restaurant(
        id: id,
        branchId: branchId,
        restaurantId: restaurantId,
        name: name ?? this.name,
        cuisine: cuisine ?? this.cuisine,
        coverUrl: coverUrl ?? this.coverUrl,
        logoUrl: logoUrl,
        rating: rating,
        ratingCount: ratingCount,
        distanceKm: distanceKm ?? this.distanceKm,
        etaMinMinutes: etaMinMinutes,
        etaMaxMinutes: etaMaxMinutes,
        deliveryFee: deliveryFee,
        minOrder: minOrder,
        isOpen: isOpen ?? this.isOpen,
        isFavorite: isFavorite ?? this.isFavorite,
        opensAtLabel: opensAtLabel,
        discountPercent: discountPercent,
        badge: badge,
        branchName: branchName,
        address: address,
        lat: lat,
        lng: lng,
        categoryIds: categoryIds ?? this.categoryIds,
        sections: sections ?? this.sections,
      );
}

/// تصنيف الأكل في الرئيسية (برجر، بيتزا، مشويات…).
/// الـ API لسه مافيهوش endpoint للتصنيفات — البروڤايدر بيستخدم قائمة ثابتة.
class FoodCategory {
  const FoodCategory({required this.id, required this.name, required this.imageUrl});

  final String id;
  final String name;
  final String imageUrl;

  factory FoodCategory.fromJson(Map<String, dynamic> json) => FoodCategory(
        id: json['id'] as String,
        name: (json['nameAr'] ?? json['name'] ?? '') as String,
        imageUrl: (json['imageUrl'] as String?) ?? '',
      );
}
