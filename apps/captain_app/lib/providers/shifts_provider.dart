// الورديات — بتقرا من دورة حياة الوردية الحقيقية في موديول الكابتن.
//
//   • [shiftsByRangeProvider] → GET /captains/me/shifts?range=…
//   • البدء/الإنهاء (POST /shifts/start · /shifts/end) في [CaptainRepository]،
//     وشاشة الورديات بتناديهم مباشرةً وبتعمل invalidate للـ family بعد النجاح.
//
// نفس فكرة الأرباح: النداء بيرجّع **فترة واحدة بس** في المرة، فالفترة عاملة
// `family` — كل فترة ليها كاش لوحدها، وشريط «اليوم/الأسبوع/الشهر» بيبدّل بينهم
// من غير نداءات مكررة.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/enums.dart';
import '../data/captain_repository.dart';
import '../models/shift.dart';

/// الفترة المعروضة في شاشة الورديات (اليوم / الأسبوع / الشهر).
class ShiftRangeNotifier extends Notifier<EarningsRange> {
  @override
  EarningsRange build() => EarningsRange.today;

  void select(EarningsRange range) => state = range;
}

final shiftRangeProvider =
    NotifierProvider<ShiftRangeNotifier, EarningsRange>(ShiftRangeNotifier.new);

/// ملخص ورديات فترة معيّنة — كل فترة ليها كاش مستقل.
final shiftsByRangeProvider = FutureProvider.family<ShiftsSummary, EarningsRange>(
  (ref, range) => ref.watch(captainRepositoryProvider).shifts(range),
);

/// ملخص ورديات الفترة المختارة حالياً — بيعيد استخدام كاش [shiftsByRangeProvider]
/// فمافيش نداء زيادة لما الشريط يبقى معروض.
final shiftsProvider = FutureProvider<ShiftsSummary>(
  (ref) => ref.watch(shiftsByRangeProvider(ref.watch(shiftRangeProvider)).future),
);
