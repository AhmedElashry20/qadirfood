// عدّاد مهلة قبول المهمة — حلقة دائرية بتفضى مع الوقت.
//
// المرجع الزمني هو [startedAt] (لحظة وصول العرض على الجهاز) مش عدّاد داخلي —
// عشان لو الويدجت اتعمله rebuild أو الشاشة اتفتحت متأخرة شوية العدّاد يفضل صح.
// السيرفر مابيبعتش طابع زمني مع العرض، فده أدق مرجع متاح (شوف TripOffer.receivedAt).
import 'dart:async';

import 'package:flutter/material.dart';

import '../core/theme.dart';

/// حلقة العدّ التنازلي — ٥٢×٥٢ بحدود ٤ بكسل.
class QCountdownRing extends StatefulWidget {
  const QCountdownRing({
    super.key,
    required this.totalSeconds,
    required this.startedAt,
    this.onExpired,
    this.size = 52,
  });

  /// المهلة الكاملة اللي السيرفر حدّدها (`expiresInSeconds`).
  final int totalSeconds;

  /// لحظة بداية العد.
  final DateTime startedAt;

  /// بتتنده **مرة واحدة** أول ما العدّاد يوصل صفر.
  final VoidCallback? onExpired;

  final double size;

  @override
  State<QCountdownRing> createState() => _QCountdownRingState();
}

class _QCountdownRingState extends State<QCountdownRing> {
  Timer? _timer;
  bool _fired = false;

  @override
  void initState() {
    super.initState();
    // ١٠٠ ملي — الحلقة تتحرك بنعومة والرقم يفضل دقيق.
    _timer = Timer.periodic(const Duration(milliseconds: 100), (_) => _tick());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _tick() {
    if (!mounted) return;
    setState(() {});

    if (_remaining <= Duration.zero && !_fired) {
      _fired = true;
      _timer?.cancel();
      // بعد الـ frame عشان مانستدعيش تنقّل جوّه build.
      WidgetsBinding.instance.addPostFrameCallback((_) => widget.onExpired?.call());
    }
  }

  Duration get _remaining {
    final left =
        widget.startedAt.add(Duration(seconds: widget.totalSeconds)).difference(DateTime.now());
    return left.isNegative ? Duration.zero : left;
  }

  double get _progress {
    if (widget.totalSeconds <= 0) return 0;
    return (_remaining.inMilliseconds / (widget.totalSeconds * 1000)).clamp(0.0, 1.0);
  }

  @override
  Widget build(BuildContext context) {
    // بنقرّب لفوق عشان «١» تفضل ظاهرة لحد ما الوقت يخلص فعلاً.
    final seconds = (_remaining.inMilliseconds / 1000).ceil();

    return SizedBox(
      width: widget.size,
      height: widget.size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          SizedBox.expand(
            child: CircularProgressIndicator(
              value: _progress,
              strokeWidth: 4,
              color: QColors.brand,
              backgroundColor: QColors.border,
            ),
          ),
          Text('$seconds', style: QText.num(size: 18, weight: FontWeight.w800)),
        ],
      ),
    );
  }
}
