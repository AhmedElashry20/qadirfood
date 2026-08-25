// المنيو — التصنيفات والأصناف والإتاحة
// مصدر الحقيقة الوحيد: GET /menu/categories (بيرجّع التصنيفات وجوّاها أصنافها).
// أي تعديل بينادي الـ API الأول وبعدين بيعيد تحميل المنيو كله — مافيش تعديل محلي
// عشان ترتيب sortOrder وحقول السيرفر تفضل مظبوطة.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/enums.dart';
import '../data/merchant_repository.dart';
import '../models/menu_item.dart';

class MenuNotifier extends AsyncNotifier<List<MenuCategory>> {
  @override
  Future<List<MenuCategory>> build() => ref.watch(menuRepositoryProvider).categories();

  MenuRepository get _repo => ref.read(menuRepositoryProvider);

  /// إعادة تحميل كاملة — سحب لتحديث وزرار «إعادة المحاولة».
  Future<void> refresh() async {
    state = await AsyncValue.guard(_repo.categories);
  }

  /// بيعيد التحميل من غير ما يرجّع الشاشة لحالة التحميل (البيانات القديمة
  /// بتفضل ظاهرة لحد ما الجديدة توصل).
  Future<void> _reload() async {
    state = await AsyncValue.guard(_repo.categories);
  }

  /// إتاحة/إيقاف صنف — بيرمي [ApiException] للشاشة تعرضها في SnackBar.
  Future<void> setAvailability(String itemId, ItemAvailability availability) async {
    await _repo.setAvailability([itemId], availability);
    await _reload();
  }

  /// POST /menu/categories — الـ API بياخد nameAr و nameEn والاتنين أعمدة
  /// إلزامية في Prisma، فلو الإنجليزي فاضي بنبعت نص فاضي مش null.
  Future<void> createCategory(String nameAr, [String nameEn = '']) async {
    await _repo.createCategory(nameAr, nameEn);
    await _reload();
  }

  /// إنشاء أو تعديل صنف — [id] فاضي معناه صنف جديد.
  /// ملاحظة: PATCH /menu/items/:id مابيقبلش optionGroups متداخلة (بيعدّي
  /// الجسم لـ Prisma زي ما هو)، فمجموعات الإضافات مابتتبعتش في التعديل.
  Future<void> saveItem({
    String? id,
    required String categoryId,
    required String nameAr,
    required String nameEn,
    required double price,
    String? descriptionAr,
    int? calories,
  }) async {
    if (id == null) {
      await _repo.createItem(
        categoryId: categoryId,
        nameAr: nameAr,
        nameEn: nameEn,
        price: price,
        descriptionAr: descriptionAr,
        calories: calories,
      );
    } else {
      await _repo.updateItem(id, {
        'categoryId': categoryId,
        'nameAr': nameAr,
        'nameEn': nameEn,
        'price': price,
        'descriptionAr': descriptionAr,
        'calories': calories,
      });
    }
    await _reload();
  }

  Future<void> deleteItem(String id) async {
    await _repo.deleteItem(id);
    await _reload();
  }
}

final menuProvider = AsyncNotifierProvider<MenuNotifier, List<MenuCategory>>(MenuNotifier.new);

/// التصنيف المختار — null معناه أول تصنيف في القائمة.
class SelectedCategoryNotifier extends Notifier<String?> {
  @override
  String? build() => null;

  void select(String? categoryId) => state = categoryId;
}

final selectedCategoryProvider =
    NotifierProvider<SelectedCategoryNotifier, String?>(SelectedCategoryNotifier.new);

/// نص البحث في شاشة المنيو.
class MenuSearchNotifier extends Notifier<String> {
  @override
  String build() => '';

  void set(String query) => state = query;
}

final menuSearchProvider = NotifierProvider<MenuSearchNotifier, String>(MenuSearchNotifier.new);

/// التصنيف الظاهر فعلياً — المختار أو أول واحد.
final activeCategoryProvider = Provider<MenuCategory?>((ref) {
  final categories = ref.watch(menuProvider).valueOrNull ?? const <MenuCategory>[];
  if (categories.isEmpty) return null;

  final selectedId = ref.watch(selectedCategoryProvider);
  if (selectedId == null) return categories.first;

  for (final category in categories) {
    if (category.id == selectedId) return category;
  }
  return categories.first;
});

/// أصناف التصنيف المختار بعد فلترة البحث.
/// الفلترة محلية عن قصد: GET /menu/items/search موجود بس بيعمل نداء لكل حرف
/// وبيرجّع أصناف من كل التصنيفات — الفلترة المحلية أسرع وأدق للشاشة دي.
final visibleItemsProvider = Provider<List<MerchantMenuItem>>((ref) {
  final category = ref.watch(activeCategoryProvider);
  if (category == null) return const [];

  final items = [...category.items]..sort((a, b) => a.sortOrder.compareTo(b.sortOrder));

  final query = ref.watch(menuSearchProvider).trim().toLowerCase();
  if (query.isEmpty) return items;

  return items.where((item) {
    return item.nameAr.toLowerCase().contains(query) || item.nameEn.toLowerCase().contains(query);
  }).toList();
});
