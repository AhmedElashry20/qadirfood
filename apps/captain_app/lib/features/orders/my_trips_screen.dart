// شاشة ١٤: رحلاتي (السجل) + فلاتر.
//
// ══════════════════════════════════════════════════════════════════════════
//                    إيه الحقيقي وإيه اللي مالوش مصدر هنا
// ══════════════════════════════════════════════════════════════════════════
//  ✅ **السجل حقيقي** — GET /orders بفلتر `from` (السيرفر بيحصره على كابتن التوكن).
//  ✅ **مستحق كل رحلة** — `captainPayout`، بيتكتب وقت التسليم فبيبان صح في السجل.
//  ✅ **مجاميع الفترة** — محسوبة على الجهاز من الطلبات المسلّمة (مافيش endpoint أرباح).
//  ⚠️ **الفلاتر client-side** — «اليوم/الأسبوع/الشهر» بتتحوّل لـ `from` بس؛
//     مافيش فلتر جاهز في الـ API لبداية الأسبوع السعودي.
//  ⚠️ **صفحة واحدة (٥٠ صف)** — مافيش لود لانهائي هنا؛ سقف مقصود عشان شاشة سجل.
//  ⚠️ **المسافة** بتتحسب على خط مستقيم من إحداثيات الفرع والعنوان، و«—» لو ناقصة.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/enums.dart';
import '../../core/format.dart' as fmt;
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../data/captain_repository.dart';
import '../../models/earnings.dart';
import '../../models/order.dart';
import '../../widgets/common.dart';

/// أقصى عدد صفوف بنعرضها — صفحة واحدة من GET /orders.
const _kPageSize = 50;

/// الفترة المختارة في السجل — منفصلة عن فترة شاشة الأرباح عن قصد.
class _TripsRangeNotifier extends Notifier<EarningsRange> {
  @override
  EarningsRange build() => EarningsRange.today;

  void select(EarningsRange range) => state = range;
}

final _tripsRangeProvider =
    NotifierProvider<_TripsRangeNotifier, EarningsRange>(_TripsRangeNotifier.new);

/// بداية الفترة — نفس حساب [EarningsSummary] عشان المجاميع والصفوف يتطابقوا.
DateTime _startOf(EarningsRange range) {
  final now = DateTime.now();
  return switch (range) {
    EarningsRange.today => EarningsSummary.startOfDay(now),
    EarningsRange.week => EarningsSummary.startOfWeek(now),
    EarningsRange.month => DateTime(now.year, now.month),
  };
}

/// صفوف السجل — كل الحالات (المسلّم والملغي) عشان الصف الملغي يبان زي التصميم.
final _historyProvider = FutureProvider.family<TripsPage, EarningsRange>(
  (ref, range) => ref.watch(tripsRepositoryProvider).history(
        pageSize: _kPageSize,
        from: _startOf(range),
      ),
);

/// مجاميع الكارت الأسود — محسوبة على الجهاز.
final _summaryProvider = FutureProvider.family<EarningsSummary, EarningsRange>(
  (ref, range) => ref.watch(earningsRepositoryProvider).summary(range),
);

class MyTripsScreen extends ConsumerWidget {
  const MyTripsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final range = ref.watch(_tripsRangeProvider);
    final historyAsync = ref.watch(_historyProvider(range));

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: QHeader(
        title: 'سجل الطلبات',
        bottom: Row(
          children: [
            for (final option in EarningsRange.values) ...[
              QChip(
                label: option.ar,
                selected: option == range,
                onTap: () => ref.read(_tripsRangeProvider.notifier).select(option),
              ),
              if (option != EarningsRange.values.last) const SizedBox(width: 8),
            ],
          ],
        ),
      ),
      body: RefreshIndicator(
        color: QColors.ink,
        onRefresh: () async {
          ref.invalidate(_historyProvider(range));
          ref.invalidate(_summaryProvider(range));
          await ref.read(_historyProvider(range).future);
        },
        child: historyAsync.when(
          loading: () => const QLoading(),
          error: (error, _) => ListView(
            children: [
              const SizedBox(height: 80),
              QErrorView(
                message: error is ApiException ? error.message : 'مش قادرين نجيب السجل',
                onRetry: () => ref.invalidate(_historyProvider(range)),
              ),
            ],
          ),
          data: (page) => ListView(
            padding: const EdgeInsets.all(QSpace.screenH),
            children: [
              _SummaryCard(range: range),
              const SizedBox(height: 14),
              if (page.trips.isEmpty)
                const Padding(
                  padding: EdgeInsets.only(top: 40),
                  child: QEmpty(message: 'مافيش طلبات في الفترة دي'),
                )
              else
                for (final trip in page.trips) ...[
                  _TripRow(trip: trip),
                  const SizedBox(height: 10),
                ],
            ],
          ),
        ),
      ),
    );
  }
}

/// الكارت الأسود — عدد الطلبات ومجموع المستحق في الفترة.
class _SummaryCard extends ConsumerWidget {
  const _SummaryCard({required this.range});

  final EarningsRange range;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(_summaryProvider(range)).valueOrNull;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
      decoration: BoxDecoration(
        color: QColors.ink,
        borderRadius: BorderRadius.circular(QRadius.lg),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(text: '${range.ar} — '),
                      TextSpan(
                        text: fmt.ltr('${summary?.rangeOrders ?? 0}'),
                        style: QText.num(size: 12, weight: FontWeight.w800, color: QColors.darkSub),
                      ),
                      const TextSpan(text: ' طلب'),
                    ],
                  ),
                  style: const TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: QColors.darkSub,
                  ),
                ),
                const SizedBox(height: 4),
                Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: fmt.money(summary?.rangeTotal ?? 0),
                        style: QText.num(size: 22, weight: FontWeight.w800, color: QColors.brand),
                      ),
                      const TextSpan(
                        text: ' ر.س',
                        style: TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: QColors.brand,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const Text('📦', style: TextStyle(fontSize: 26)),
        ],
      ),
    );
  }
}

/// صف رحلة واحدة.
class _TripRow extends StatelessWidget {
  const _TripRow({required this.trip});

  final CaptainTrip trip;

  /// «14:32» — من وقت التسليم لو موجود وإلا وقت الطلب.
  static String _timeOnly(DateTime value) =>
      '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final cancelled = trip.status.isCancelled;
    final at = trip.deliveredAt ?? trip.placedAt;
    final km = trip.distanceKm;

    final row = QCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      onTap: () => context.push(QRoutes.tripDetails(trip.id)),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${trip.restaurantName} → ${trip.addressLabel}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: QText.cardTitle.copyWith(fontSize: 14),
                ),
                const SizedBox(height: 4),
                // الميتا كلها أرقام ولاتيني — Outfit جوّه عزل LTR.
                QLtr(
                  child: Text(
                    [
                      trip.number,
                      _timeOnly(at),
                      km == null ? '— km' : '${fmt.money(km)} km',
                    ].join(' · '),
                    style: QText.num(
                      size: 11.5,
                      weight: FontWeight.w600,
                      color: QColors.textMuted,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              // الرحلة الملغية مستحقها صفر — بنعرضه بالأحمر مش بنخفيه.
              QLtr(
                child: Text(
                  cancelled ? fmt.money(0) : '+${fmt.money(trip.payout)}',
                  style: QText.num(
                    size: 15,
                    weight: FontWeight.w800,
                    color: cancelled ? QColors.danger : QColors.success,
                  ),
                ),
              ),
              const SizedBox(height: 3),
              Text(
                cancelled ? '✕ ملغي' : (trip.isDelivered ? '✓ تم التسليم' : trip.stepLabel),
                style: TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 11.5,
                  fontWeight: FontWeight.w700,
                  color: cancelled
                      ? QColors.danger
                      : (trip.isDelivered ? QColors.success : QColors.gold),
                ),
              ),
            ],
          ),
        ],
      ),
    );

    return cancelled ? Opacity(opacity: 0.6, child: row) : row;
  }
}
