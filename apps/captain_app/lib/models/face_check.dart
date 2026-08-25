// التحقق اليومي بالوجه — Dart عادي من غير freezed ولا codegen (زي باقي الموديلات).
//
// ══════════════════════════════════════════════════════════════════════════
//         ⚠️ لسه **مافيش خدمة مطابقة بيومترية حقيقية** مربوطة بالسيرفر
// ══════════════════════════════════════════════════════════════════════════
// السيرفر بيرجّع `biometricConfigured = false` و `provider = 'stub'`، يعني
// السيلفي بتتسجّل وبتتقبل **مبدئياً** بس مافيش مطابقة أوتوماتيكية للوجه لسه
// (محتاجة خدمة خارجية + مفاتيح). الموديل بيسرّب الحقيقتين دول (مش بيخبّيهم)
// عشان الشاشة تقول للكابتن الوضع بصراحة بدل ما تدّي إحساس زايف إن وشّه اتطابق.
import '../core/format.dart';

/// حالة فحص الوجه — مطابقة للـ `status` اللي بيرجع من `POST /face/me/check`.
enum FaceCheckStatus {
  verified('VERIFIED', 'تم التحقق'),
  pending('PENDING', 'قيد المراجعة'),
  rejected('REJECTED', 'مرفوض');

  const FaceCheckStatus(this.wire, this.ar);

  final String wire;
  final String ar;

  static FaceCheckStatus fromWire(String value) => FaceCheckStatus.values.firstWhere(
        (s) => s.wire == value,
        orElse: () => FaceCheckStatus.pending,
      );

  bool get isVerified => this == FaceCheckStatus.verified;
  bool get isPending => this == FaceCheckStatus.pending;
  bool get isRejected => this == FaceCheckStatus.rejected;
}

/// فحص وجه واحد — رد `POST /face/me/check` أو الحقل `check` جوّه رد اليوم.
class FaceCheck {
  const FaceCheck({
    required this.id,
    required this.status,
    required this.biometricConfigured,
    required this.provider,
    this.confidence,
    this.selfieUrl,
    this.rejectReason,
    this.checkedAt,
    this.createdAt,
  });

  final String id;
  final FaceCheckStatus status;

  /// خدمة المطابقة البيومترية متركّبة فعلاً؟ — **دلوقتي false** (راجع أول الملف).
  final bool biometricConfigured;

  /// مزوّد الخدمة — دلوقتي `'stub'` (مافيش مطابقة حقيقية).
  final String provider;

  /// درجة الثقة (٠..١) — بترجع null طول ما مافيش خدمة بيومترية.
  final double? confidence;

  final String? selfieUrl;

  /// سبب الرفض من السيرفر — بيتعرض زي ما هو لما الحالة REJECTED.
  final String? rejectReason;

  final DateTime? checkedAt;
  final DateTime? createdAt;

  factory FaceCheck.fromJson(Map<String, dynamic> json) => FaceCheck(
        id: asText(json['id']),
        status: FaceCheckStatus.fromWire(asText(json['status'], 'PENDING')),
        biometricConfigured: json['biometricConfigured'] == true,
        provider: asText(json['provider'], 'stub'),
        confidence: asMoneyOrNull(json['confidence']),
        selfieUrl: json['selfieUrl'] as String?,
        rejectReason: json['rejectReason'] as String?,
        checkedAt: asDate(json['checkedAt']),
        createdAt: asDate(json['createdAt']),
      );
}

/// رد `GET /face/me/today` — هل الكابتن اتحقّق النهاردة + آخر فحص + حالة الخدمة.
class FaceToday {
  const FaceToday({
    required this.verifiedToday,
    required this.isRequired,
    required this.biometricConfigured,
    required this.provider,
    this.check,
  });

  /// الكابتن عمل تحقّق مقبول النهاردة؟ — ده اللي بيفتح زرار الأونلاين.
  final bool verifiedToday;

  /// التحقق اليومي مطلوب؟ (السيرفر بيرجّع true دايماً حالياً).
  /// اسمه `required` في الـ JSON، بس `required` كلمة محجوزة في Dart فسمّيناه هنا.
  final bool isRequired;

  final bool biometricConfigured;
  final String provider;

  /// آخر فحص للنهاردة — `null` لو لسه مفيش أي محاولة.
  final FaceCheck? check;

  factory FaceToday.fromJson(Map<String, dynamic> json) {
    final raw = json['check'];
    return FaceToday(
      verifiedToday: json['verifiedToday'] == true,
      isRequired: json['required'] != false,
      biometricConfigured: json['biometricConfigured'] == true,
      provider: asText(json['provider'], 'stub'),
      check: raw is Map<String, dynamic> ? FaceCheck.fromJson(raw) : null,
    );
  }
}
