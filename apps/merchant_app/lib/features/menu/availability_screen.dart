// شاشة ٩: إتاحة/إيقاف صنف — Toggle سريع + إيقاف جماعي + «حتى نهاية اليوم» أو «دائم»
// الشاشة دي شيت سفلي بيتفتح من سويتش الصنف في شاشة المنيو لما يتقفل.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/enums.dart';
import '../../core/theme.dart';
import '../../models/menu_item.dart';
import '../../providers/menu_provider.dart';
import '../../widgets/common.dart';

/// بيرجّع true لو الصنف اتوقف فعلاً، و false لو المستخدم لغى أو حصل خطأ.
Future<bool> showDisableItemSheet(
  BuildContext context,
  WidgetRef ref,
  MerchantMenuItem item,
) async {
  final done = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: QColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
    ),
    builder: (_) => _DisableItemSheet(item: item, ref: ref),
  );
  return done ?? false;
}

class _DisableItemSheet extends StatefulWidget {
  const _DisableItemSheet({required this.item, required this.ref});

  final MerchantMenuItem item;

  /// ref بتاعة شاشة المنيو — فاضلة حية طول ما الشيت مفتوح.
  final WidgetRef ref;

  @override
  State<_DisableItemSheet> createState() => _DisableItemSheetState();
}

/// خيارات الإيقاف الثلاثة في التصميم.
/// ملاحظة: «يعود تلقائياً غداً» و«حتى نهاية اليوم» الاتنين بيتحوّلوا لنفس القيمة
/// OUT_OF_STOCK_TODAY — مافيش قيمة منفصلة في الـ API (السيرفر بيرجّع الصنف
/// AVAILABLE تلقائياً ٤ الفجر في الحالتين).
enum _DisableChoice {
  tomorrow('يعود تلقائياً غداً', 'بداية الدوام', ItemAvailability.outOfStockToday),
  endOfDay('حتى نهاية اليوم', null, ItemAvailability.outOfStockToday),
  forever('إيقاف دائم — لحد ما أرجّعه', null, ItemAvailability.outOfStock);

  const _DisableChoice(this.label, this.note, this.availability);

  final String label;
  final String? note;
  final ItemAvailability availability;
}

class _DisableItemSheetState extends State<_DisableItemSheet> {
  _DisableChoice _choice = _DisableChoice.tomorrow;
  bool _saving = false;

  void _snack(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          backgroundColor: QColors.ink,
          content: Text(message, style: QText.body.copyWith(color: QColors.brand)),
        ),
      );
  }

  Future<void> _confirm() async {
    setState(() => _saving = true);
    try {
      await widget.ref
          .read(menuProvider.notifier)
          .setAvailability(widget.item.id, _choice.availability);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      _snack(e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(22, 12, 22, 34),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 44,
                height: 5,
                decoration: BoxDecoration(
                  color: QColors.border,
                  borderRadius: BorderRadius.circular(QRadius.pill),
                ),
              ),
            ),
            const SizedBox(height: 22),
            Text(
              'إيقاف "${widget.item.nameAr}"؟',
              style: const TextStyle(
                fontFamily: 'Cairo',
                fontSize: 18,
                fontWeight: FontWeight.w900,
                color: QColors.ink,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'الصنف هيختفي من تطبيق العملاء فوراً. متى يرجع؟',
              style: TextStyle(
                fontFamily: 'Cairo',
                fontSize: 13.5,
                fontWeight: FontWeight.w600,
                color: QColors.textMuted,
              ),
            ),
            const SizedBox(height: 18),
            for (final choice in _DisableChoice.values) ...[
              _choiceRow(choice),
              const SizedBox(height: 10),
            ],
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  flex: 1,
                  child: _sheetButton(
                    label: 'إلغاء',
                    background: QColors.chip,
                    foreground: QColors.ink,
                    onTap: _saving ? null : () => Navigator.of(context).pop(false),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  flex: 2,
                  child: _sheetButton(
                    label: 'إيقاف الصنف',
                    background: QColors.ink,
                    foreground: QColors.brand,
                    loading: _saving,
                    onTap: _saving ? null : _confirm,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _choiceRow(_DisableChoice choice) {
    final selected = _choice == choice;

    return InkWell(
      onTap: _saving ? null : () => setState(() => _choice = choice),
      borderRadius: BorderRadius.circular(QRadius.md),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          color: selected ? QColors.tintSoft : QColors.surface,
          borderRadius: BorderRadius.circular(QRadius.md),
          border: Border.all(
            color: selected ? QColors.brand : QColors.border,
            width: selected ? 2 : 1.5,
          ),
        ),
        child: Row(
          children: [
            QRadioDot(selected: selected),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                choice.label,
                style: QText.body.copyWith(fontWeight: FontWeight.w800),
              ),
            ),
            if (choice.note != null)
              Text(
                choice.note!,
                style: const TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: QColors.textMuted,
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _sheetButton({
    required String label,
    required Color background,
    required Color foreground,
    required VoidCallback? onTap,
    bool loading = false,
  }) {
    return Material(
      color: background,
      borderRadius: BorderRadius.circular(QRadius.lg),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(QRadius.lg),
        child: Container(
          height: QSpace.tapTarget,
          alignment: Alignment.center,
          child: loading
              ? SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(strokeWidth: 2.4, color: foreground),
                )
              : Text(label, style: QText.button.copyWith(color: foreground, fontSize: 16)),
        ),
      ),
    );
  }
}
