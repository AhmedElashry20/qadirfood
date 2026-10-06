// شريط مراحل الطلب — ٤ مراحل: تم التأكيد · جاري التجهيز · في الطريق · وصل.
import 'package:flutter/material.dart';

import '../core/enums.dart';
import '../core/theme.dart';

class OrderStatusStepper extends StatelessWidget {
  const OrderStatusStepper({super.key, required this.status});

  final OrderStatus status;

  static const _steps = [
    (label: 'تم التأكيد', emoji: '✓'),
    (label: 'جاري التجهيز', emoji: '✓'),
    (label: 'في الطريق', emoji: '🛵'),
    (label: 'وصل', emoji: '🏠'),
  ];

  @override
  Widget build(BuildContext context) {
    // trackingStep: 0 لسه، 1 تم التأكيد، 2 تجهيز، 3 في الطريق، 4 وصل.
    final current = status.trackingStep;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (var i = 0; i < _steps.length; i++) ...[
          if (i > 0)
            Container(
              width: 14,
              height: 3,
              margin: const EdgeInsets.only(top: 16),
              color: current >= i + 1 ? QColors.brand : QColors.line,
            ),
          // Expanded عشان الأربع مراحل تتقاسم العرض حتى على شاشة 320dp.
          Expanded(
            child: _Step(
              label: _steps[i].label,
              emoji: _steps[i].emoji,
              done: current >= i + 2, // المرحلة خلصت
              active: current == i + 1, // المرحلة الحالية
            ),
          ),
        ],
      ],
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({
    required this.label,
    required this.emoji,
    required this.done,
    required this.active,
  });

  final String label;
  final String emoji;
  final bool done;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final reached = done || active;
    final bg = done
        ? QColors.brand
        : active
            ? QColors.ink
            : QColors.chip;

    return Column(
      children: [
        Container(
          width: 34,
          height: 34,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
          child: done
              ? Icon(Icons.check, size: 18, color: QColors.ink)
              : Text(emoji, style: const TextStyle(fontSize: 15)),
        ),
        const SizedBox(height: 4),
        Text(
          label,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontFamily: 'Cairo',
            fontSize: 10.5,
            fontWeight: reached ? FontWeight.w800 : FontWeight.w600,
            color: reached ? QColors.ink : QColors.faint,
          ),
        ),
      ],
    );
  }
}
