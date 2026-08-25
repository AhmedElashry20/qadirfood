// تنسيق الأرقام — الأسعار بدون أصفار زايدة، والتقييم برقم عشري واحد.

/// 39 → «39» · 59.9 → «59.90» · 71.3 → «71.30»
String money(double value) {
  final rounded = (value * 100).round() / 100;
  return rounded == rounded.roundToDouble()
      ? rounded.toStringAsFixed(0)
      : rounded.toStringAsFixed(2);
}

/// 4.8 → «4.8»
String rating(double value) => value.toStringAsFixed(1);

/// 1.2 → «1.2 km»
String distance(double km) => '${km.toStringAsFixed(1)} km';

/// يعزل نص لاتيني/رقمي جوّه جملة عربية (زي رقم الطلب أو مبلغ بالسالب) عشان الـ bidi
/// ما يقلبش ترتيبه: U+2066 (عزل من اليسار لليمين) … U+2069 (نهاية العزل).
String ltr(String value) => '\u2066$value\u2069';
