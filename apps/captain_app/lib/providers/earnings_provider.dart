// الأرباح والمحفظة — كلها بتقرا من موديول الكابتن الحقيقي دلوقتي.
//
//   • [earningsProvider] → GET /captains/me/earnings?range=…
//   • [walletProvider] → GET /captains/me/wallet
//   • [walletTransactionsProvider] → GET /captains/me/wallet/transactions
//   • [withdrawalsProvider] → GET /captains/me/withdrawals
//
// ملاحظة على الفترات: نداء الأرباح بيرجّع **فترة واحدة بس** في المرة، مش التلاتة
// زي الحسبة القديمة على الجهاز. عشان كده الفترة عاملة `family` — كل فترة ليها
// كاش لوحدها، وشريط «اليوم/الأسبوع/الشهر» بيراقب التلاتة من غير نداءات مكررة.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/enums.dart';
import '../data/captain_repository.dart';
import '../models/distributions.dart';
import '../models/earnings.dart';
import '../models/wallet.dart';

/// الفترة المعروضة في شاشة الأرباح (اليوم / الأسبوع / الشهر).
class EarningsRangeNotifier extends Notifier<EarningsRange> {
  @override
  EarningsRange build() => EarningsRange.today;

  void select(EarningsRange range) => state = range;
}

final earningsRangeProvider =
    NotifierProvider<EarningsRangeNotifier, EarningsRange>(EarningsRangeNotifier.new);

/// ملخص أرباح فترة معيّنة — كل فترة ليها كاش مستقل.
final earningsByRangeProvider = FutureProvider.family<EarningsSummary, EarningsRange>(
  (ref, range) => ref.watch(captainRepositoryProvider).earnings(range),
);

/// ملخص أرباح الفترة المختارة حالياً — بيعيد استخدام كاش [earningsByRangeProvider]
/// فمافيش نداء زيادة لما الشريط يبقى معروض.
final earningsProvider = FutureProvider<EarningsSummary>(
  (ref) => ref.watch(earningsByRangeProvider(ref.watch(earningsRangeProvider)).future),
);

/// رصيد المحفظة + حسابات الاستلام.
///
/// ده مصدر «الرصيد القابل للسحب» في شاشة الأرباح — مش `walletBalance` بتاع
/// الكابتن، لأن ده بيشيل كمان طلبات السحب المعلّقة.
final walletProvider = FutureProvider<Wallet>(
  (ref) => ref.watch(captainRepositoryProvider).wallet(),
);

/// كشف الحساب — صفحة واحدة في المرة، الأحدث الأول.
final walletTransactionsProvider = FutureProvider.family<WalletPage<WalletTransaction>, int>(
  (ref, page) => ref.watch(captainRepositoryProvider).walletTransactions(page: page),
);

/// سجل طلبات السحب.
final withdrawalsProvider = FutureProvider.family<WalletPage<WithdrawalRequest>, int>(
  (ref, page) => ref.watch(captainRepositoryProvider).withdrawals(page: page),
);

/// توزيعات شركة الأسطول — مصدرها `GET /captains/me/distributions`.
///
/// للكابتن التابع لشركة بس: بيوضّح اللي الشركة دفعته/مستحق عليها وقايمة التسويات.
/// الكابتن المستقل بترجع له قايمة فاضية (فلوسه على المحفظة مش هنا).
final distributionsProvider = FutureProvider<CaptainDistributions>(
  (ref) => ref.watch(captainRepositoryProvider).myDistributions(),
);
