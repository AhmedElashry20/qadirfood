// تنسيق الأرقام — الأسعار بدون أصفار زايدة، والتقييم برقم عشري واحد.
// نسخة مطابقة لـ customer_app/lib/core/format.dart + مساعدات قراءة JSON.

/// 39 → «39» · 59.9 → «59.90» · 71.3 → «71.30»
String money(double value) {
  final rounded = (value * 100).round() / 100;
  return rounded == rounded.roundToDouble()
      ? rounded.toStringAsFixed(0)
      : rounded.toStringAsFixed(2);
}

/// 4.8 → «4.8»
String rating(double value) => value.toStringAsFixed(1);

/// يعزل نص لاتيني/رقمي جوّه جملة عربية (زي رقم الطلب أو مبلغ بالسالب) عشان الـ bidi
/// ما يقلبش ترتيبه: U+2066 (عزل من اليسار لليمين) … U+2069 (نهاية العزل).
String ltr(String value) => '\u2066$value\u2069';

// ─────────────────────── قراءة الأرقام من JSON ───────────────────────
// endpoints المطعم بترجّع صفوف Prisma خام في بعض المسارات (‎/orders/incoming،
// ‎/orders/active، ‎/menu/categories) — والـ Decimal بيتسلسل كـ String هناك،
// بينما ‎/orders و ‎/orders/:id بيمرّوا على mapOrder() وبيرجّعوا أرقام.
// عشان كده كل قراءة مبلغ لازم تقبل num و String مع بعض.

/// «12.50» أو 12.5 أو null → double (الافتراضي [fallback]).
double asMoney(Object? value, [double fallback = 0]) => switch (value) {
      final num n => n.toDouble(),
      final String s => double.tryParse(s) ?? fallback,
      _ => fallback,
    };

/// نفس [asMoney] بس بيرجّع null بدل رقم افتراضي — للحقول الاختيارية.
double? asMoneyOrNull(Object? value) => switch (value) {
      final num n => n.toDouble(),
      final String s => double.tryParse(s),
      _ => null,
    };

/// عدد صحيح من num أو String.
int asInt(Object? value, [int fallback = 0]) => switch (value) {
      final num n => n.toInt(),
      final String s => int.tryParse(s) ?? num.tryParse(s)?.toInt() ?? fallback,
      _ => fallback,
    };

/// نفس [asInt] بس بيرجّع null للحقول الاختيارية.
int? asIntOrNull(Object? value) => switch (value) {
      final num n => n.toInt(),
      final String s => int.tryParse(s) ?? num.tryParse(s)?.toInt(),
      _ => null,
    };

/// تاريخ ISO من السيرفر → DateTime محلي، وnull لو الحقل فاضي أو تالف.
DateTime? asDate(Object? value) => value is String ? DateTime.tryParse(value)?.toLocal() : null;

/// نص آمن — بيتجاهل الأنواع غير المتوقعة.
String asText(Object? value, [String fallback = '']) => value is String ? value : fallback;
