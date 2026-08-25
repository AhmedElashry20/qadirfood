// شاشة ١٠: أوقات العمل — صف لكل يوم (الأحد … السبت) + سويتش إجازة،
// وضغطة على الساعات بتفتح منتقي وقت الفتح ثم الإغلاق.
//
// التعديل كله محلي لحد ما المستخدم يضغط «حفظ الأوقات» — الـ PATCH بيستبدل
// الجدول كله مرة واحدة (بروڤايدر أوقات العمل بيتولّى تجميع الفترات).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../../models/branch.dart';
import '../../providers/branch_status_provider.dart';
import '../../widgets/common.dart';

class WorkingHoursScreen extends ConsumerStatefulWidget {
  const WorkingHoursScreen({super.key});

  @override
  ConsumerState<WorkingHoursScreen> createState() => _WorkingHoursScreenState();
}

class _WorkingHoursScreenState extends ConsumerState<WorkingHoursScreen> {
  bool _saving = false;

  /// «إغلاق تلقائي أثناء الصلاة» — محلي بالكامل، مافيش حقل ليه في الـ API
  /// ولا مصدر لمواقيت الصلاة لسه.
  bool _prayerAutoClose = false;

  void _snack(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        backgroundColor: QColors.ink,
        content: Text(message, style: QText.body.copyWith(color: QColors.brand, fontSize: 14)),
      ),
    );
  }

  /// منتقي وقت الفتح ثم الإغلاق — الإغلاق بعد منتصف الليل (2:00 ص) مقبول
  /// ومابنصحّحوش، لأن ده حال أغلب المطاعم.
  Future<void> _editHours(WorkingHour hour) async {
    final opensAt = await showTimePicker(
      context: context,
      initialTime: _parse(hour.opensAt, const TimeOfDay(hour: 9, minute: 0)),
      helpText: 'وقت الفتح — ${hour.arabicName}',
    );
    if (opensAt == null || !mounted) return;

    final closesAt = await showTimePicker(
      context: context,
      initialTime: _parse(hour.closesAt, const TimeOfDay(hour: 23, minute: 0)),
      helpText: 'وقت الإغلاق — ${hour.arabicName}',
    );
    if (closesAt == null || !mounted) return;

    ref.read(workingHoursProvider.notifier).setHours(hour.weekday, _wire(opensAt), _wire(closesAt));
  }

  Future<void> _save(List<WorkingHour> hours) async {
    setState(() => _saving = true);
    try {
      await ref.read(workingHoursProvider.notifier).save(hours);
      if (!mounted) return;
      _snack('تم حفظ الأوقات');
      await Navigator.of(context).maybePop();
    } on ApiException catch (e) {
      if (!mounted) return;
      _snack(e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final hours = ref.watch(workingHoursProvider);

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: const QHeader(title: 'أوقات العمل'),
      body: hours.when(
        loading: () => const QLoading(),
        error: (error, _) => QErrorView(
          message: error is ApiException ? error.message : 'تعذّر تحميل أوقات العمل',
          onRetry: () => ref.read(workingHoursProvider.notifier).refresh(),
        ),
        data: _list,
      ),
      bottomNavigationBar: hours.hasValue
          ? QBottomBar(
              child: QButton(
                label: 'حفظ الأوقات',
                loading: _saving,
                onPressed: () => _save(hours.requireValue),
              ),
            )
          : null,
    );
  }

  Widget _list(List<WorkingHour> hours) {
    // DateTime.weekday بيبدأ من الإثنين=١ لحد الأحد=٧، والجدول عندنا الأحد=٠.
    final today = DateTime.now().weekday % 7;

    return ListView(
      padding: const EdgeInsets.fromLTRB(QSpace.screenH, 16, QSpace.screenH, 24),
      children: [
        for (final hour in hours) ...[
          _DayRow(
            hour: hour,
            isToday: hour.weekday == today,
            onToggle: () => ref.read(workingHoursProvider.notifier).toggleDay(hour.weekday),
            onEditHours: () => _editHours(hour),
          ),
          const SizedBox(height: 10),
        ],
        const SizedBox(height: 8),
        _ramadanCard(),
        const SizedBox(height: 10),
        _prayerCard(),
      ],
    );
  }

  /// جدول رمضان: الموديل فيه علم isRamadan بس مافيش محرّر منفصل في الـ API لسه.
  Widget _ramadanCard() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: QColors.tint,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          const Expanded(
            child: Text(
              '🌙 مواعيد رمضان — جدول منفصل يتفعل تلقائياً',
              style: TextStyle(
                fontFamily: 'Cairo',
                fontSize: 13.5,
                fontWeight: FontWeight.w700,
                color: QColors.ink,
              ),
            ),
          ),
          InkWell(
            onTap: () => _snack('جدول رمضان قريباً'),
            borderRadius: BorderRadius.circular(QRadius.sm),
            child: const Padding(
              padding: EdgeInsets.symmetric(horizontal: 6, vertical: 4),
              child: Text(
                'تعديل ›',
                style: TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: QColors.gold,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _prayerCard() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: QColors.tint,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  '🕌 إغلاق تلقائي أثناء أوقات الصلاة',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 13.5,
                    fontWeight: FontWeight.w700,
                    color: QColors.ink,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  '(محلي — محتاج ربط مواقيت الصلاة)',
                  style: QText.tiny.copyWith(color: QColors.faint, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          QSwitch(
            value: _prayerAutoClose,
            onChanged: (value) => setState(() => _prayerAutoClose = value),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────── صف اليوم ───────────────────────────

class _DayRow extends StatelessWidget {
  const _DayRow({
    required this.hour,
    required this.isToday,
    required this.onToggle,
    required this.onEditHours,
  });

  final WorkingHour hour;
  final bool isToday;
  final VoidCallback onToggle;
  final VoidCallback onEditHours;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
      decoration: BoxDecoration(
        color: QColors.surface,
        borderRadius: BorderRadius.circular(15),
        border: isToday ? Border.all(color: QColors.brand, width: 2) : null,
        boxShadow: kCardShadow,
      ),
      child: Row(
        children: [
          SizedBox(
            width: 96,
            child: Row(
              children: [
                Flexible(
                  child: Text(
                    hour.arabicName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontFamily: 'Cairo',
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: QColors.ink,
                    ),
                  ),
                ),
                if (isToday) ...[
                  const SizedBox(width: 6),
                  const QBadge(label: 'اليوم'),
                ],
              ],
            ),
          ),
          Expanded(
            child: InkWell(
              onTap: hour.isClosed ? null : onEditHours,
              borderRadius: BorderRadius.circular(QRadius.sm),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: hour.isClosed
                    ? Text(
                        'مغلق',
                        textAlign: TextAlign.center,
                        style: QText.body.copyWith(color: QColors.hint, fontSize: 13.5),
                      )
                    : QLtr(
                        child: Text(
                          '${_to12h(hour.opensAt)} — ${_to12h(hour.closesAt)}',
                          textAlign: TextAlign.center,
                          style: QText.num(size: 13.5, weight: FontWeight.w700),
                        ),
                      ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          QSwitch(value: !hour.isClosed, onChanged: (_) => onToggle()),
        ],
      ),
    );
  }
}

// ─────────────────────────── تحويل الأوقات ───────────────────────────

/// "23:30" → "11:30 PM" — بيرجّع النص زي ما هو لو مش بالشكل المتوقع.
String _to12h(String hhmm) {
  final parts = hhmm.split(':');
  if (parts.length < 2) return hhmm;
  final hour = int.tryParse(parts[0]);
  if (hour == null) return hhmm;
  final period = hour < 12 ? 'AM' : 'PM';
  final display = hour % 12 == 0 ? 12 : hour % 12;
  return '$display:${parts[1]} $period';
}

/// "HH:mm" → TimeOfDay (بالقيمة الافتراضية لو النص تالف).
TimeOfDay _parse(String hhmm, TimeOfDay fallback) {
  final parts = hhmm.split(':');
  if (parts.length < 2) return fallback;
  final hour = int.tryParse(parts[0]);
  final minute = int.tryParse(parts[1]);
  if (hour == null || minute == null || hour > 23 || minute > 59) return fallback;
  return TimeOfDay(hour: hour, minute: minute);
}

/// TimeOfDay → "HH:mm" ٢٤ ساعة، وهو الشكل المتخزّن في السيرفر.
String _wire(TimeOfDay time) =>
    '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';
