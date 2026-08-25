// زر أونلاين/أوفلاين الكبير — أهم زرار في التطبيق.
//
// شكله من التصميم: شريط pill جوّاه كلمة الحالة على ناحية و«الكبسولة» (الزرار
// الداخلي) على الناحية التانية. لما يكون أونلاين الشريط أصفر والكبسولة سودا،
// ولما يكون أوفلاين بينعكس: شريط غامق وكبسولة صفرا.
//
// ملاحظة سلوك: الحالة دي **سوكيت بس ومافيش REST يقراها** — يعني بترجع أوفلاين
// كل ما التطبيق يقفل ويفتح. شوف providers/captain_status_provider.dart.
import 'package:flutter/material.dart';

import '../core/theme.dart';

class QBigToggle extends StatelessWidget {
  const QBigToggle({super.key, required this.online, this.onChanged});

  final bool online;

  /// بتتنده بالحالة الجديدة (عكس [online]).
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    final trackColor = online ? QColors.brand : QColors.inkSoft;
    final labelColor = online ? QColors.ink : QColors.darkSub;
    final label = online ? 'متصل' : 'غير متصل';

    final knobColor = online ? QColors.ink : QColors.brand;
    final knobTextColor = online ? Colors.white : QColors.ink;
    final knobLabel = online ? 'إيقاف الاستقبال' : 'بدء الاستقبال';

    return Semantics(
      button: true,
      toggled: online,
      label: label,
      child: GestureDetector(
        onTap: onChanged == null ? null : () => onChanged!(!online),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
          constraints: const BoxConstraints(minHeight: QSpace.tapTarget),
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: trackColor,
            borderRadius: BorderRadius.circular(QRadius.pill),
          ),
          child: Row(
            children: [
              Expanded(
                child: Center(
                  child: Text(
                    label,
                    style: TextStyle(
                      fontFamily: 'Cairo',
                      fontSize: 15,
                      fontWeight: FontWeight.w900,
                      color: labelColor,
                    ),
                  ),
                ),
              ),
              AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                curve: Curves.easeOut,
                padding: const EdgeInsets.symmetric(horizontal: 26, vertical: 10),
                decoration: BoxDecoration(
                  color: knobColor,
                  borderRadius: BorderRadius.circular(QRadius.pill),
                ),
                child: Text(
                  knobLabel,
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 14.5,
                    fontWeight: FontWeight.w900,
                    color: knobTextColor,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
