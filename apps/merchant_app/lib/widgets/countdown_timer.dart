// العداد الزمني لكل طلب وارد — حلقة ٤٦×٤٦ بحدّ ٤px أصفر والثواني الفاضلة في النص.
//
// النافذة ٦٠ ثانية من `placedAt`. لما تخلص بنوقف العد ونعرض «0» بحلقة رمادية —
// الرفض التلقائي مسؤولية السيرفر مش التطبيق، إحنا بنعرض بس.
import 'dart:async';

import 'package:flutter/material.dart';

import '../core/theme.dart';
import 'common.dart';

class QCountdownRing extends StatefulWidget {
  const QCountdownRing({
    super.key,
    required this.placedAt,
    this.windowSeconds = 60,
    this.size = 46,
  });

  /// لحظة وصول الطلب — منها بنحسب الثواني الفاضلة.
  final DateTime placedAt;

  /// النافذة الكاملة بالثواني (الافتراضي ٦٠).
  final int windowSeconds;
  final double size;

  @override
  State<QCountdownRing> createState() => _QCountdownRingState();
}

class _QCountdownRingState extends State<QCountdownRing> {
  Timer? _ticker;
  late int _remaining = _compute();

  @override
  void initState() {
    super.initState();
    _start();
  }

  @override
  void didUpdateWidget(covariant QCountdownRing old) {
    super.didUpdateWidget(old);
    if (old.placedAt != widget.placedAt || old.windowSeconds != widget.windowSeconds) {
      _remaining = _compute();
      _start();
    }
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  int _compute() {
    final passed = DateTime.now().difference(widget.placedAt).inSeconds;
    final left = widget.windowSeconds - passed;
    return left.clamp(0, widget.windowSeconds);
  }

  void _start() {
    _ticker?.cancel();
    if (_remaining <= 0) return; // خلص الوقت — مافيش داعي لتايمر شغّال.
    _ticker = Timer.periodic(const Duration(seconds: 1), (timer) {
      final next = _compute();
      if (next != _remaining && mounted) setState(() => _remaining = next);
      if (next <= 0) timer.cancel();
    });
  }

  @override
  Widget build(BuildContext context) {
    final expired = _remaining <= 0;
    final fraction = widget.windowSeconds <= 0 ? 0.0 : _remaining / widget.windowSeconds;

    return SizedBox(
      width: widget.size,
      height: widget.size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // المسار الخلفي — نفس السُمك بلون فاتح.
          SizedBox.expand(
            child: CircularProgressIndicator(
              value: 1,
              strokeWidth: 4,
              color: expired ? QColors.border : QColors.tintStrong,
            ),
          ),
          if (!expired)
            SizedBox.expand(
              child: TweenAnimationBuilder<double>(
                tween: Tween<double>(begin: fraction, end: fraction),
                duration: const Duration(milliseconds: 900),
                curve: Curves.linear,
                builder: (_, value, __) => CircularProgressIndicator(
                  value: value,
                  strokeWidth: 4,
                  color: QColors.brand,
                  backgroundColor: Colors.transparent,
                ),
              ),
            ),
          QLtr(
            child: Text(
              '$_remaining',
              style: QText.num(
                size: 16,
                weight: FontWeight.w800,
                color: expired ? QColors.faint : QColors.ink,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
