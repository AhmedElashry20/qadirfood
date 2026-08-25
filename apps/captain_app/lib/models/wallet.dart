// المحفظة والحركات وطلبات السحب وحسابات الاستلام.
//
// كل اللي هنا **حقيقي ١٠٠٪** وجاي من موديول الكابتن في الـ API:
//   • GET  /captains/me/wallet               → [Wallet]
//   • GET  /captains/me/wallet/transactions  → [WalletTransaction] (مرقّمة)
//   • GET  /captains/me/withdrawals          → [WithdrawalRequest] (مرقّمة)
//   • POST /captains/me/withdrawals          → [WithdrawalRequest]
//   • GET/POST/DELETE /captains/me/payout-methods → [PayoutMethod]
//
// ملاحظتين على سلوك السيرفر لازم الشاشات تعرفهم:
//  ١) **الرصيد مابيتخصمش وقت الطلب.** لما الكابتن يطلب سحب، `balance` بيفضل زي ما
//     هو و `pendingWithdrawals` بيزيد و `availableToWithdraw` بيقل. الخصم الفعلي
//     بيحصل وقت موافقة الأدمن بس. عشان كده الشاشة بتعرض التلاتة مع بعض.
//  ٢) `accountRef` و `destinationRef` **بيرجعوا مقنّعين دايماً** («SA03 •••• 7519»).
//     البيانات الكاملة مابتخرجش من الـ API خالص، فمافيش داعي نحاول نعرضها.
import 'package:flutter/material.dart';

import '../core/format.dart';
import '../core/theme.dart';

/// صفحة مرقّمة من أي قايمة في المحفظة — نفس شكل `TripsPage`.
typedef WalletPage<T> = ({List<T> data, int total, int page, int pageSize});

// ─────────────────────────── الأنواع ───────────────────────────

/// نوع حركة المحفظة — مطابق لـ `WalletEntryType` في الـ schema.
enum WalletEntryType {
  tripPayout('TRIP_PAYOUT', 'أجرة رحلة'),
  tip('TIP', 'إكرامية'),
  bonus('BONUS', 'مكافأة'),
  adjustment('ADJUSTMENT', 'تسوية'),
  withdrawal('WITHDRAWAL', 'سحب'),
  withdrawalReversal('WITHDRAWAL_REVERSAL', 'رجوع سحب');

  const WalletEntryType(this.wire, this.ar);

  final String wire;
  final String ar;

  static WalletEntryType fromWire(String value) => WalletEntryType.values.firstWhere(
        (t) => t.wire == value,
        orElse: () => WalletEntryType.adjustment,
      );
}

/// جهة استلام الفلوس — بنك أو stc pay.
enum PayoutDestination {
  bank('BANK', 'حساب بنكي', '🏦'),
  stcPay('STC_PAY', 'stc pay', '📱');

  const PayoutDestination(this.wire, this.ar, this.emoji);

  final String wire;
  final String ar;
  final String emoji;

  static PayoutDestination fromWire(String value) => PayoutDestination.values.firstWhere(
        (d) => d.wire == value,
        orElse: () => PayoutDestination.bank,
      );
}

/// حالة طلب السحب — مطابقة لـ `WithdrawalStatus` في الـ schema.
enum WithdrawalStatus {
  pending('PENDING', 'قيد المراجعة'),
  approved('APPROVED', 'تمت الموافقة'),
  rejected('REJECTED', 'مرفوض'),
  transferred('TRANSFERRED', 'تم التحويل');

  const WithdrawalStatus(this.wire, this.ar);

  final String wire;
  final String ar;

  static WithdrawalStatus fromWire(String value) => WithdrawalStatus.values.firstWhere(
        (s) => s.wire == value,
        orElse: () => WithdrawalStatus.pending,
      );

  Color get color => switch (this) {
        WithdrawalStatus.pending => QColors.goldDeep,
        WithdrawalStatus.approved || WithdrawalStatus.transferred => QColors.success,
        WithdrawalStatus.rejected => QColors.danger,
      };

  /// خلفية الشريحة — ألوان صريحة من الثيم بدل شفافية، زي باقي شرائح الحالة.
  Color get chipColor => switch (this) {
        WithdrawalStatus.pending => QColors.tintStrong,
        WithdrawalStatus.approved || WithdrawalStatus.transferred => QColors.successTint,
        WithdrawalStatus.rejected => QColors.dangerBorder,
      };
}

// ─────────────────────────── الموديلات ───────────────────────────

/// حسـاب استلام محفوظ — `accountRef` مقنّع من السيرفر.
class PayoutMethod {
  const PayoutMethod({
    required this.id,
    required this.destination,
    required this.label,
    required this.accountRef,
    required this.isDefault,
    this.createdAt,
  });

  final String id;
  final PayoutDestination destination;

  /// اسم الجهة زي ما الكابتن كتبه («بنك الراجحي»).
  final String label;

  /// **مقنّع دايماً** — «SA03 •••• 7519».
  final String accountRef;
  final bool isDefault;
  final DateTime? createdAt;

  factory PayoutMethod.fromJson(Map<String, dynamic> json) => PayoutMethod(
        id: asText(json['id']),
        destination: PayoutDestination.fromWire(asText(json['destination'], 'BANK')),
        label: asText(json['label']),
        accountRef: asText(json['accountRef']),
        isDefault: json['isDefault'] == true,
        createdAt: asDate(json['createdAt']),
      );
}

/// رصيد المحفظة + حسابات الاستلام.
class Wallet {
  const Wallet({
    required this.balance,
    required this.pendingWithdrawals,
    required this.availableToWithdraw,
    required this.payoutMethods,
  });

  /// الرصيد الكلي — **مابيقلّش وقت طلب السحب** (شوف تعليق أول الملف).
  final double balance;

  /// مجموع طلبات السحب اللي لسه تحت المراجعة — محجوز مش مخصوم.
  final double pendingWithdrawals;

  /// `balance - pendingWithdrawals` — ده الرقم اللي الكابتن يقدر يسحب منه.
  final double availableToWithdraw;

  final List<PayoutMethod> payoutMethods;

  bool get hasPayoutMethods => payoutMethods.isNotEmpty;

  bool get hasPending => pendingWithdrawals > 0;

  /// أقل مبلغ سحب يقبله السيرفر (`CreateWithdrawalDto.amount` بـ `@Min(50)`).
  static const minWithdrawal = 50.0;

  bool get canWithdraw => hasPayoutMethods && availableToWithdraw >= minWithdrawal;

  factory Wallet.fromJson(Map<String, dynamic> json) => Wallet(
        balance: asMoney(json['balance']),
        pendingWithdrawals: asMoney(json['pendingWithdrawals']),
        availableToWithdraw: asMoney(json['availableToWithdraw']),
        payoutMethods: [
          for (final raw in (json['payoutMethods'] as List<dynamic>? ?? const []))
            if (raw is Map<String, dynamic>) PayoutMethod.fromJson(raw),
        ],
      );
}

/// صف واحد في كشف الحساب.
class WalletTransaction {
  const WalletTransaction({
    required this.id,
    required this.type,
    required this.amount,
    required this.balanceAfter,
    required this.descriptionAr,
    this.orderId,
    this.withdrawalId,
    this.createdAt,
  });

  final String id;
  final WalletEntryType type;

  /// **بإشارة** — موجب للإيداع وسالب للسحب. مابنحسبش الإشارة من النوع.
  final double amount;

  /// الرصيد بعد الحركة — السيرفر بيحسبه وقت الكتابة.
  final double balanceAfter;

  /// وصف عربي جاهز من السيرفر («أجرة رحلة QF-1042»).
  final String descriptionAr;

  final String? orderId;
  final String? withdrawalId;
  final DateTime? createdAt;

  bool get isCredit => amount >= 0;

  Color get color => isCredit ? QColors.success : QColors.danger;

  /// «+12.50» / «-50» — الإشارة صريحة عشان الصف يتقرا بسرعة.
  String get signedAmount => '${isCredit ? '+' : '-'}${money(amount.abs())}';

  factory WalletTransaction.fromJson(Map<String, dynamic> json) => WalletTransaction(
        id: asText(json['id']),
        type: WalletEntryType.fromWire(asText(json['type'])),
        amount: asMoney(json['amount']),
        balanceAfter: asMoney(json['balanceAfter']),
        descriptionAr: asText(json['descriptionAr']),
        orderId: json['orderId'] as String?,
        withdrawalId: json['withdrawalId'] as String?,
        createdAt: asDate(json['createdAt']),
      );
}

/// طلب سحب واحد.
class WithdrawalRequest {
  const WithdrawalRequest({
    required this.id,
    required this.amount,
    required this.status,
    required this.destination,
    required this.destinationRef,
    this.rejectReason,
    this.reviewedAt,
    this.transferredAt,
    this.createdAt,
  });

  final String id;
  final double amount;
  final WithdrawalStatus status;
  final PayoutDestination destination;

  /// آخر ٤ أرقام مقنّعة — «•••• 7519».
  final String destinationRef;

  /// سبب الرفض — بيتملى وقت الرفض بس.
  final String? rejectReason;
  final DateTime? reviewedAt;
  final DateTime? transferredAt;
  final DateTime? createdAt;

  bool get isPending => status == WithdrawalStatus.pending;

  bool get isRejected => status == WithdrawalStatus.rejected;

  /// نص الشريحة — المرفوض بيوضّح السبب جوّه الصف مش في الشريحة.
  String get statusLabel => switch (status) {
        WithdrawalStatus.approved || WithdrawalStatus.transferred => 'تم التحويل',
        _ => status.ar,
      };

  factory WithdrawalRequest.fromJson(Map<String, dynamic> json) => WithdrawalRequest(
        id: asText(json['id']),
        amount: asMoney(json['amount']),
        status: WithdrawalStatus.fromWire(asText(json['status'], 'PENDING')),
        destination: PayoutDestination.fromWire(asText(json['destination'], 'BANK')),
        destinationRef: asText(json['destinationRef']),
        rejectReason: json['rejectReason'] as String?,
        reviewedAt: asDate(json['reviewedAt']),
        transferredAt: asDate(json['transferredAt']),
        createdAt: asDate(json['createdAt']),
      );
}
