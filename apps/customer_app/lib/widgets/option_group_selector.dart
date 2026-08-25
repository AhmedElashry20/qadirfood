// اختيار الخيارات والإضافات (إجباري/اختياري، حد أقصى) — شاشة تفاصيل الصنف.
import 'package:flutter/material.dart';

import '../core/theme.dart';
import '../models/menu_item.dart';
import 'common.dart';

class OptionGroupSelector extends StatelessWidget {
  const OptionGroupSelector({
    super.key,
    required this.group,
    required this.selectedIds,
    required this.onToggle,
  });

  final OptionGroup group;
  final Set<String> selectedIds;
  final ValueChanged<ItemOption> onToggle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              group.name,
              style: QText.body.copyWith(fontSize: 14.5, fontWeight: FontWeight.w800),
            ),
            const SizedBox(width: 8),
            if (group.isRequired)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                decoration: BoxDecoration(
                  color: QColors.tintStrong,
                  borderRadius: BorderRadius.circular(QRadius.pill),
                ),
                child: const Text(
                  'مطلوب',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: QColors.goldDeep,
                  ),
                ),
              )
            else
              Text('(اختياري)', style: QText.tiny.copyWith(color: QColors.faint, fontSize: 11.5)),
            const Spacer(),
            if (!group.isSingleChoice)
              Text(
                'حتى ${group.maxSelections}',
                style: QText.tiny.copyWith(color: QColors.faint, fontWeight: FontWeight.w600),
              ),
          ],
        ),
        const SizedBox(height: 10),
        for (final option in group.options) ...[
          _OptionRow(
            option: option,
            selected: selectedIds.contains(option.id),
            single: group.isSingleChoice,
            onTap: () => onToggle(option),
          ),
          const SizedBox(height: 8),
        ],
      ],
    );
  }
}

class _OptionRow extends StatelessWidget {
  const _OptionRow({
    required this.option,
    required this.selected,
    required this.single,
    required this.onTap,
  });

  final ItemOption option;
  final bool selected;
  final bool single;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(13),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
        decoration: BoxDecoration(
          color: selected && single ? QColors.tintSoft : QColors.surface,
          borderRadius: BorderRadius.circular(13),
          border: Border.all(
            color: selected && single ? QColors.brand : QColors.border,
            width: selected && single ? 2 : 1.5,
          ),
        ),
        child: Row(
          children: [
            single ? QRadioDot(selected: selected) : QCheckBox(checked: selected),
            const SizedBox(width: 10),
            Expanded(child: Text(option.name, style: QText.body)),
            if (option.isFree)
              // في مجموعة الحجم، الخيار الأساسي سعره صفر — يتعرض «—» مش «مجاناً».
              single
                  ? Text('—', style: QText.num(size: 13, color: QColors.textMuted))
                  : Text('مجاناً', style: QText.body.copyWith(color: QColors.success, fontSize: 13))
            else
              QLtr(
                child: Text(
                  '+${option.extraPrice.toStringAsFixed(0)}',
                  style: QText.num(size: 13),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
