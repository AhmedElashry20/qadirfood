// شارة الحالة بلونها (جديد برتقالي / تحضير أزرق / جاهز أخضر / ملغي أحمر)
// + شارة وقت التحضير في كارت الطلب الجاري (باقي / متأخر / جاهز).
import 'package:flutter/material.dart';

import '../core/enums.dart';
import '../core/theme.dart';
import 'common.dart';

/// ألوان محلية للتأخير — مش في QColors لأنها نغمة أحمر أفتح خاصة بالشارة دي.
const _lateBg = Color(0xFFFDE8E8); // خلفية شارة «متأخر»
const _lateFg = Color(0xFFC43030); // نص شارة «متأخر»

/// شارة حالة الطلب — بتاخد لونها من OrderStatus.color.
class QStatusChip extends StatelessWidget {
  const QStatusChip({super.key, required this.status, this.label});

  final OrderStatus status;

  /// نص بديل (لو الشاشة عايزة صيغة مختصرة زي «✓ مكتمل»).
  final String? label;

  @override
  Widget build(BuildContext context) {
    final color = status.color;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(QRadius.pill),
      ),
      child: Text(
        label ?? status.ar,
        style: TextStyle(
          fontFamily: 'Cairo',
          fontSize: 11.5,
          fontWeight: FontWeight.w800,
          color: color,
        ),
      ),
    );
  }
}

/// شارة وقت التحضير في «الطلبات الجارية».
/// جاهز → أخضر · متأخر → أحمر فاتح · غير كده → أصفر بالدقايق الفاضلة.
class QPrepTimerChip extends StatelessWidget {
  const QPrepTimerChip({
    super.key,
    required this.remainingMinutes,
    required this.isLate,
    required this.isReady,
  });

  final int remainingMinutes;
  final bool isLate;
  final bool isReady;

  @override
  Widget build(BuildContext context) {
    if (isReady) {
      return const _TimerPill(bg: QColors.successTint, fg: QColors.success, text: '✓ جاهز');
    }
    if (isLate) {
      final (number, suffix) = _humanize(remainingMinutes.abs());
      return _TimerPill(bg: _lateBg, fg: _lateFg, text: '⚠ متأخر ', number: number, suffix: suffix);
    }

    final (number, suffix) = _humanize(remainingMinutes < 0 ? 0 : remainingMinutes);
    return _TimerPill(
      bg: QColors.tintStrong,
      fg: QColors.goldDeep,
      text: '⏱ باقي ',
      number: number,
      suffix: suffix,
    );
  }

  /// طلب قديم ممكن يبقى متأخر بآلاف الدقايق — «متأخر ٥٥٠١ دقيقة» مالهاش معنى،
  /// فبنحوّلها لساعات أو أيام حسب الحجم.
  static (int, String) _humanize(int minutes) {
    if (minutes < 60) return (minutes, minutes == 1 ? ' دقيقة' : ' دقائق');
    if (minutes < 60 * 24) {
      final hours = minutes ~/ 60;
      return (hours, hours == 1 ? ' ساعة' : ' ساعات');
    }
    final days = minutes ~/ (60 * 24);
    return (days, days == 1 ? ' يوم' : ' أيام');
  }
}

class _TimerPill extends StatelessWidget {
  const _TimerPill({
    required this.bg,
    required this.fg,
    required this.text,
    this.number,
    this.suffix = '',
  });

  final Color bg;
  final Color fg;
  final String text;
  final int? number;
  final String suffix;

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(
      fontFamily: 'Cairo',
      fontSize: 12,
      fontWeight: FontWeight.w800,
      color: fg,
    );

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 6),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(QRadius.pill)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(text, style: style),
          // الرقم لازم يتعزل عن العربي وإلا الـ bidi بيرميه في آخر السطر.
          if (number != null) QLtr(child: Text('$number', style: QText.num(size: 12.5, color: fg))),
          if (suffix.isNotEmpty) Text(suffix, style: style),
        ],
      ),
    );
  }
}
