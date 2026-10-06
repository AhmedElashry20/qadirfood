// شاشة ٧: إدارة المنيو — تصنيفات + سحب وإفلات للترتيب + بحث + حالة كل صنف ظاهرة
// «إدارة المنيو» — شرائح التصنيفات في الهيدر، بحث تحتها، وصفوف الأصناف بسويتش
// إتاحة سريع. قفل السويتش بيفتح شيت «إيقاف صنف».
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/enums.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../models/menu_item.dart';
import '../../providers/menu_provider.dart';
import '../../widgets/common.dart';
import 'availability_screen.dart';

/// مصفوفة تحويل الصورة لرمادي — الصنف الموقوف بتبان صورته باهتة.
const _kGreyscale = <double>[
  0.2126, 0.7152, 0.0722, 0, 0, //
  0.2126, 0.7152, 0.0722, 0, 0, //
  0.2126, 0.7152, 0.0722, 0, 0, //
  0, 0, 0, 1, 0, //
];

class MenuScreen extends ConsumerStatefulWidget {
  const MenuScreen({super.key});

  @override
  ConsumerState<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends ConsumerState<MenuScreen> {
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _snack(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          backgroundColor: QColors.inkSurface,
          content: Text(message, style: QText.body.copyWith(color: QColors.brand)),
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    final menu = ref.watch(menuProvider);
    final categories = menu.valueOrNull ?? const <MenuCategory>[];
    final active = ref.watch(activeCategoryProvider);

    return Scaffold(
      backgroundColor: QColors.canvas,
      // QHeader جوّه الـ body مش appBar — عشان يأخد ارتفاعه الطبيعي مع صف
      // الشرائح بدل preferredSize الثابت.
      body: Column(
        children: [
          QHeader(
            showBack: false,
            title: 'المنيو',
            trailing: _newItemPill(),
            bottom: categories.isEmpty ? null : _categoryChips(categories, active),
          ),
          _searchRow(),
          Expanded(
            child: RefreshIndicator(
              color: QColors.ink,
              backgroundColor: QColors.surface,
              onRefresh: () => ref.read(menuProvider.notifier).refresh(),
              child: switch (menu) {
                AsyncLoading() => const QLoading(),
                AsyncError(:final error) => _scrollable(
                    QErrorView(
                      message: error is ApiException ? error.message : 'حدث خطأ غير متوقع',
                      onRetry: () => ref.invalidate(menuProvider),
                    ),
                  ),
                _ => _itemsList(),
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _newItemPill() => InkWell(
        onTap: () => context.push(QRoutes.itemEditor),
        borderRadius: BorderRadius.circular(QRadius.pill),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
          decoration: BoxDecoration(
            color: QColors.brand,
            borderRadius: BorderRadius.circular(QRadius.pill),
          ),
          child: Text(
            '+ صنف جديد',
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: QColors.ink,
            ),
          ),
        ),
      );

  Widget _categoryChips(List<MenuCategory> categories, MenuCategory? active) => SizedBox(
        height: 34,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: EdgeInsets.zero,
          itemCount: categories.length + 1,
          separatorBuilder: (_, __) => const SizedBox(width: 8),
          itemBuilder: (_, index) {
            if (index == categories.length) {
              return QChip(label: '+ تصنيف', onTap: _createCategoryDialog);
            }

            final category = categories[index];
            return QChip(
              label: category.nameAr,
              count: category.itemCount,
              selected: category.id == active?.id,
              onTap: () => ref.read(selectedCategoryProvider.notifier).select(category.id),
            );
          },
        ),
      );

  /// البحث محلي (visibleItemsProvider) عشان الاستجابة تكون فورية بدون نداء لكل
  /// حرف — GET /menu/items/search موجود في الريبو لو احتجناه لاحقاً.
  Widget _searchRow() => Padding(
        padding: const EdgeInsets.fromLTRB(QSpace.screenH, 14, QSpace.screenH, 6),
        child: Container(
          decoration: BoxDecoration(
            color: QColors.chip,
            borderRadius: BorderRadius.circular(11),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 14),
          child: TextField(
            controller: _search,
            onChanged: (value) => ref.read(menuSearchProvider.notifier).set(value),
            style: QText.body,
            decoration: const InputDecoration(
              isDense: true,
              filled: false,
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
              contentPadding: EdgeInsets.symmetric(vertical: 14),
              hintText: '⌕ ابحث في الأصناف…',
            ),
          ),
        ),
      );

  /// أي حالة (خطأ/فاضي) لازم تفضل قابلة للسحب عشان السحب للتحديث يشتغل.
  Widget _scrollable(Widget child) => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [const SizedBox(height: 60), child],
      );

  Widget _itemsList() {
    final items = ref.watch(visibleItemsProvider);

    if (items.isEmpty) {
      final searching = ref.watch(menuSearchProvider).trim().isNotEmpty;
      return _scrollable(
        QEmpty(
          message: searching ? 'لا توجد نتيجة لهذا البحث' : 'لا توجد أصناف في هذا التصنيف',
          emoji: '🍔',
        ),
      );
    }

    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(QSpace.screenH, 8, QSpace.screenH, 24),
      itemCount: items.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (_, index) => _itemRow(items[index]),
    );
  }

  Widget _itemRow(MerchantMenuItem item) {
    final row = Row(
      children: [
        _itemImage(item),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                item.nameAr,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: QText.body.copyWith(fontSize: 15, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 5),
              _subLine(item),
            ],
          ),
        ),
        const SizedBox(width: 10),
        QSwitch(
          value: item.isAvailable,
          onChanged: (on) => _toggle(item, on),
        ),
      ],
    );

    return QCard(
      padding: const EdgeInsets.all(12),
      radius: QRadius.lg,
      onTap: () => context.push(QRoutes.editItem(item.id)),
      child: item.isAvailable ? row : Opacity(opacity: 0.6, child: row),
    );
  }

  Widget _itemImage(MerchantMenuItem item) {
    final fallback = Icon(Icons.restaurant, size: 24, color: QColors.faint);
    final url = item.imageUrl;

    Widget image = Container(
      width: 60,
      height: 60,
      alignment: Alignment.center,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: QColors.chip,
        borderRadius: BorderRadius.circular(QRadius.sm),
      ),
      child: url == null || url.isEmpty
          ? fallback
          : Image.network(
              url,
              width: 60,
              height: 60,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => fallback,
            ),
    );

    if (!item.isAvailable) {
      image = ColorFiltered(colorFilter: const ColorFilter.matrix(_kGreyscale), child: image);
    }
    return image;
  }

  Widget _subLine(MerchantMenuItem item) {
    if (!item.isAvailable) {
      return Text(
        item.availability.ar,
        style: TextStyle(
          fontFamily: 'Cairo',
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: QColors.danger,
        ),
      );
    }

    // oldPrice مافيش عمود ليه في menu_items لحد دلوقتي، فالخصم مابيظهرش عملياً
    // — الفرع سايب في الشاشة عشان لما العمود يتضاف.
    final old = item.oldPrice;

    return Row(
      children: [
        QPrice(value: item.price, size: 13),
        if (old != null && old > item.price) ...[
          const SizedBox(width: 8),
          QPrice(value: old, size: 12, color: QColors.hint, strikethrough: true),
          const SizedBox(width: 6),
          Text(
            '· خصم فعّال',
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: QColors.gold,
            ),
          ),
        ],
      ],
    );
  }

  Future<void> _toggle(MerchantMenuItem item, bool on) async {
    // قفل السويتش بيسأل الأول (لحد إمتى)، وفتحه بيرجّع الصنف على طول.
    if (!on) {
      await showDisableItemSheet(context, ref, item);
      return;
    }

    try {
      await ref.read(menuProvider.notifier).setAvailability(item.id, ItemAvailability.available);
    } on ApiException catch (e) {
      if (!mounted) return;
      _snack(e.message);
    }
  }

  Future<void> _createCategoryDialog() async {
    final controller = TextEditingController();

    final name = await showDialog<String>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: QColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(QRadius.xl)),
        title: Text('تصنيف جديد', style: QText.section),
        content: QField(hint: 'مشاوي، مشروبات…', label: 'اسم التصنيف', controller: controller),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(),
            child: Text('إلغاء', style: QText.body.copyWith(color: QColors.textMuted)),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(controller.text.trim()),
            child: Text('إضافة', style: QText.body.copyWith(color: QColors.goldDeep)),
          ),
        ],
      ),
    );

    controller.dispose();
    if (name == null || name.isEmpty) return;

    try {
      await ref.read(menuProvider.notifier).createCategory(name);
    } on ApiException catch (e) {
      if (!mounted) return;
      _snack(e.message);
    }
  }
}
