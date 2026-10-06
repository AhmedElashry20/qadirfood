// شاشة ٨: إضافة/تعديل صنف — اسم عربي/إنجليزي، وصف، صورة، سعر، تصنيف، مجموعات خيارات وإضافات، سعرات
// [itemId] فاضي = صنف جديد.
//
// حدود الـ API الحالية:
//  • مافيش مسار رفع صور — «تغيير الصورة» بيعرض SnackBar بس.
//  • POST /menu/items بيقبل optionGroups متداخلة، لكن PATCH /menu/items/:id
//    بيمرّر الجسم لـ Prisma زي ما هو من غير DTO، فمابيقبلش مصفوفة مسطّحة.
//    عشان كده المجموعات بتتعرض للقراءة بس والتعديل عليها «قريباً».
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/format.dart' as fmt;
import '../../core/theme.dart';
import '../../models/menu_item.dart';
import '../../providers/menu_provider.dart';
import '../../widgets/common.dart';

class ItemEditorScreen extends ConsumerStatefulWidget {
  const ItemEditorScreen({super.key, this.itemId});

  /// null = صنف جديد.
  final String? itemId;

  @override
  ConsumerState<ItemEditorScreen> createState() => _ItemEditorScreenState();
}

class _ItemEditorScreenState extends ConsumerState<ItemEditorScreen> {
  final _nameAr = TextEditingController();
  final _nameEn = TextEditingController();
  final _calories = TextEditingController();
  final _price = TextEditingController();
  final _description = TextEditingController();

  String? _categoryId;
  bool _hydrated = false;
  bool _saving = false;

  bool get _isEdit => widget.itemId != null;

  // ملاحظة: الحقول بتتملي مرة واحدة أول ما GET /menu/categories يرجّع.

  @override
  void dispose() {
    _nameAr.dispose();
    _nameEn.dispose();
    _calories.dispose();
    _price.dispose();
    _description.dispose();
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

  /// بيملأ الحقول أول ما المنيو يوصل — مرة واحدة بس عشان ما نمسحش كتابة المستخدم.
  void _hydrate(List<MenuCategory> categories, MerchantMenuItem? item) {
    if (_hydrated || categories.isEmpty) return;
    _hydrated = true;

    if (item == null) {
      _categoryId = categories.first.id;
      return;
    }

    _nameAr.text = item.nameAr;
    _nameEn.text = item.nameEn;
    _calories.text = item.calories?.toString() ?? '';
    _price.text = fmt.money(item.price);
    _description.text = item.descriptionAr ?? '';
    _categoryId = item.categoryId;
  }

  MerchantMenuItem? _findItem(List<MenuCategory> categories) {
    final id = widget.itemId;
    if (id == null) return null;

    for (final category in categories) {
      for (final item in category.items) {
        if (item.id == id) return item;
      }
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final menu = ref.watch(menuProvider);

    return Scaffold(
      backgroundColor: QColors.surface,
      body: switch (menu) {
        AsyncLoading() => const SafeArea(child: QLoading()),
        AsyncError(:final error) => SafeArea(
            child: QErrorView(
              message: error is ApiException ? error.message : 'حدث خطأ غير متوقع',
              onRetry: () => ref.invalidate(menuProvider),
            ),
          ),
        AsyncValue(:final value) => _form(value ?? const []),
      },
    );
  }

  Widget _form(List<MenuCategory> categories) {
    final item = _findItem(categories);
    _hydrate(categories, item);

    return SafeArea(
      child: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.fromLTRB(QSpace.screenH, 14, QSpace.screenH, 20),
              children: [
                _topRow(),
                const SizedBox(height: 18),
                _imageBlock(item),
                const SizedBox(height: 20),
                QField(
                  label: 'اسم الصنف (عربي)',
                  hint: 'برجر لحم أنجوس',
                  controller: _nameAr,
                ),
                const SizedBox(height: 14),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      flex: 2,
                      child: QField(
                        label: 'الاسم (إنجليزي)',
                        hint: 'Angus Beef Burger',
                        controller: _nameEn,
                        textDirection: TextDirection.ltr,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 1,
                      child: QField(
                        label: 'السعرات (اختياري)',
                        hint: '650',
                        controller: _calories,
                        keyboardType: TextInputType.number,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(flex: 14, child: _categoryDropdown(categories)),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 10,
                      child: QField(
                        label: 'السعر (ر.س)',
                        hint: '39',
                        controller: _price,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),
                QField(
                  label: 'الوصف',
                  hint: 'مكونات الصنف باختصار…',
                  controller: _description,
                  maxLines: 3,
                ),
                const SizedBox(height: 24),
                _groupsSection(item),
              ],
            ),
          ),
          _bottomBar(),
        ],
      ),
    );
  }

  Widget _topRow() => Row(
        children: [
          InkWell(
            onTap: () => Navigator.of(context).maybePop(),
            borderRadius: BorderRadius.circular(QRadius.sm),
            child: Container(
              width: 38,
              height: 38,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: QColors.chip,
                borderRadius: BorderRadius.circular(QRadius.sm),
              ),
              child: Icon(Icons.close, size: 19, color: QColors.ink),
            ),
          ),
          const SizedBox(width: 12),
          Text(
            _isEdit ? 'تعديل صنف' : 'صنف جديد',
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 19,
              fontWeight: FontWeight.w900,
              color: QColors.ink,
            ),
          ),
        ],
      );

  /// مافيش مسار رفع صور في الـ API — الزر بيوضّح كده للمستخدم.
  Widget _imageBlock(MerchantMenuItem? item) {
    final url = item?.imageUrl;
    final hasImage = url != null && url.isNotEmpty;

    return SizedBox(
      height: 120,
      child: Stack(
        fit: StackFit.expand,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(QRadius.lg),
            child: hasImage
                ? Image.network(
                    url,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => const _ImagePlaceholder(),
                  )
                : const _ImagePlaceholder(),
          ),
          Positioned(
            bottom: 10,
            left: 10,
            child: InkWell(
              onTap: () => _snack('رفع الصور محتاج ربط التخزين'),
              borderRadius: BorderRadius.circular(QRadius.pill),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: QColors.inkSurface.withValues(alpha: 0.85),
                  borderRadius: BorderRadius.circular(QRadius.pill),
                ),
                child: Text(
                  '📷 تغيير الصورة',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 12.5,
                    fontWeight: FontWeight.w800,
                    color: QColors.brand,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _categoryDropdown(List<MenuCategory> categories) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('التصنيف', style: QText.fieldLabel),
          const SizedBox(height: 6),
          DropdownButtonFormField<String>(
            initialValue: categories.any((c) => c.id == _categoryId) ? _categoryId : null,
            isExpanded: true,
            icon: Icon(Icons.expand_more, size: 20, color: QColors.label),
            style: QText.body,
            decoration: const InputDecoration(hintText: 'اختار التصنيف'),
            items: [
              for (final category in categories)
                DropdownMenuItem(
                  value: category.id,
                  child: Text(
                    category.nameAr,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: QText.body,
                  ),
                ),
            ],
            onChanged: (value) => setState(() => _categoryId = value),
          ),
        ],
      );

  Widget _groupsSection(MerchantMenuItem? item) {
    final groups = item?.optionGroups ?? const <MenuOptionGroup>[];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'مجموعات الإضافات',
              style: TextStyle(
                fontFamily: 'Cairo',
                fontSize: 14,
                fontWeight: FontWeight.w800,
                color: QColors.ink,
              ),
            ),
            InkWell(
              onTap: () => _snack('إدارة مجموعات الإضافات قريباً'),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                child: Text(
                  '+ مجموعة',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 12.5,
                    fontWeight: FontWeight.w800,
                    color: QColors.gold,
                  ),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        if (groups.isEmpty)
          Text(
            _isEdit ? 'لا توجد مجموعات على هذا الصنف' : 'تقدر تضيف المجموعات بعد حفظ الصنف',
            style: QText.tiny.copyWith(fontWeight: FontWeight.w600, color: QColors.faint),
          )
        else
          for (final group in groups) ...[
            _groupCard(group),
            const SizedBox(height: 10),
          ],
      ],
    );
  }

  Widget _groupCard(MenuOptionGroup group) {
    // «وسط — · كبير +6» — الأرقام معزولة bidi عشان ما تنقلبش جوّه النص العربي.
    final summary = [
      for (final option in group.options)
        option.isFree
            ? '${option.nameAr} —'
            : '${option.nameAr} ${fmt.ltr('+${fmt.money(option.extraPrice)}')}',
    ].join(' · ');

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: QColors.canvas,
        borderRadius: BorderRadius.circular(QRadius.md),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        group.nameAr,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: QText.body.copyWith(fontWeight: FontWeight.w800),
                      ),
                    ),
                    const SizedBox(width: 8),
                    if (group.isRequired)
                      const QBadge(label: 'مطلوب')
                    else
                      Text(
                        '(اختياري)',
                        style: TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 10.5,
                          fontWeight: FontWeight.w700,
                          color: QColors.faint,
                        ),
                      ),
                  ],
                ),
                if (summary.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(
                    summary,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: QText.tiny.copyWith(fontWeight: FontWeight.w600),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 10),
          InkWell(
            onTap: () => _snack('إدارة مجموعات الإضافات قريباً'),
            child: Padding(
              padding: const EdgeInsets.all(4),
              child: Text('✎', style: TextStyle(fontSize: 15, color: QColors.label)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _bottomBar() => Container(
        decoration: BoxDecoration(
          color: QColors.surface,
          border: Border(top: BorderSide(color: QColors.line)),
        ),
        padding: const EdgeInsets.fromLTRB(QSpace.screenH, 12, QSpace.screenH, 30),
        child: Row(
          children: [
            if (_isEdit) ...[
              Expanded(
                flex: 10,
                child: QButton(
                  label: 'حذف',
                  style: QButtonStyle.danger,
                  enabled: !_saving,
                  onPressed: _confirmDelete,
                ),
              ),
              const SizedBox(width: 12),
            ],
            Expanded(
              flex: 24,
              child: QButton(
                label: _isEdit ? 'حفظ التعديلات' : 'حفظ الصنف',
                loading: _saving,
                onPressed: _save,
              ),
            ),
          ],
        ),
      );

  Future<void> _save() async {
    final nameAr = _nameAr.text.trim();
    final priceText = _price.text.trim().replaceAll('٫', '.');
    final price = double.tryParse(priceText);
    final categoryId = _categoryId;

    if (nameAr.isEmpty || price == null || categoryId == null) {
      _snack('اكتب اسم الصنف والسعر');
      return;
    }

    setState(() => _saving = true);
    try {
      await ref.read(menuProvider.notifier).saveItem(
            id: widget.itemId,
            categoryId: categoryId,
            nameAr: nameAr,
            nameEn: _nameEn.text.trim(),
            price: price,
            descriptionAr: _description.text.trim().isEmpty ? null : _description.text.trim(),
            calories: int.tryParse(_calories.text.trim()),
          );
      if (!mounted) return;
      await Navigator.of(context).maybePop();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      _snack(e.message);
    }
  }

  Future<void> _confirmDelete() async {
    final id = widget.itemId;
    if (id == null) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        backgroundColor: QColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(QRadius.xl)),
        title: Text('حذف الصنف؟', style: QText.section),
        content: Text(
          'هيتشال من المنيو نهائياً. لو عايزه يرجع بعدين، أوقفه بدل ما تحذفه.',
          style: QText.bodyMuted,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text('إلغاء', style: QText.body.copyWith(color: QColors.textMuted)),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text('حذف', style: QText.body.copyWith(color: QColors.danger)),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() => _saving = true);
    try {
      await ref.read(menuProvider.notifier).deleteItem(id);
      if (!mounted) return;
      await Navigator.of(context).maybePop();
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      _snack(e.message);
    }
  }
}

/// مكان الصورة لما ما يكونش فيه صورة — إطار متقطّع بستايل التصميم.
class _ImagePlaceholder extends StatelessWidget {
  const _ImagePlaceholder();

  @override
  Widget build(BuildContext context) => CustomPaint(
        painter: const _DashedBorderPainter(),
        child: Container(
          color: QColors.canvas,
          alignment: Alignment.center,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('🖼', style: TextStyle(fontSize: 26)),
              const SizedBox(height: 6),
              Text(
                'لا توجد صورة',
                style: TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: QColors.faint,
                ),
              ),
            ],
          ),
        ),
      );
}

class _DashedBorderPainter extends CustomPainter {
  const _DashedBorderPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = QColors.border
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;

    final path = Path()
      ..addRRect(
        RRect.fromRectAndRadius(Offset.zero & size, const Radius.circular(QRadius.lg)),
      );

    // تقطيع المسار: ٦ ظاهر و٥ فاضي.
    for (final metric in path.computeMetrics()) {
      var distance = 0.0;
      while (distance < metric.length) {
        final next = (distance + 6).clamp(0.0, metric.length);
        canvas.drawPath(metric.extractPath(distance, next), paint);
        distance = next + 5;
      }
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
