// توزيعات شركة الأسطول — الكابتن التابع لشركة **بتدفعله شركته مش المنصة**.
//
// المصدر: `GET /captains/me/distributions` — بيرجّع مجاميع (مدفوع/معلّق/عدد رحلات)
// وقايمة تسويات، كل تسوية = حصة الكابتن عن فترة محاسبة بحالتها (PENDING/PAID).
//
// ⚠️ الفلوس دي بتتحرّك **بين الشركة والكابتن برّه المنصة**: المنصة بتحاسب الشركة
// والشركة بتوزّع على الكابتن. الأرقام هنا هي اللي الشركة **سجّلته** كمستحق أو مدفوع،
// مش حركة محفظة على المنصة. الكابتن المستقل بترجع له `distributions` فاضية.
import 'package:flutter/material.dart';

import '../core/format.dart';
import '../core/theme.dart';

/// حالة توزيعة الشركة — مطابقة لـ `status` في الرد.
enum DistributionStatus {
  pending('PENDING', 'بانتظار دفع الشركة'),
  paid('PAID', 'الشركة دفعتلك');

  const DistributionStatus(this.wire, this.ar);

  final String wire;
  final String ar;

  static DistributionStatus fromWire(String value) => DistributionStatus.values.firstWhere(
        (s) => s.wire == value,
        orElse: () => DistributionStatus.pending,
      );

  bool get isPaid => this == DistributionStatus.paid;

  Color get color => switch (this) {
        DistributionStatus.pending => QColors.goldDeep,
        DistributionStatus.paid => QColors.success,
      };

  /// خلفية الشريحة — ألوان صريحة من الثيم زي باقي شرائح الحالة.
  Color get chipColor => switch (this) {
        DistributionStatus.pending => QColors.tintStrong,
        DistributionStatus.paid => QColors.successTint,
      };
}

/// تسوية واحدة — حصة الكابتن عن فترة محاسبة الشركة.
class CompanyDistribution {
  const CompanyDistribution({
    required this.id,
    required this.companyName,
    required this.amount,
    required this.tripCount,
    required this.status,
    this.periodEnd,
    this.reference,
    this.paidAt,
  });

  final String id;
  final String companyName;

  /// حصة الكابتن — إجمالي مستحقه عن رحلات الفترة.
  final double amount;
  final int tripCount;
  final DistributionStatus status;

  /// نهاية فترة المحاسبة.
  final DateTime? periodEnd;

  /// مرجع دفع الشركة — بيتملى بعد ما الشركة تدفع بس.
  final String? reference;
  final DateTime? paidAt;

  bool get isPaid => status.isPaid;

  bool get hasReference => reference != null && reference!.trim().isNotEmpty;

  factory CompanyDistribution.fromJson(Map<String, dynamic> json) => CompanyDistribution(
        id: asText(json['id']),
        companyName: asText(json['companyName']),
        amount: asMoney(json['amount']),
        tripCount: asInt(json['tripCount']),
        status: DistributionStatus.fromWire(asText(json['status'], 'PENDING')),
        periodEnd: asDate(json['periodEnd']),
        reference: json['reference'] as String?,
        paidAt: asDate(json['paidAt']),
      );
}

/// رد `GET /captains/me/distributions` — المجاميع + قايمة التسويات.
class CaptainDistributions {
  const CaptainDistributions({
    required this.totalPaid,
    required this.totalPending,
    required this.tripCount,
    required this.distributions,
  });

  /// مجموع اللي الشركة سجّلته كمدفوع للكابتن.
  final double totalPaid;

  /// مجموع اللي لسه مستحق على الشركة.
  final double totalPending;

  final int tripCount;
  final List<CompanyDistribution> distributions;

  bool get isEmpty => distributions.isEmpty;

  factory CaptainDistributions.fromJson(Map<String, dynamic> json) => CaptainDistributions(
        totalPaid: asMoney(json['totalPaid']),
        totalPending: asMoney(json['totalPending']),
        tripCount: asInt(json['tripCount']),
        distributions: [
          for (final raw in (json['distributions'] as List<dynamic>? ?? const []))
            if (raw is Map<String, dynamic>) CompanyDistribution.fromJson(raw),
        ],
      );
}
