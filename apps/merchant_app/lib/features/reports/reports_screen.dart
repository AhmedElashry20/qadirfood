// شاشة ١٢: التقارير والمبيعات — يوم/أسبوع/شهر.
// جوّه الشل السفلي، فمافيش زر رجوع في الهيدر.
//
// الرسم أعمدة بـ Container عادية زي ما التصميم مرسوم بالظبط — مش fl_chart،
// عشان نتحكم في الراديوس والألوان والتمييز بدون طبقة زيادة.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/format.dart' as fmt;
import '../../core/theme.dart';
import '../../models/report.dart';
import '../../providers/branch_status_provider.dart';
import '../../providers/reports_provider.dart';
import '../../widgets/common.dart';

/// لون العمود العادي في الرسم — الأعمدة الأعلى بتاخد لون البراند.
const _idleBar = Color(0xFFEDE9DC);

class ReportsScreen extends ConsumerWidget {
  const ReportsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final period = ref.watch(reportPeriodProvider);
    final report = ref.watch(reportProvider);

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: QHeader(
        showBack: false,
        title: 'التقارير',
        trailing: QChip(
          label: '${period.chipLabel} ▾',
          selected: true,
          onTap: () => ref.read(reportPeriodProvider.notifier).cycle(),
        ),
      ),
      body: RefreshIndicator(
        color: QColors.brand,
        onRefresh: () async => ref.invalidate(reportProvider),
        child: report.when(
          loading: () => const QLoading(),
          error: (error, _) => ListView(
            children: [
              const SizedBox(height: 80),
              QErrorView(
                message: error is ApiException ? error.message : 'تعذّر تحميل التقرير',
                onRetry: () => ref.invalidate(reportProvider),
              ),
            ],
          ),
          data: (value) => _body(context, ref, value, period),
        ),
      ),
    );
  }

  Widget _body(BuildContext context, WidgetRef ref, MerchantReport report, ReportRange period) {
    // التقييم مش موجود في رد /reports/merchant — بنجيبه من الفرع لو محمّل.
    final branch = ref.watch(branchProvider).valueOrNull;
    final rating = report.rating ?? branch?.rating;
    final ratingCount = report.ratingCount ?? branch?.ratingCount;

    // الـ API بيعمل GROUP BY فبيسقط الأيام اللي مافيهاش طلبات — في مدى الأسبوع
    // بنستخدم weekSeries اللي بيملا الأيام الناقصة بصفر عشان الرسم يفضل ٧ أعمدة.
    final series = period == ReportRange.week ? report.weekSeries : report.dailySeries;

    return ListView(
      padding: const EdgeInsets.fromLTRB(QSpace.screenH, 16, QSpace.screenH, 28),
      children: [
        Row(
          children: [
            Expanded(
              child: _Kpi(
                label: 'المبيعات (ر.س)',
                value: fmt.money(report.totalSales),
                inverted: true,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(child: _Kpi(label: 'الطلبات', value: '${report.ordersCount}')),
            const SizedBox(width: 10),
            Expanded(child: _Kpi(label: 'متوسط السلة', value: fmt.money(report.avgBasket))),
          ],
        ),
        const SizedBox(height: 14),
        _ChartCard(period: period, series: series, deltaPercent: report.deltaPercent),
        const SizedBox(height: 14),
        _TopItemsCard(items: report.topItems),
        const SizedBox(height: 14),
        _RatingCard(rating: rating, ratingCount: ratingCount),
      ],
    );
  }
}

// ─────────────────────────── مؤشرات علوية ───────────────────────────

class _Kpi extends StatelessWidget {
  const _Kpi({required this.label, required this.value, this.inverted = false});

  final String label;
  final String value;

  /// كارت المبيعات أسود بقيمة صفرا — أهم رقم في الشاشة.
  final bool inverted;

  @override
  Widget build(BuildContext context) {
    return QCard(
      color: inverted ? QColors.ink : QColors.surface,
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          QLtr(
            child: Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: QText.num(
                size: 20,
                weight: FontWeight.w800,
                color: inverted ? QColors.brand : QColors.ink,
              ),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: inverted ? QColors.darkSub : QColors.label,
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────── رسم المبيعات ───────────────────────────

class _ChartCard extends StatelessWidget {
  const _ChartCard({required this.period, required this.series, this.deltaPercent});

  final ReportRange period;
  final List<ReportBar> series;

  /// الـ API مابيحسبش المقارنة بالفترة اللي فاتت، فبتفضل null والسطر ما يظهرش.
  final double? deltaPercent;

  @override
  Widget build(BuildContext context) {
    final maxValue = series.fold<double>(0, (acc, bar) => bar.value > acc ? bar.value : acc);
    final delta = deltaPercent;

    return QCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'مبيعات ${period.chartLabel}',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: QColors.ink,
                  ),
                ),
              ),
              if (delta != null)
                Text(
                  '${delta < 0 ? '▼' : '▲'} ${fmt.ltr('${fmt.money(delta.abs())}%')}'
                  ' عن الفترة السابقة',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 11.5,
                    fontWeight: FontWeight.w800,
                    color: delta < 0 ? QColors.danger : QColors.success,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 16),
          if (series.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: QEmpty(message: 'لا توجد مبيعات في هذه الفترة', emoji: '📊'),
            )
          else ...[
            SizedBox(
              height: 110,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  for (final bar in series)
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 3),
                        child: Align(
                          alignment: Alignment.bottomCenter,
                          child: FractionallySizedBox(
                            // كل الأعمدة بصفر (أو مافيش مبيعات) → أعمدة مسطحة
                            // بدل قسمة على صفر.
                            heightFactor: maxValue <= 0 ? 0.05 : _factor(bar.value, maxValue),
                            child: Container(
                              decoration: BoxDecoration(
                                color: maxValue > 0 && bar.value == maxValue
                                    ? QColors.brand
                                    : _idleBar,
                                borderRadius: const BorderRadius.vertical(
                                  top: Radius.circular(7),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                for (final bar in series)
                  Expanded(
                    child: Text(
                      bar.label,
                      textAlign: TextAlign.center,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontFamily: 'Cairo',
                        fontSize: 10,
                        fontWeight: maxValue > 0 && bar.value == maxValue
                            ? FontWeight.w800
                            : FontWeight.w700,
                        color: maxValue > 0 && bar.value == maxValue ? QColors.ink : QColors.faint,
                      ),
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  /// أقل ارتفاع ٥٪ عشان اليوم اللي مبيعاته صفر يفضل باين كخط.
  static double _factor(double value, double max) {
    final ratio = value / max;
    return ratio < 0.05 ? 0.05 : ratio;
  }
}

// ─────────────────────────── الأكثر مبيعاً ───────────────────────────

class _TopItemsCard extends StatelessWidget {
  const _TopItemsCard({required this.items});

  final List<ReportTopItem> items;

  @override
  Widget build(BuildContext context) {
    return QCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'الأصناف الأكثر مبيعاً',
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: QColors.ink,
            ),
          ),
          const SizedBox(height: 10),
          if (items.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: QEmpty(message: 'لا توجد أصناف مباعة في هذه الفترة', emoji: '🍔'),
            )
          else
            for (var i = 0; i < items.length; i++)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 7),
                child: Row(
                  children: [
                    SizedBox(
                      width: 18,
                      child: Text(
                        '${i + 1}',
                        style: QText.num(size: 14, color: QColors.gold),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        items[i].name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: QText.body.copyWith(fontSize: 14),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text.rich(
                      TextSpan(
                        text: '${items[i].count}',
                        style: QText.num(size: 13.5, color: QColors.label),
                        children: [
                          TextSpan(
                            text: ' طلب',
                            style: TextStyle(
                              fontFamily: 'Cairo',
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: QColors.label,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
        ],
      ),
    );
  }
}

// ─────────────────────────── التقييم ───────────────────────────

class _RatingCard extends StatelessWidget {
  const _RatingCard({this.rating, this.ratingCount});

  final double? rating;
  final int? ratingCount;

  @override
  Widget build(BuildContext context) {
    return QCard(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '⭐ تقييم المطعم',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: QColors.ink,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  ratingCount == null ? 'لم تصل تقييمات بعد' : '${fmt.ltr('$ratingCount')} تقييم',
                  style: QText.tiny.copyWith(fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            decoration: BoxDecoration(
              color: QColors.inkSurface,
              borderRadius: BorderRadius.circular(10),
            ),
            child: QLtr(
              child: Text(
                rating == null ? '—' : '${fmt.rating(rating!)} ★',
                style: QText.num(size: 14, color: QColors.brand),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
