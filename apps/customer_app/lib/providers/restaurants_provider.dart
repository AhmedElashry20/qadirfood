// المطاعم القريبة والبحث والفلاتر والمفضلة — كلها من الـ API.
// الترتيب بيتعمل على السيرفر (?sort=)، والفلاتر (توصيل مجاني/أقل من ٣٠ د/التقييم/مفتوح)
// بتتعمل محلياً على النتيجة لأن الـ API مافيهوش الفلاتر دي.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/api_repository.dart';
import '../models/menu_item.dart';
import '../models/restaurant.dart';
import 'location_provider.dart';

// ─────────────────────────── التصنيفات ───────────────────────────

/// الـ API مافيهوش endpoint للتصنيفات — القائمة ثابتة هنا (نفس اللي الرئيسية بتعرضها).
const _categories = <FoodCategory>[
  FoodCategory(
    id: 'burger',
    name: 'برجر',
    imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=200&q=60',
  ),
  FoodCategory(
    id: 'pizza',
    name: 'بيتزا',
    imageUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=200&q=60',
  ),
  FoodCategory(
    id: 'grill',
    name: 'مشويات',
    imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=200&q=60',
  ),
  FoodCategory(
    id: 'sushi',
    name: 'سوشي',
    imageUrl: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=200&q=60',
  ),
  FoodCategory(
    id: 'dessert',
    name: 'حلويات',
    imageUrl: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=200&q=60',
  ),
  FoodCategory(
    id: 'rice',
    name: 'رز ومندي',
    imageUrl: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=200&q=60',
  ),
];

/// كلمة البحث اللي بتتبعت للـ API بدل التصنيف (مافيش endpoint للتصنيفات).
const _categorySearchTerms = <String, String>{
  'burger': 'برجر',
  'pizza': 'بيتزا',
  'grill': 'مشويات',
  'sushi': 'سوشي',
  'dessert': 'حلويات',
  'rice': 'رز',
};

final categoriesProvider = Provider<List<FoodCategory>>((ref) => _categories);

// ─────────────────────────── المطاعم ───────────────────────────

/// GET /customer/branches — حوالين عنوان التوصيل (أو الرياض) في نطاق ١٥ كم.
final restaurantsProvider = FutureProvider<List<Restaurant>>((ref) async {
  final filters = ref.watch(filtersProvider);
  final here = ref.watch(currentLatLngProvider);

  final branches = await ref.watch(customerRepositoryProvider).branches(
        lat: here.lat,
        lng: here.lng,
        radiusKm: 15,
        sort: filters.serverSort,
      );

  return filters.apply(branches);
});

/// GET /customer/branches/:id + منيوه — شاشة المطعم بتاخد الاتنين مرة واحدة.
final restaurantProvider = FutureProvider.family<Restaurant, String>(
  (ref, branchId) => ref.watch(customerRepositoryProvider).branchWithMenu(branchId),
);

/// مطاعم تصنيف معيّن (شاشة ١٣) — بيتحوّل لبحث نصي على الـ API.
final categoryRestaurantsProvider =
    FutureProvider.family<List<Restaurant>, String>((ref, categoryId) async {
  final filters = ref.watch(filtersProvider);
  final here = ref.watch(currentLatLngProvider);

  final branches = await ref.watch(customerRepositoryProvider).branches(
        lat: here.lat,
        lng: here.lng,
        q: _categorySearchTerms[categoryId] ?? categoryId,
        sort: filters.serverSort,
      );

  return filters.apply(branches);
});

// ─────────────────────────── البحث ───────────────────────────

/// نتيجة البحث (شاشة ١١).
///
/// `items` **دايماً فاضية** دلوقتي: الـ API بيبحث في أسماء المطاعم والمطبخ
/// وأسماء الأصناف مع بعض وبيرجّع فروع بس — مافيش نتائج على مستوى الصنف.
class SearchResults {
  const SearchResults({required this.restaurants, required this.items});

  final List<Restaurant> restaurants;
  final List<MenuItem> items;

  bool get isEmpty => restaurants.isEmpty && items.isEmpty;
}

final searchProvider = FutureProvider.family<SearchResults, String>((ref, query) async {
  final q = query.trim();
  if (q.isEmpty) return const SearchResults(restaurants: [], items: []);

  final filters = ref.watch(filtersProvider);
  final here = ref.watch(currentLatLngProvider);

  final branches = await ref.watch(customerRepositoryProvider).branches(
        lat: here.lat,
        lng: here.lng,
        q: q,
        sort: filters.serverSort,
      );

  return SearchResults(restaurants: filters.apply(branches), items: const []);
});

// ─────────────────────────── الفلاتر ───────────────────────────

/// ترتيب النتائج — نفس خيارات شريط «الترتيب» في التصميم.
enum SortBy {
  nearest('الأقرب'),
  fastest('الأسرع'),
  topRated('الأعلى تقييماً'),
  offers('عروض');

  const SortBy(this.ar);
  final String ar;
}

class RestaurantFilters {
  const RestaurantFilters({
    this.sortBy = SortBy.nearest,
    this.freeDeliveryOnly = false,
    this.under30Minutes = false,
    this.minRating,
    this.openNowOnly = false,
  });

  final SortBy sortBy;
  final bool freeDeliveryOnly;
  final bool under30Minutes;

  /// 4.0 مثلاً = «4★ فأعلى».
  final double? minRating;
  final bool openNowOnly;

  int get activeCount =>
      (freeDeliveryOnly ? 1 : 0) +
      (under30Minutes ? 1 : 0) +
      (minRating != null ? 1 : 0) +
      (openNowOnly ? 1 : 0);

  /// الترتيب اللي بيتبعت للـ API — «عروض» مالوش مقابل فبنرتّبه محلياً.
  BranchSort? get serverSort => switch (sortBy) {
        SortBy.nearest => BranchSort.nearest,
        SortBy.fastest => BranchSort.fastest,
        SortBy.topRated => BranchSort.topRated,
        SortBy.offers => null,
      };

  bool _matches(Restaurant r) {
    if (freeDeliveryOnly && !r.isFreeDelivery) return false;
    if (under30Minutes && r.etaMaxMinutes > 30) return false;
    if (minRating != null && r.rating < minRating!) return false;
    if (openNowOnly && !r.isOpen) return false;
    return true;
  }

  /// فلترة محلية على نتيجة السيرفر — الترتيب نفسه محفوظ زي ما جه من الـ API.
  List<Restaurant> apply(List<Restaurant> input) {
    final out = [
      for (final r in input)
        if (_matches(r)) r
    ];

    // «عروض» — الوحيد اللي السيرفر مابيرتّبوش.
    if (sortBy == SortBy.offers) {
      out.sort((a, b) => (b.discountPercent ?? 0).compareTo(a.discountPercent ?? 0));
    }

    // المطاعم المقفولة دايماً في الآخر (تقسيم — عشان مانخربش ترتيب السيرفر).
    return [
      for (final r in out)
        if (r.isOpen) r,
      for (final r in out)
        if (!r.isOpen) r,
    ];
  }

  RestaurantFilters copyWith({
    SortBy? sortBy,
    bool? freeDeliveryOnly,
    bool? under30Minutes,
    double? minRating,
    bool clearMinRating = false,
    bool? openNowOnly,
  }) =>
      RestaurantFilters(
        sortBy: sortBy ?? this.sortBy,
        freeDeliveryOnly: freeDeliveryOnly ?? this.freeDeliveryOnly,
        under30Minutes: under30Minutes ?? this.under30Minutes,
        minRating: clearMinRating ? null : (minRating ?? this.minRating),
        openNowOnly: openNowOnly ?? this.openNowOnly,
      );
}

class FiltersNotifier extends Notifier<RestaurantFilters> {
  @override
  RestaurantFilters build() => const RestaurantFilters();

  void setSort(SortBy sort) => state = state.copyWith(sortBy: sort);

  void toggleFreeDelivery() => state = state.copyWith(freeDeliveryOnly: !state.freeDeliveryOnly);

  void toggleUnder30() => state = state.copyWith(under30Minutes: !state.under30Minutes);

  void toggleOpenNow() => state = state.copyWith(openNowOnly: !state.openNowOnly);

  void toggleMinRating(double value) => state = state.minRating == value
      ? state.copyWith(clearMinRating: true)
      : state.copyWith(minRating: value);

  void reset() => state = const RestaurantFilters();
}

final filtersProvider = NotifierProvider<FiltersNotifier, RestaurantFilters>(FiltersNotifier.new);

// ─────────────────────────── المفضلة ───────────────────────────

/// معرّفات الفروع المفضّلة — GET /customer/favorites.
class FavoritesNotifier extends AsyncNotifier<Set<String>> {
  @override
  Future<Set<String>> build() async {
    final branches = await ref.watch(customerRepositoryProvider).favorites();
    return {for (final r in branches) r.id};
  }

  /// POST/DELETE /customer/favorites/:branchId — تحديث متفائل مع رجوع لو فشل.
  Future<void> toggle(String branchId) async {
    final current = state.value ?? const <String>{};
    final willBeFavorite = !current.contains(branchId);

    final next = {...current};
    willBeFavorite ? next.add(branchId) : next.remove(branchId);
    state = AsyncData(next);

    try {
      await ref.read(customerRepositoryProvider).toggleFavorite(branchId, willBeFavorite);
    } catch (_) {
      state = AsyncData(current); // النداء فشل — رجّع الحالة القديمة
      rethrow;
    }

    ref.invalidate(favoriteRestaurantsProvider);
  }

  bool contains(String branchId) => state.value?.contains(branchId) ?? false;
}

final favoritesProvider =
    AsyncNotifierProvider<FavoritesNotifier, Set<String>>(FavoritesNotifier.new);

/// هل الفرع في المفضلة؟ — للقلب فوق كارت المطعم من غير ما الشاشة تفك الـ AsyncValue.
final isFavoriteProvider = Provider.family<bool, String>(
  (ref, branchId) => ref.watch(favoritesProvider).value?.contains(branchId) ?? false,
);

/// المطاعم المفضّلة كاملة (شاشة ٢٢) — GET /customer/favorites.
final favoriteRestaurantsProvider = FutureProvider<List<Restaurant>>((ref) {
  final here = ref.watch(currentLatLngProvider);
  return ref.watch(customerRepositoryProvider).favorites(lat: here.lat, lng: here.lng);
});
