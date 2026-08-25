// تقارير المبيعات — GET /reports/merchant?range=today|week|month.
//
// ملاحظة: ReportRange متعرّف أصلاً في data/merchant_repository.dart (نفس قيم
// الـ wire اللي الـ API بيستقبلها)، فبنعيد تصديره من هنا بدل ما نعرّف نسخة تانية.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/merchant_repository.dart';
import '../models/report.dart';

export '../data/merchant_repository.dart' show ReportRange;

/// نصوص الشاشة — `ReportRange.ar` في الريبو بيقول «آخر ٧ أيام / آخر شهر»،
/// والتصميم بيطلب «هذا الأسبوع / هذا الشهر» في الشريحة وفي عنوان الرسم.
extension ReportRangeLabels on ReportRange {
  /// نص شريحة الفترة في الهيدر.
  String get chipLabel => switch (this) {
        ReportRange.today => 'اليوم',
        ReportRange.week => 'هذا الأسبوع',
        ReportRange.month => 'هذا الشهر',
      };

  /// «مبيعات {…}» في عنوان كارت الرسم.
  String get chartLabel => switch (this) {
        ReportRange.today => 'اليوم',
        ReportRange.week => 'الأسبوع',
        ReportRange.month => 'الشهر',
      };

  /// الفترة اللي بعدها في دورة الشريحة (اليوم ← الأسبوع ← الشهر ← اليوم).
  ReportRange get next => ReportRange.values[(index + 1) % ReportRange.values.length];
}

/// الفترة المختارة في شاشة التقارير.
final reportPeriodProvider =
    NotifierProvider<ReportPeriodNotifier, ReportRange>(ReportPeriodNotifier.new);

class ReportPeriodNotifier extends Notifier<ReportRange> {
  @override
  ReportRange build() => ReportRange.today;

  void select(ReportRange range) => state = range;

  /// دورة الشريحة في الهيدر.
  void cycle() => state = state.next;
}

/// التقرير نفسه — بيعيد الجلب لوحده لما الفترة تتغيّر.
final reportProvider = FutureProvider<MerchantReport>((ref) {
  final range = ref.watch(reportPeriodProvider);
  return ref.watch(reportsRepositoryProvider).merchant(range);
});
