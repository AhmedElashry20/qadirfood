// شاشة ١٥: صفحة الصنف — الخيارات والإضافات، الكمية، ملاحظات
// الفرع ومنيوه بييجوا من الـ API (restaurantProvider) — الصنف بيتلقط من أقسام المنيو.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../../models/menu_item.dart';
import '../../models/restaurant.dart';
import '../../providers/cart_provider.dart';
import '../../providers/restaurants_provider.dart';
import '../../widgets/common.dart';
import '../../widgets/option_group_selector.dart';

class ItemScreen extends ConsumerStatefulWidget {
  const ItemScreen({super.key, required this.restaurantId, required this.itemId});

  final String restaurantId;
  final String itemId;

  @override
  ConsumerState<ItemScreen> createState() => _ItemScreenState();
}

class _ItemScreenState extends ConsumerState<ItemScreen> {
  final _selectedIds = <String>{};
  final _notesController = TextEditingController();
  int _quantity = 1;
  bool _preselected = false;

  @override
  void dispose() {
    _notesController.dispose();
    super.dispose();
  }

  /// الصنف من أقسام منيو الفرع (المنيو محمّل مع الفرع في نفس النداء).
  MenuItem? _itemIn(Restaurant restaurant) {
    for (final item in restaurant.allItems) {
      if (item.id == widget.itemId) return item;
    }
    return null;
  }

  /// الخيار الأول في كل مجموعة إجبارية أحادية = مختار مبدئياً.
  /// بيتنفّذ مرة واحدة أول ما الصنف يوصل من الـ API (مش في initState — البيانات ساعتها لسه بتحمّل).
  void _preselectRequired(MenuItem item) {
    if (_preselected) return;
    _preselected = true;

    for (final g in item.optionGroups) {
      if (g.isRequired && g.isSingleChoice && g.options.isNotEmpty) {
        _selectedIds.add(g.options.first.id);
      }
    }
  }

  void _toggle(OptionGroup group, ItemOption option) {
    final selected = _selectedIds.contains(option.id);

    if (group.isSingleChoice) {
      // إلغاء الاختيار مسموح بس في المجموعات الاختيارية.
      if (selected && group.isRequired) return;
      setState(() {
        for (final o in group.options) {
          _selectedIds.remove(o.id);
        }
        if (!selected) _selectedIds.add(option.id);
      });
      return;
    }

    if (selected) {
      setState(() => _selectedIds.remove(option.id));
      return;
    }

    final count = group.options.where((o) => _selectedIds.contains(o.id)).length;
    if (count >= group.maxSelections) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(
          SnackBar(
            content: Text(
              'أقصى عدد إضافات: ${group.maxSelections}',
              style: TextStyle(
                fontFamily: 'Cairo',
                fontSize: 13.5,
                fontWeight: FontWeight.w800,
                color: QColors.brand,
              ),
            ),
            behavior: SnackBarBehavior.floating,
            backgroundColor: QColors.inkSurface,
            duration: const Duration(seconds: 2),
          ),
        );
      return;
    }

    setState(() => _selectedIds.add(option.id));
  }

  List<ItemOption> _selectedOptions(MenuItem item) => [
        for (final g in item.optionGroups) ...g.options.where((o) => _selectedIds.contains(o.id)),
      ];

  void _add(Restaurant restaurant, MenuItem item) {
    final notes = _notesController.text.trim();

    ref.read(cartProvider.notifier).add(
          restaurant,
          item,
          options: _selectedOptions(item),
          quantity: _quantity,
          notes: notes.isEmpty ? null : notes,
        );
    context.pop();
  }

  @override
  Widget build(BuildContext context) {
    return ref.watch(restaurantProvider(widget.restaurantId)).when(
          loading: () => Scaffold(
            backgroundColor: QColors.surface,
            body: Center(child: CircularProgressIndicator(color: QColors.brand)),
          ),
          error: (error, _) => _error(error is ApiException ? error.message : 'حدث خطأ'),
          data: (restaurant) {
            final item = _itemIn(restaurant);
            if (item == null) return _error('الصنف غير موجود في القائمة');

            _preselectRequired(item);
            return _loaded(restaurant, item);
          },
        );
  }

  Widget _error(String message) => Scaffold(
        backgroundColor: QColors.surface,
        body: _ErrorView(
          message: message,
          onRetry: () => ref.invalidate(restaurantProvider(widget.restaurantId)),
        ),
      );

  Widget _loaded(Restaurant restaurant, MenuItem item) {
    final options = _selectedOptions(item);
    final extras = options.fold(0.0, (sum, o) => sum + o.extraPrice);
    final totalPrice = (item.price + extras) * _quantity;

    return Scaffold(
      backgroundColor: QColors.surface,
      body: Column(
        children: [
          SizedBox(
            height: 250,
            width: double.infinity,
            child: Stack(
              fit: StackFit.expand,
              children: [
                QImage(url: item.imageUrl),
                const SafeArea(
                  bottom: false,
                  child: Padding(
                    padding: EdgeInsets.fromLTRB(QSpace.screenH, 12, QSpace.screenH, 0),
                    child: Align(
                      alignment: AlignmentDirectional.topStart,
                      child: QBackButton(light: true),
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: Container(
              transform: Matrix4.translationValues(0, -24, 0),
              decoration: BoxDecoration(
                color: QColors.surface,
                borderRadius: const BorderRadius.vertical(top: Radius.circular(QRadius.sheet)),
              ),
              clipBehavior: Clip.antiAlias,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(QSpace.screenH, 20, QSpace.screenH, 44),
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Text(
                          item.name,
                          style: TextStyle(
                            fontFamily: 'Cairo',
                            fontSize: 20,
                            fontWeight: FontWeight.w900,
                            color: QColors.ink,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      QPrice(value: item.price, size: 18),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Text(item.description, style: QText.caption.copyWith(fontSize: 13.5)),
                  for (final group in item.optionGroups) ...[
                    const SizedBox(height: 14),
                    OptionGroupSelector(
                      group: group,
                      selectedIds: _selectedIds,
                      onToggle: (option) => _toggle(group, option),
                    ),
                  ],
                  const SizedBox(height: 14),
                  QField(
                    label: 'ملاحظات (اختياري)',
                    hint: 'مثال: بدون بصل، صوص زيادة…',
                    controller: _notesController,
                    maxLines: 2,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: QColors.surface,
          border: Border(top: BorderSide(color: QColors.line)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // نفس بانر «مغلق» بتاع صفحة المطعم — الزر متعطّل والصنف مايتضافش للسلة.
            if (!restaurant.isOpen)
              Padding(
                padding: const EdgeInsets.fromLTRB(QSpace.screenH, 12, QSpace.screenH, 0),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  decoration: BoxDecoration(
                    color: QColors.tint,
                    borderRadius: BorderRadius.circular(QRadius.md),
                  ),
                  child: Text(
                    'المطعم مغلق حالياً — ${restaurant.opensAtLabel ?? ''}'.trim(),
                    style: TextStyle(
                      fontFamily: 'Cairo',
                      fontSize: 13.5,
                      fontWeight: FontWeight.w800,
                      color: QColors.goldDeep,
                    ),
                  ),
                ),
              ),
            QBottomBar(
              color: Colors.transparent,
              child: Row(
                children: [
                  QQuantityStepper(
                    quantity: _quantity,
                    onIncrement: () => setState(() => _quantity++),
                    onDecrement: () => setState(() {
                      if (_quantity > 1) _quantity--;
                    }),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: QButton(
                      label: 'أضف للسلة',
                      trailing: QPrice(value: totalPrice, size: 15),
                      enabled: restaurant.isOpen,
                      onPressed: restaurant.isOpen ? () => _add(restaurant, item) : null,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// فشل تحميل الصنف — رسالة السيرفر + إعادة المحاولة (مع زر رجوع عشان الشاشة ماتبقاش طريق مسدود).
class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Center(
          child: Padding(
            padding: const EdgeInsets.all(QSpace.screenH),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('😕', style: TextStyle(fontSize: 56)),
                const SizedBox(height: 14),
                Text(message, textAlign: TextAlign.center, style: QText.section),
                const SizedBox(height: 20),
                SizedBox(
                  width: 200,
                  child: QButton(label: 'إعادة المحاولة', onPressed: onRetry),
                ),
              ],
            ),
          ),
        ),
        const SafeArea(
          child: Padding(
            padding: EdgeInsets.fromLTRB(QSpace.screenH, 12, QSpace.screenH, 0),
            child: Align(
              alignment: AlignmentDirectional.topStart,
              child: QBackButton(),
            ),
          ),
        ),
      ],
    );
  }
}
