// حالة الفرع (فتح/مشغول/إيقاف مؤقت/إغلاق) + أوقات العمل + مستخدمو الفرع
// + إعداد صوت التنبيه المحلي.
//
// ملاحظات على الـ API (مهمة عشان تفهم قرارات الملف ده):
//  • مافيش endpoint «فرعي أنا» بيرجّع الفرع كامل. المسارات /restaurants/branch/*
//    محصورة بالتوكن (مش محتاجة id)، لكن GET /restaurants/branches/:id محتاج id صريح.
//    فبنقرا الـ branchId من payload الـ JWT لحد ما auth_provider يحفظه بعد الدخول.
//  • PATCH /restaurants/branch/status بيرجّع صف الفرع بس — من غير المطعم ولا
//    أوقات العمل ولا الإحداثيات — فبنحدّث الحالة بس ونمسك على النسخة الكاملة.
//  • مافيش حقل لمدة «الإيقاف المؤقت» في الـ API، فالفتح التلقائي كله محلي.
import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api_client.dart';
import '../core/enums.dart';
import '../data/merchant_repository.dart';
import '../models/branch.dart';

// ─────────────────────────── معرّف الفرع ───────────────────────────

/// معرّف الفرع من داخل التوكن — بيرجّع null لو التوكن مش مربوط بفرع
/// (حساب أدمن مثلاً) أو الـ payload مش مفهوم.
final branchIdProvider = Provider<String?>((ref) {
  return _branchIdFromJwt(ref.watch(tokenStoreProvider).accessToken);
});

/// بيفك الجزء الأوسط من الـ JWT (base64url) وبيدوّر على branchId.
/// أي فشل بيرجّع null — مابنرميش استثناء من بروڤايدر تركيبي.
String? _branchIdFromJwt(String? token) {
  if (token == null || token.isEmpty) return null;
  final parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    final payload = utf8.decode(base64Url.decode(base64Url.normalize(parts[1])));
    final decoded = jsonDecode(payload);
    if (decoded is! Map<String, dynamic>) return null;
    final id = decoded['branchId'] ?? decoded['branch_id'];
    return id is String && id.isNotEmpty ? id : null;
  } catch (_) {
    return null;
  }
}

// ─────────────────────────── الفرع الحالي ───────────────────────────

final branchProvider = AsyncNotifierProvider<BranchNotifier, Branch>(BranchNotifier.new);

class BranchNotifier extends AsyncNotifier<Branch> {
  /// مؤقّت الفتح التلقائي بعد «إيقاف مؤقت» — محلي بالكامل.
  Timer? _resumeTimer;

  @override
  Future<Branch> build() async {
    ref.onDispose(() => _resumeTimer?.cancel());
    return _load();
  }

  Future<Branch> _load() {
    final id = ref.read(branchIdProvider);
    if (id == null || id.isEmpty) {
      throw ApiException('تعذّر تحديد الفرع من الجلسة — سجّل الدخول من جديد');
    }
    return ref.read(branchRepositoryProvider).current(id);
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(_load);
  }

  /// تحديث متفائل: بنغيّر الحالة في الواجهة فوراً وبنرجّعها لو السيرفر رفض.
  Future<void> setStatus(BranchStatus status, {int? busyExtraMinutes}) async {
    final previous = state.valueOrNull;

    if (previous != null) {
      state = AsyncData(
        previous.copyWith(status: status, busyExtraMinutes: busyExtraMinutes),
      );
    }

    try {
      final updated = await ref
          .read(branchRepositoryProvider)
          .setStatus(status, busyExtraMinutes: busyExtraMinutes);

      // الرد ناقص (مافيهوش المطعم ولا الأوقات) — فبناخد منه الحالة بس.
      state = AsyncData(
        previous == null
            ? updated
            : previous.copyWith(
                status: updated.status,
                busyExtraMinutes: updated.busyExtraMinutes,
              ),
      );

      ref.read(lastStatusChangeProvider.notifier).markNow();

      // أي حالة غير «إيقاف مؤقت» بتلغي عدّاد الفتح التلقائي.
      if (status != BranchStatus.paused) clearPause();
    } on ApiException {
      if (previous != null) state = AsyncData(previous);
      rethrow;
    }
  }

  /// «إيقاف مؤقت» لمدة محددة ثم فتح تلقائي.
  ///
  /// الـ API مافيهوش حقل لمدة الإيقاف، فالعدّاد ده محلي بالكامل ومش هيعيش
  /// بعد إعادة تشغيل التطبيق — الفرع هيفضل PAUSED لحد ما حد يفتحه يدوي.
  Future<void> pauseFor(Duration duration) async {
    await setStatus(BranchStatus.paused);

    _resumeTimer?.cancel();
    ref.read(pauseDeadlineProvider.notifier).setDeadline(DateTime.now().add(duration));

    _resumeTimer = Timer(duration, () async {
      try {
        await setStatus(BranchStatus.open);
      } on ApiException {
        // فشل الفتح التلقائي — بنسيب الحالة زي ما هي والمستخدم يفتح يدوي.
        clearPause();
      }
    });
  }

  /// إلغاء عدّاد الفتح التلقائي (من غير نداء شبكة).
  void clearPause() {
    _resumeTimer?.cancel();
    _resumeTimer = null;
    ref.read(pauseDeadlineProvider.notifier).setDeadline(null);
  }
}

/// وقت انتهاء «الإيقاف المؤقت» — null يعني مافيش إيقاف شغّال.
final pauseDeadlineProvider =
    NotifierProvider<PauseDeadlineNotifier, DateTime?>(PauseDeadlineNotifier.new);

class PauseDeadlineNotifier extends Notifier<DateTime?> {
  @override
  DateTime? build() => null;

  void setDeadline(DateTime? value) => state = value;
}

/// آخر مرة اتغيّرت فيها حالة الفرع — الـ API مابيرجعش حقل تدقيق مع الرد،
/// فبنسجّل الوقت المحلي لآخر تغيير ناجح من التطبيق نفسه.
final lastStatusChangeProvider =
    NotifierProvider<LastStatusChangeNotifier, DateTime?>(LastStatusChangeNotifier.new);

class LastStatusChangeNotifier extends Notifier<DateTime?> {
  @override
  DateTime? build() => null;

  void markNow() => state = DateTime.now();
}

// ─────────────────────────── أوقات العمل ───────────────────────────

final workingHoursProvider =
    AsyncNotifierProvider<WorkingHoursNotifier, List<WorkingHour>>(WorkingHoursNotifier.new);

class WorkingHoursNotifier extends AsyncNotifier<List<WorkingHour>> {
  /// الفترات الإضافية لنفس اليوم (صباحي + مسائي). التصميم بيعرض صف واحد لكل
  /// يوم، فبنعدّل الفترة الأولى بس وبنرجّع الباقي زي ما هو وقت الحفظ عشان
  /// ما نمسحش بيانات المستخدم من غير ما يطلب.
  List<WorkingHour> _extraPeriods = const [];

  @override
  Future<List<WorkingHour>> build() => _load();

  Future<List<WorkingHour>> _load() async {
    final saved = await ref.read(branchRepositoryProvider).workingHours();
    return _normalize(saved);
  }

  /// سبعة صفوف بالظبط (٠ الأحد … ٦ السبت) — الأيام الناقصة بتتحط «مغلق».
  List<WorkingHour> _normalize(List<WorkingHour> saved) {
    final extras = <WorkingHour>[];
    final byDay = <int, WorkingHour>{};

    for (final hour in saved) {
      if (hour.weekday < 0 || hour.weekday > 6) continue;
      if (byDay.containsKey(hour.weekday)) {
        extras.add(hour);
      } else {
        byDay[hour.weekday] = hour;
      }
    }
    _extraPeriods = extras;

    return [
      for (var day = 0; day < 7; day++)
        byDay[day] ??
            WorkingHour(weekday: day, opensAt: '09:00', closesAt: '23:00', isClosed: true),
    ];
  }

  void _replace(int weekday, WorkingHour Function(WorkingHour) update) {
    final current = state.valueOrNull;
    if (current == null) return;
    state = AsyncData([
      for (final hour in current) hour.weekday == weekday ? update(hour) : hour,
    ]);
  }

  /// فتح/إغلاق اليوم — محلي لحد ما المستخدم يضغط «حفظ الأوقات».
  void toggleDay(int weekday) =>
      _replace(weekday, (hour) => hour.copyWith(isClosed: !hour.isClosed));

  /// وقت الإغلاق بعد منتصف الليل (2:00 صباحاً) شرعي — مابنصلّحوش.
  void setHours(int weekday, String opensAt, String closesAt) => _replace(
        weekday,
        (hour) => hour.copyWith(opensAt: opensAt, closesAt: closesAt, isClosed: false),
      );

  /// PATCH بيستبدل الجدول كله، فبنبعت السبع صفوف + الفترات الإضافية للأيام
  /// اللي لسه مفتوحة (اليوم المقفول مالوش فترة تانية).
  Future<void> save(List<WorkingHour> hours) async {
    final openDays = {for (final hour in hours) hour.weekday: !hour.isClosed};
    final payload = <WorkingHour>[
      ...hours,
      for (final extra in _extraPeriods)
        if (openDays[extra.weekday] ?? false) extra,
    ];

    final saved = await ref.read(branchRepositoryProvider).saveWorkingHours(payload);
    state = AsyncData(_normalize(saved));
  }

  Future<void> refresh() async {
    state = await AsyncValue.guard(_load);
  }
}

// ─────────────────────────── مستخدمو الفرع ───────────────────────────

final branchUsersProvider = FutureProvider<List<BranchUser>>(
  (ref) => ref.watch(branchRepositoryProvider).users(),
);

// ─────────────────────────── إعدادات محلية ───────────────────────────

/// صوت تنبيه الطلبات الواردة — محلي بالكامل (مافيش تفضيلات مستخدم في الـ API)،
/// وشاشة الطلبات بتقراه عشان تقرر تشغّل الجرس ولا لأ.
final alertSoundEnabledProvider =
    NotifierProvider<AlertSoundNotifier, bool>(AlertSoundNotifier.new);

class AlertSoundNotifier extends Notifier<bool> {
  @override
  bool build() => true;

  void toggle() => state = !state;

  void setEnabled(bool value) => state = value;
}
