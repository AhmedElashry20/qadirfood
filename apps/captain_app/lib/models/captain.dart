// الكابتن ووثائقه — Dart عادي من غير freezed ولا codegen.
//
// ✅ **بقى فيه endpoints حقيقية دلوقتي**: `GET /captains/me` بيرجّع الملف الشخصي
// كامل (بالتقييم والمحفظة وملخص الوثائق)، و `GET /captains/me/documents` بيرجّع
// **خمس صفوف دايماً** بترتيب ثابت. مابقاش فيه أي تخمين من صف الكابتن المرفق
// مع الطلبات — ده بقى fallback بس لو التوكن مالوش `captainId` (شوف
// [CaptainRepository.me]).
//
// اللي لسه **مالوش مصدر** في الرد:
//   • [Captain.acceptanceRate] — السيرفر بيرجّعها `null` دايماً لأن مافيش جدول
//     بيسجّل ردود الكابتن على العروض. مابنعرضش تايل ليها أصلاً بدل «—».
//   • المستوى/التصنيف — مالوش وجود في الداتابيز خالص.
import '../core/enums.dart';
import '../core/format.dart';

class Captain {
  const Captain({
    required this.id,
    required this.fullName,
    required this.phone,
    required this.status,
    required this.isVerified,
    required this.rating,
    required this.ratingCount,
    required this.walletBalance,
    this.email,
    this.avatarUrl,
    this.vehicleType,
    this.plateNumber,
    this.totalDeliveries,
    this.acceptanceRate,
    this.joinedYear,
    this.nationalIdMasked,
    this.companyId,
    this.companyName,
    this.documentsApproved = 0,
    this.documentsTotal = 0,
    this.allDocumentsApproved = false,
  });

  /// معرّف صف الـ Captain في الداتابيز (مش userId).
  final String id;

  final String fullName;
  final String phone;
  final String? email;
  final String? avatarUrl;

  /// MOTORCYCLE / CAR / BICYCLE — قابل للتعديل بـ `PATCH /captains/me`.
  final String? vehicleType;
  final String? plateNumber;

  /// رقم الهوية **مقنّع من السيرفر** — «•••• 4821». الرقم الكامل مابيخرجش من الـ API.
  final String? nationalIdMasked;

  /// متوسط تقييم العميل للكابتن (Decimal(2,1) في الداتابيز).
  final double rating;
  final int ratingCount;

  final CaptainStatus status;

  /// السيرفر بيحسبها لوحده: كل الوثائق الإلزامية الأربعة مقبولة = موثّق.
  final bool isVerified;

  /// رصيد المحفظة — بيزيد تلقائياً بمستحق كل طلب وقت التسليم.
  /// للسحب استخدم `availableToWithdraw` من `GET /captains/me/wallet` مش الرقم ده.
  final double walletBalance;

  /// إجمالي الرحلات المسلّمة — عدّاد حقيقي من السيرفر دلوقتي.
  final int? totalDeliveries;

  /// نسبة قبول العروض — **السيرفر بيرجّعها null دايماً** (مافيش سجل للعروض).
  final double? acceptanceRate;

  /// سنة الانضمام — من `captain.createdAt`.
  final int? joinedYear;

  // ── الشركة (الأسطول) ──

  /// معرّف شركة الأسطول اللي الكابتن تابع لها — `null` للكابتن المستقل.
  final String? companyId;

  /// اسم الشركة زي ما بيرجّعه `GET /captains/me` — `null` للكابتن المستقل.
  /// لو مش `null` يبقى الكابتن **بتدفعله شركته مش المنصة**: مافيش رصيد محفظة
  /// (`walletBalance` بيرجع صفر) ولا سحب، والمنصة بتحاسب الشركة والشركة بتوزّع عليه.
  final String? companyName;

  // ── ملخص الوثائق (`documentsSummary` في الرد) ──

  /// عدد الوثائق المقبولة من إجمالي الخمسة.
  final int documentsApproved;

  /// إجمالي أنواع الوثائق — ٥ دايماً (بما فيهم الصورة الشخصية الاختيارية).
  final int documentsTotal;

  /// الخمسة كلهم مقبولين. لاحظ إن [isVerified] بتعتمد على الأربعة الإلزامية بس،
  /// فممكن يكون موثّق من غير ما تكون دي true.
  final bool allDocumentsApproved;

  // ── مساعدات للشاشات ──

  /// أول حرف من الاسم — للأڤاتار الحرفي لما لا توجد صورة.
  String get initial {
    final name = fullName.trim();
    return name.isEmpty ? '؟' : name.substring(0, 1);
  }

  /// «دراجة نارية · ل ب ن ١٢٣٤».
  String get vehicleLabel => [
        vehicleTypeLabel,
        if (plateNumber != null && plateNumber!.trim().isNotEmpty) plateNumber!.trim(),
      ].join(' · ');

  /// نوع المركبة بالعربي.
  String get vehicleTypeLabel => vehicleTypeLabelOf(vehicleType);

  /// «موثّق» / «غير موثّق» — نص جاهز لتايل الحالة.
  String get verificationLabel => isVerified ? 'موثّق' : 'غير موثّق';

  /// «3/5» — نص جاهز لتايل الوثائق.
  String get documentsLabel => '$documentsApproved/$documentsTotal';

  bool get hasAvatar => avatarUrl != null && avatarUrl!.trim().isNotEmpty;

  /// الكابتن تابع لشركة أسطول؟ — لو أيوة، شركته هي اللي بتدفعله مش المنصة،
  /// فبنعرض توزيعات الشركة بدل محفظة المنصة والسحب.
  bool get isCompanyCaptain => companyName != null && companyName!.trim().isNotEmpty;

  /// أنواع المركبات المسموحة في `PATCH /captains/me` (enum `VehicleType`).
  static const vehicleTypes = ['MOTORCYCLE', 'CAR', 'BICYCLE'];

  static String vehicleTypeLabelOf(String? wire) => switch (wire) {
        'MOTORCYCLE' => 'دراجة نارية',
        'CAR' => 'سيارة',
        'BICYCLE' => 'دراجة هوائية',
        _ => 'مركبة',
      };

  Captain copyWith({
    CaptainStatus? status,
    double? walletBalance,
    int? totalDeliveries,
    String? vehicleType,
    String? plateNumber,
    String? avatarUrl,
  }) =>
      Captain(
        id: id,
        fullName: fullName,
        phone: phone,
        email: email,
        avatarUrl: avatarUrl ?? this.avatarUrl,
        vehicleType: vehicleType ?? this.vehicleType,
        plateNumber: plateNumber ?? this.plateNumber,
        nationalIdMasked: nationalIdMasked,
        rating: rating,
        ratingCount: ratingCount,
        status: status ?? this.status,
        isVerified: isVerified,
        walletBalance: walletBalance ?? this.walletBalance,
        totalDeliveries: totalDeliveries ?? this.totalDeliveries,
        acceptanceRate: acceptanceRate,
        joinedYear: joinedYear,
        companyId: companyId,
        companyName: companyName,
        documentsApproved: documentsApproved,
        documentsTotal: documentsTotal,
        allDocumentsApproved: allDocumentsApproved,
      );

  /// رد `GET /captains/me` و `PATCH /captains/me` — الشكل الكامل والمصدر المعتمد.
  ///
  /// الاسم والجوال والإيميل بيجوا **مسطّحين** على الجذر هنا (مش جوّه `user` زي
  /// صف الكابتن المرفق مع الطلبات)، والمبالغ بتوصل أرقام جاهزة.
  factory Captain.fromMe(Map<String, dynamic> json) {
    final summary = (json['documentsSummary'] as Map<String, dynamic>?) ?? const {};
    return Captain(
      id: asText(json['id']),
      fullName: asText(json['fullName']),
      phone: asText(json['phone']),
      email: json['email'] as String?,
      avatarUrl: json['avatarUrl'] as String?,
      vehicleType: json['vehicleType'] as String?,
      plateNumber: json['plateNumber'] as String?,
      nationalIdMasked: json['nationalId'] as String?,
      rating: asMoney(json['rating'], 5),
      ratingCount: asInt(json['ratingCount']),
      status: CaptainStatus.fromWire(asText(json['status'], 'OFFLINE')),
      isVerified: json['isVerified'] == true,
      walletBalance: asMoney(json['walletBalance']),
      totalDeliveries: asIntOrNull(json['totalDeliveries']),
      // السيرفر بيرجّعها null دايماً — سايبينها عشان لو اتحسبت يوماً ما تشتغل لوحدها.
      acceptanceRate: asMoneyOrNull(json['acceptanceRate']),
      joinedYear: asIntOrNull(json['joinedYear']),
      // شركة الأسطول — بيرجعوا `null` للكابتن المستقل.
      companyId: json['companyId'] as String?,
      companyName: json['companyName'] as String?,
      documentsApproved: asInt(summary['approved']),
      documentsTotal: asInt(summary['total']),
      allDocumentsApproved: summary['allApproved'] == true,
    );
  }

  /// صف `captain` الجاي جوّه الطلب — **fallback بس** لما `GET /captains/me` يرجع
  /// 403 (توكن من غير `captainId`). الاسم والجوال هنا على `captain.user`.
  ///
  /// المبالغ بتوصل نصوص من ردود PATCH لأنها مابتعدّيش على mapOrder — عشان كده
  /// كل قراءة بتعدّي على asMoney.
  factory Captain.fromJson(Map<String, dynamic> json) {
    final user = (json['user'] as Map<String, dynamic>?) ?? const {};
    return Captain(
      id: asText(json['id']),
      fullName: asText(user['fullName']),
      phone: asText(user['phone']),
      avatarUrl: user['avatarUrl'] as String?,
      vehicleType: json['vehicleType'] as String?,
      plateNumber: json['plateNumber'] as String?,
      rating: asMoney(json['rating'], 5),
      ratingCount: asInt(json['ratingCount']),
      status: CaptainStatus.fromWire(asText(json['status'], 'OFFLINE')),
      isVerified: json['isVerified'] == true,
      walletBalance: asMoney(json['walletBalance']),
      joinedYear: asDate(json['createdAt'])?.year,
      totalDeliveries: null,
      acceptanceRate: null,
    );
  }

  /// بناء من object الـ `user` بتاع /auth/otp/verify — آخر fallback.
  factory Captain.fromUser(Map<String, dynamic> user, {String? captainId}) => Captain(
        id: asText(captainId),
        fullName: asText(user['fullName']),
        phone: asText(user['phone']),
        avatarUrl: user['avatarUrl'] as String?,
        rating: 5,
        ratingCount: 0,
        status: CaptainStatus.offline,
        isVerified: false,
        walletBalance: 0,
      );
}

// ─────────────────────────── الوثائق ───────────────────────────

/// حالة الوثيقة زي ما `GET /captains/me/documents` بيرجّعها.
///
/// ⚠️ ده **مش** [DocumentStatus] بتاع `core/enums.dart`: الـ enum ده فيه
/// `EXPIRED` (السيرفر بيحسبها من `expiresAt` عند القراءة) و `MISSING` (النوع
/// اللي لسه مترفعش خالص). الـ enum القديم مالوش الحالتين دول وهو مستخدم في
/// تستات موجودة، فسايبينه زي ما هو ومعرّفين النوع الصح هنا.
enum CaptainDocStatus {
  missing('MISSING', 'لم تُرفَع بعد'),
  pending('PENDING', '⏳ قيد المراجعة'),
  approved('APPROVED', '✓ تم القبول'),
  rejected('REJECTED', '✕ مرفوضة'),
  expired('EXPIRED', 'انتهت — جدّدها');

  const CaptainDocStatus(this.wire, this.ar);

  final String wire;
  final String ar;

  static CaptainDocStatus fromWire(String value) => CaptainDocStatus.values.firstWhere(
        (s) => s.wire == value,
        orElse: () => CaptainDocStatus.missing,
      );

  bool get isMissing => this == CaptainDocStatus.missing;

  bool get isApproved => this == CaptainDocStatus.approved;

  /// محتاجة تدخّل من الكابتن (رفع أو إعادة رفع).
  bool get needsAction => switch (this) {
        CaptainDocStatus.missing || CaptainDocStatus.rejected || CaptainDocStatus.expired => true,
        _ => false,
      };
}

/// وثيقة تفعيل واحدة — صف من `GET /captains/me/documents`.
///
/// الـ endpoint بيرجّع **خمس صفوف دايماً** بالترتيب ده:
/// IDENTITY · LICENSE · VEHICLE_REG · INSURANCE · PHOTO — حتى لو مترفعش ولا واحدة
/// (ساعتها `id = null` و `status = MISSING`). يعني الشاشة مابتخترعش صفوف ناقصة.
///
/// النوع متخزّن هنا **كنص خام** ([typeWire]) مش كـ [DocumentType]، لأن الـ enum
/// اللي في `core/enums.dart` فيه أربع قيم بس ومافيهوش `INSURANCE`.
class CaptainDocument {
  const CaptainDocument({
    required this.typeWire,
    required this.status,
    required this.isRequired,
    this.id,
    this.fileUrl,
    this.rejectReason,
    this.expiresAt,
    this.daysUntilExpiry,
    this.reviewedAt,
    this.updatedAt,
  });

  /// `null` لما الوثيقة لم تُرفَع بعد خالص.
  final String? id;

  /// IDENTITY / LICENSE / VEHICLE_REG / INSURANCE / PHOTO.
  final String typeWire;

  final CaptainDocStatus status;

  final String? fileUrl;

  /// سبب الرفض من الأدمن — إلزامي على السيرفر وقت الرفض.
  final String? rejectReason;

  final DateTime? expiresAt;

  /// **محسوبة على السيرفر**: موجب = باقي أيام · سالب = منتهية من كام يوم ·
  /// null = الوثيقة مالهاش تاريخ انتهاء. مابنحسبهاش محلياً عشان ماتفرقش عن السيرفر.
  final int? daysUntilExpiry;

  final DateTime? reviewedAt;
  final DateTime? updatedAt;

  /// إلزامية للتوثيق؟ — `false` للصورة الشخصية بس.
  final bool isRequired;

  // ── مساعدات للشاشات ──

  bool get isUploaded => !status.isMissing;

  bool get isExpired => status == CaptainDocStatus.expired;

  /// قرّبت تخلص — باقي ٣٠ يوم أو أقل وهي لسه صالحة.
  bool get isExpiringSoon {
    final days = daysUntilExpiry;
    return days != null && days >= 0 && days <= 30 && !isExpired;
  }

  /// «تنتهي بعد ١٢ يوم» — null لو مافيش تحذير يستاهل العرض.
  String? get expiryWarning {
    final days = daysUntilExpiry;
    if (days == null) return null;
    if (days < 0) return 'انتهت من ${-days} يوم';
    return isExpiringSoon ? 'تنتهي بعد $days يوم' : null;
  }

  /// سطر الحالة الظاهر تحت اسم الوثيقة — المرفوضة بتوضّح السبب.
  String get statusLine => switch (status) {
        CaptainDocStatus.rejected => '✕ ${rejectReason ?? 'مرفوضة — أعد الرفع'}',
        _ => status.ar,
      };

  /// اسم النوع بالعربي.
  String get typeLabel => typeLabelOf(typeWire);

  /// إيموجي النوع.
  String get typeEmoji => typeEmojiOf(typeWire);

  factory CaptainDocument.fromJson(Map<String, dynamic> json) => CaptainDocument(
        id: json['id'] as String?,
        typeWire: asText(json['type']),
        status: CaptainDocStatus.fromWire(asText(json['status'], 'MISSING')),
        fileUrl: json['fileUrl'] as String?,
        rejectReason: json['rejectReason'] as String?,
        expiresAt: asDate(json['expiresAt']),
        daysUntilExpiry: asIntOrNull(json['daysUntilExpiry']),
        reviewedAt: asDate(json['reviewedAt']),
        updatedAt: asDate(json['updatedAt']),
        isRequired: json['isRequired'] == true,
      );

  static String typeLabelOf(String wire) => switch (wire) {
        'IDENTITY' => 'الهوية / الإقامة',
        'LICENSE' => 'رخصة القيادة',
        'VEHICLE_REG' => 'استمارة المركبة',
        'INSURANCE' => 'تأمين المركبة',
        'PHOTO' => 'صورة شخصية',
        _ => 'وثيقة',
      };

  static String typeEmojiOf(String wire) => switch (wire) {
        'IDENTITY' => '🪪',
        'LICENSE' => '🚗',
        'VEHICLE_REG' => '📄',
        'INSURANCE' => '🛡',
        'PHOTO' => '🤳',
        _ => '📎',
      };
}
