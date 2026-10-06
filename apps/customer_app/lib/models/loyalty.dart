// نقاط الولاء وبرنامج الإحالة — موديلات العرض.

/// حركة في دفتر النقاط.
class LoyaltyEntry {
  const LoyaltyEntry({
    required this.id,
    required this.type,
    required this.points,
    required this.balanceAfter,
    required this.descriptionAr,
    required this.createdAt,
    this.orderNumber,
  });

  final String id;

  /// EARN · REDEEM · REFERRAL · ADJUSTMENT · REVERSAL
  final String type;

  /// موجب = نقاط داخلة · سالب = مستهلكة.
  final int points;
  final int balanceAfter;
  final String descriptionAr;
  final DateTime? createdAt;
  final String? orderNumber;

  bool get isCredit => points > 0;

  factory LoyaltyEntry.fromJson(Map<String, dynamic> json) => LoyaltyEntry(
        id: (json['id'] as String?) ?? '',
        type: (json['type'] as String?) ?? 'ADJUSTMENT',
        points: (json['points'] as num?)?.toInt() ?? 0,
        balanceAfter: (json['balanceAfter'] as num?)?.toInt() ?? 0,
        descriptionAr: (json['descriptionAr'] as String?) ?? '',
        createdAt: DateTime.tryParse((json['createdAt'] as String?) ?? ''),
        orderNumber: json['orderNumber'] as String?,
      );
}

/// رصيد النقاط وقيمته وإعدادات البرنامج.
class LoyaltySummary {
  const LoyaltySummary({
    required this.enabled,
    required this.points,
    required this.valueSar,
    required this.pointsPerSar,
    required this.pointValueSar,
    required this.minRedeemPoints,
    required this.entries,
  });

  /// البرنامج مطفي من اللوحة — بنخفي الشاشة كلها بدل ما نعرض صفر بلا تفسير.
  final bool enabled;
  final int points;
  final double valueSar;
  final double pointsPerSar;
  final double pointValueSar;
  final int minRedeemPoints;
  final List<LoyaltyEntry> entries;

  bool get canRedeem => enabled && points >= minRedeemPoints;

  factory LoyaltySummary.fromJson(Map<String, dynamic> json) => LoyaltySummary(
        enabled: json['enabled'] as bool? ?? false,
        points: (json['points'] as num?)?.toInt() ?? 0,
        valueSar: (json['valueSar'] as num?)?.toDouble() ?? 0,
        pointsPerSar: (json['pointsPerSar'] as num?)?.toDouble() ?? 1,
        pointValueSar: (json['pointValueSar'] as num?)?.toDouble() ?? 0.05,
        minRedeemPoints: (json['minRedeemPoints'] as num?)?.toInt() ?? 100,
        entries: [
          for (final raw in (json['entries'] as List<dynamic>? ?? const []))
            LoyaltyEntry.fromJson(raw as Map<String, dynamic>),
        ],
      );

  static const empty = LoyaltySummary(
    enabled: false,
    points: 0,
    valueSar: 0,
    pointsPerSar: 1,
    pointValueSar: 0.05,
    minRedeemPoints: 100,
    entries: [],
  );
}

/// كود الإحالة وحصيلته.
class ReferralInfo {
  const ReferralInfo({
    required this.code,
    required this.invitedCount,
    required this.rewardPoints,
    required this.usedReferral,
  });

  final String code;
  final int invitedCount;
  final int rewardPoints;

  /// استخدم كود غيره خلاص — فمش هيتعرض عليه إدخال كود تاني.
  final bool usedReferral;

  factory ReferralInfo.fromJson(Map<String, dynamic> json) => ReferralInfo(
        code: (json['code'] as String?) ?? '',
        invitedCount: (json['invitedCount'] as num?)?.toInt() ?? 0,
        rewardPoints: (json['rewardPoints'] as num?)?.toInt() ?? 0,
        usedReferral: json['usedReferral'] as bool? ?? false,
      );
}

/// نتيجة تسعير استبدال النقاط (POST /customer/loyalty/quote).
class RedemptionQuote {
  const RedemptionQuote({required this.points, required this.discountSar});

  final int points;
  final double discountSar;

  factory RedemptionQuote.fromJson(Map<String, dynamic> json) => RedemptionQuote(
        points: (json['points'] as num?)?.toInt() ?? 0,
        discountSar: (json['discountSar'] as num?)?.toDouble() ?? 0,
      );

  static const zero = RedemptionQuote(points: 0, discountSar: 0);
}
