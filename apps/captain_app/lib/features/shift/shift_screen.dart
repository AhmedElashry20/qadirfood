// شاشة ١٨: الورديات — دورة حياة الوردية كاملة + إحصائيات الفترة.
//
// ✅ **بقى فيه endpoints حقيقية للورديات** (`/captains/me/shifts` + start/end)،
//    فكل الأرقام هنا حقيقية دلوقتي:
//   • «ساعات الاتصال» من `onlineMinutes` (الوردية المفتوحة بتتحسب لحد دلوقتي) —
//     مابقتش «—».
//   • الرحلات والأرباح للفترة المختارة (اليوم/الأسبوع/الشهر).
//   • سجل الورديات: كل وردية ببدايتها ونهايتها ومدتها ورحلاتها وأرباحها.
//
// زرار «بدء/إنهاء الوردية» بينادي REST (start/end) اللي بيظبط حالة الكابتن في
// الداتابيز كمان، وبنزامن معاه الحالة المحلية (سوكيت + بث الموقع) عشان بدء
// الوردية يخلّي الكابتن يستقبل طلبات فعلاً — مش بس يفتح صف في الجدول.
//
// «أيام الأسبوع» تحت لسه من `GET /captains/me/earnings` (متسلسلة الأرباح المصفّرة)
// — عرض أرباح مختلف الحبيبة عن سجل الورديات، وسايبينه زي ما كان.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/enums.dart';
import '../../core/format.dart' as fmt;
import '../../core/theme.dart';
import '../../data/captain_repository.dart';
import '../../models/earnings.dart';
import '../../models/shift.dart';
import '../../providers/captain_status_provider.dart';
import '../../providers/earnings_provider.dart';
import '../../providers/shifts_provider.dart';
import '../../widgets/common.dart';

class ShiftScreen extends ConsumerWidget {
  const ShiftScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final range = ref.watch(shiftRangeProvider);
    final shiftsAsync = ref.watch(shiftsProvider);
    final weekAsync = ref.watch(earningsByRangeProvider(EarningsRange.week));

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: const QHeader(title: 'الورديات'),
      body: RefreshIndicator(
        color: QColors.ink,
        onRefresh: () async {
          ref.invalidate(shiftsByRangeProvider);
          ref.invalidate(earningsByRangeProvider);
          await ref.read(shiftsProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.all(QSpace.screenH),
          children: [
            // ── شريط الفترة ──
            _RangeChips(
              selected: range,
              onSelect: (value) => ref.read(shiftRangeProvider.notifier).select(value),
            ),
            const SizedBox(height: 14),

            // ── كارت المجاميع + زرار البدء/الإنهاء + السجل ──
            shiftsAsync.when(
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 60),
                child: QLoading(),
              ),
              error: (error, _) => QErrorView(
                message: error is ApiException ? error.message : 'مش قادرين نجيب الورديات',
                onRetry: () => ref.invalidate(shiftsByRangeProvider),
              ),
              data: (summary) => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _StatsCard(summary: summary),
                  const SizedBox(height: 14),
                  _ShiftToggle(activeShift: summary.activeShift),
                  const SizedBox(height: 22),
                  Text('سجل الورديات', style: QText.section.copyWith(fontSize: 14)),
                  const SizedBox(height: 8),
                  if (summary.isEmpty)
                    const QEmpty(
                      emoji: '🗓',
                      message: 'مفيش ورديات في الفترة دي — ابدأ وردية عشان تستقبل طلبات',
                    )
                  else
                    _ShiftHistory(shifts: summary.shifts),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // ── أيام الأسبوع: أرباح كل يوم من متسلسلة الأرباح ──
            Text('أرباح أيام الأسبوع', style: QText.section.copyWith(fontSize: 14)),
            const SizedBox(height: 8),
            _WeekList(weekAsync: weekAsync),
          ],
        ),
      ),
    );
  }
}

/// اليوم / الأسبوع / الشهر — شريط شرائح يبدّل فترة المجاميع والسجل.
class _RangeChips extends StatelessWidget {
  const _RangeChips({required this.selected, required this.onSelect});

  final EarningsRange selected;
  final ValueChanged<EarningsRange> onSelect;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        for (final range in EarningsRange.values) ...[
          QChip(
            label: range.ar,
            selected: range == selected,
            onTap: () => onSelect(range),
          ),
          if (range != EarningsRange.values.last) const SizedBox(width: 8),
        ],
      ],
    );
  }
}

/// الكارت الأسود — ساعات الاتصال (كبيرة) + الرحلات والأرباح للفترة.
class _StatsCard extends StatelessWidget {
  const _StatsCard({required this.summary});

  final ShiftsSummary summary;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 20),
      decoration: BoxDecoration(
        color: QColors.ink,
        borderRadius: BorderRadius.circular(QRadius.xl),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text(
                'ساعات الاتصال',
                style: TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: QColors.darkSub,
                ),
              ),
              const Spacer(),
              // شارة الوردية المفتوحة — بتوضّح إن العدّاد لسه ماشي.
              if (summary.isOnShift)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: QColors.inkSoft,
                    borderRadius: BorderRadius.circular(QRadius.pill),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: const BoxDecoration(
                          color: QColors.online,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 6),
                      const Text(
                        'على وردية',
                        style: TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 11.5,
                          fontWeight: FontWeight.w800,
                          color: QColors.online,
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
          const SizedBox(height: 8),
          Text.rich(
            TextSpan(children: _durationSpans(summary.onlineMinutes, size: 30, color: Colors.white)),
          ),
          const SizedBox(height: 14),
          const Divider(color: QColors.inkLine, height: 1),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: _Stat(
                  label: 'رحلات الفترة',
                  value: fmt.ltr('${summary.trips}'),
                  color: QColors.brand,
                ),
              ),
              Container(width: 1, height: 34, color: QColors.inkLine),
              Expanded(
                child: _Stat(
                  label: 'أرباح الفترة',
                  value: fmt.money(summary.earnings),
                  color: QColors.online,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value, required this.color});

  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        QLtr(child: Text(value, style: QText.num(size: 19, color: color))),
        const SizedBox(height: 3),
        Text(
          label,
          style: const TextStyle(
            fontFamily: 'Cairo',
            fontSize: 11.5,
            fontWeight: FontWeight.w700,
            color: QColors.darkSub,
          ),
        ),
      ],
    );
  }
}

/// زرار البدء/الإنهاء — أهم تحكّم في الشاشة.
///
/// بينادي REST (اللي بيظبط حالة الكابتن في الداتابيز)، وبيزامن الحالة المحلية
/// (سوكيت + بث الموقع) عشان بدء الوردية يخلّي الكابتن يستقبل طلبات فعلاً. بعد
/// النجاح بيعمل invalidate للورديات ولـ [captainProvider] (الحالة اتغيّرت).
class _ShiftToggle extends ConsumerStatefulWidget {
  const _ShiftToggle({required this.activeShift});

  final ShiftView? activeShift;

  @override
  ConsumerState<_ShiftToggle> createState() => _ShiftToggleState();
}

class _ShiftToggleState extends ConsumerState<_ShiftToggle> {
  bool _busy = false;

  bool get _onShift => widget.activeShift != null;

  Future<void> _toggle() async {
    final ending = _onShift;
    setState(() => _busy = true);

    final repository = ref.read(captainRepositoryProvider);
    final status = ref.read(captainStatusProvider.notifier);

    try {
      if (ending) {
        await repository.endShift();
      } else {
        await repository.startShift();
      }
      // نزامن الحالة المحلية مع الـ REST: السوكيت + بث الموقع لازم يتفعّلوا/يتوقّفوا
      // عشان بدء الوردية يوصل عروض فعلاً، وإنهاؤها يوقّف البث.
      status.setOnline(!ending);

      if (!mounted) return;
      ref.invalidate(shiftsByRangeProvider);
      ref.invalidate(captainProvider);
      _snack(context, ending ? 'أنهيت ورديتك — بقيت غير متصل' : 'بدأت ورديتك — جاهز تستقبل طلبات');
    } on ApiException catch (e) {
      if (!mounted) return;
      _snack(context, e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: QButton(
        label: _onShift ? 'إنهاء الوردية' : 'بدء وردية',
        style: _onShift ? QButtonStyle.danger : QButtonStyle.brand,
        loading: _busy,
        onPressed: _toggle,
      ),
    );
  }
}

/// سجل الورديات — كارت واحد بصفوف مفصولة (زي قايمة الأسبوع).
class _ShiftHistory extends StatelessWidget {
  const _ShiftHistory({required this.shifts});

  final List<ShiftView> shifts;

  @override
  Widget build(BuildContext context) {
    return QCard(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Column(
        children: [
          for (var i = 0; i < shifts.length; i++) ...[
            if (i != 0) const Divider(color: QColors.line, height: 1),
            _ShiftRow(shift: shifts[i]),
          ],
        ],
      ),
    );
  }
}

class _ShiftRow extends StatelessWidget {
  const _ShiftRow({required this.shift});

  final ShiftView shift;

  /// «14:32» — الساعة والدقيقة بس.
  static String _hm(DateTime value) =>
      '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final start = shift.startedAt;
    final end = shift.endedAt;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // مدى الوقت — البداية «←» النهاية، أو «شغّالة دلوقتي» للمفتوحة.
                if (shift.isActive)
                  Row(
                    children: [
                      QLtr(
                        child: Text(
                          start == null ? '—' : _hm(start),
                          style: QText.num(size: 14, weight: FontWeight.w800, color: QColors.ink),
                        ),
                      ),
                      const SizedBox(width: 8),
                      const Text(
                        'شغّالة دلوقتي',
                        style: TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 11.5,
                          fontWeight: FontWeight.w800,
                          color: QColors.success,
                        ),
                      ),
                    ],
                  )
                else
                  QLtr(
                    child: Text(
                      '${start == null ? '—' : _hm(start)} ← ${end == null ? '—' : _hm(end)}',
                      style: QText.num(size: 14, weight: FontWeight.w800, color: QColors.ink),
                    ),
                  ),
                const SizedBox(height: 3),
                // المدة · عدد الرحلات.
                Text.rich(
                  TextSpan(
                    children: [
                      ..._durationSpans(shift.minutes, size: 12, color: QColors.faint),
                      const TextSpan(text: '  ·  '),
                      TextSpan(
                        text: fmt.ltr('${shift.tripCount}'),
                        style: QText.num(size: 12, weight: FontWeight.w700, color: QColors.faint),
                      ),
                      const TextSpan(text: ' رحلة'),
                    ],
                  ),
                  style: QText.tiny.copyWith(fontSize: 11.5, color: QColors.faint),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          QPrice(value: shift.earnings, size: 14),
        ],
      ),
    );
  }
}

/// أيام الأسبوع — الأسماء والأرقام كلها من السيرفر (مصفّرة ومترتبة من السبت).
class _WeekList extends StatelessWidget {
  const _WeekList({required this.weekAsync});

  final AsyncValue<EarningsSummary> weekAsync;

  @override
  Widget build(BuildContext context) {
    return weekAsync.when(
      loading: () => const QCard(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: QLoading(),
      ),
      error: (error, _) => QCard(
        child: Text(
          error is ApiException ? error.message : 'مش قادرين نجيب أيام الأسبوع',
          style: QText.bodyMuted,
        ),
      ),
      data: (summary) => QCard(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(
          children: [
            for (var i = 0; i < summary.dailySeries.length; i++) ...[
              if (i != 0) const Divider(color: QColors.line, height: 1),
              _DayRow(bar: summary.dailySeries[i]),
            ],
          ],
        ),
      ),
    );
  }
}

class _DayRow extends StatelessWidget {
  const _DayRow({required this.bar});

  final EarningsBar bar;

  @override
  Widget build(BuildContext context) {
    final idle = bar.trips == 0;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 12),
      child: Row(
        children: [
          Expanded(
            child: Text(
              bar.label,
              style: QText.body.copyWith(
                fontSize: 13.5,
                color: idle ? QColors.textMuted : QColors.ink,
              ),
            ),
          ),
          Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: fmt.ltr('${bar.trips}'),
                  style: QText.num(size: 12, weight: FontWeight.w700, color: QColors.faint),
                ),
                const TextSpan(text: ' رحلة'),
              ],
            ),
            style: QText.tiny.copyWith(fontSize: 11.5, color: QColors.faint),
          ),
          const SizedBox(width: 12),
          QPrice(
            value: bar.value,
            size: 14,
            color: idle ? QColors.faint : QColors.ink,
          ),
        ],
      ),
    );
  }
}

/// دقايق → «١س ٥٥د»: الأرقام Outfit (معزولة bidi) ووحدات «س/د» Cairo أصغر.
/// بيرجّع spans عشان نفس التنسيق يتحط في كارت كبير أو صف صغير.
List<InlineSpan> _durationSpans(int minutes, {double size = 15, Color color = QColors.ink}) {
  final hours = minutes ~/ 60;
  final mins = minutes % 60;

  final numStyle = QText.num(size: size, weight: FontWeight.w800, color: color);
  final unitStyle = TextStyle(
    fontFamily: 'Cairo',
    fontSize: size * 0.6,
    fontWeight: FontWeight.w800,
    color: color,
  );

  return [
    if (hours > 0) ...[
      TextSpan(text: fmt.ltr('$hours'), style: numStyle),
      TextSpan(text: mins > 0 ? 'س ' : 'س', style: unitStyle),
    ],
    // الدقايق تتعرض لو مافيش ساعات (يشمل الصفر) أو لو فيه باقي دقايق.
    if (hours == 0 || mins > 0) ...[
      TextSpan(text: fmt.ltr('$mins'), style: numStyle),
      TextSpan(text: 'د', style: unitStyle),
    ],
  ];
}

void _snack(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        backgroundColor: QColors.ink,
        behavior: SnackBarBehavior.floating,
        content: Text(
          message,
          style: QText.body.copyWith(fontSize: 14, color: QColors.brand),
        ),
      ),
    );
}
