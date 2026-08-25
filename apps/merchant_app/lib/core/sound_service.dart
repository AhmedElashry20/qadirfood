// صوت التنبيه — يفضل متكرر لحد ما الطلب يتقبل أو يترفض.
// بيستخدم صوت النظام (SystemSound) عشان مانحتاجش ملف صوت في الأصول؛
// لما نضيف نغمة خاصة للبراند، نبدّل _beep() بـ audioplayers ونسيب الباقي زي ما هو.
import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class AlertSoundService {
  Timer? _timer;

  /// بيرن كل ٤ ثواني لحد ما حد ينده [stop] — الطلب الجديد لازم ياخد بال الموظف.
  void startRepeating() {
    if (_timer != null) return;
    _beep();
    _timer = Timer.periodic(const Duration(seconds: 4), (_) => _beep());
  }

  void stop() {
    _timer?.cancel();
    _timer = null;
  }

  bool get isRinging => _timer != null;

  void _beep() {
    SystemSound.play(SystemSoundType.alert);
    HapticFeedback.heavyImpact();
  }

  void dispose() => stop();
}

final alertSoundProvider = Provider<AlertSoundService>((ref) {
  final service = AlertSoundService();
  ref.onDispose(service.dispose);
  return service;
});
