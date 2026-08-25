// الأرباح والمحفظة — Dart عادي من غير freezed ولا codegen.
//
// ✅ **بقى فيه endpoint حقيقي للأرباح**: `GET /captains/me/earnings?range=…`
// بيرجّع المجموع وعدد الرحلات والمتوسط ومتسلسلة الأيام (مصفّرة ومترتبة من السبت،
// ومجموعها بيساوي `total` بالظبط) وتفصيل المصادر. [EarningsSummary.fromJson] هو
// المسار المعتمد دلوقتي.
//
// ⚠️ [EarningsSummary.fromDelivered] **لسه موجودة عن قصد** — مش كود ميّت:
//   • الرئيسية (`home_screen`) وسجل الرحلات (`my_trips_screen`) لسه بيستخدموا
//     `EarningsRepository.summary()` المحسوب على الجهاز، والشاشتين دول برّه نطاق
//     الربط ده. لو اتشالت الحسبة هيقعوا.
//   • وبتفضل fallback معقول لو نداء الأرباح رجع 403 (توكن من غير `captainId`).
// الفرق المهم: النسخة المحسوبة على الجهاز بتملى **التلات مجاميع** (اليوم/الأسبوع/
// الشهر) في نداء واحد، بينما نسخة الـ API بتملى **الفترة المطلوبة بس** — عشان كده
// [rangeTotal] و [rangeOrders] بيفضّلوا أرقام السيرفر لما تكون موجودة.
//
// اللي لسه **مالوش مصدر**:
//   • [onlineMinutes] — محتاج endpoints للورديات (لسه مش موجودة).
import '../core/enums.dart';
import '../core/format.dart';
import 'order.dart';

/// عمود واحد في مخطط الأسبوع.
typedef EarningsBar = ({String label, double value, int trips});

/// تفصيل مصادر الدخل.
class EarningsBreakdown {
  const EarningsBreakdown({required this.deliveryFees, this.tips, this.bonus});

  /// `breakdown.tripPayouts` — مجموع مستحقات الرحلات (٨ ر.س حد أدنى + ١.٥ لكل كم).
  final double deliveryFees;

  /// `breakdown.tips` — **رقم حقيقي دلوقتي**، بس هيفضل صفر لحد ما حاجة تكتب
  /// حركات من نوع `TIP` في المحفظة. صفر هنا معناه «مافيش إكراميات» مش «مش معروف».
  /// بيفضل null في النسخة المحسوبة على الجهاز بس (مافيش مصدر هناك).
  final double? tips;

  /// `breakdown.bonuses` — نفس كلام [tips] بالظبط.
  final double? bonus;

  /// المجموع المعروف بس — بيتجاهل الحقول الغايبة.
  double get total => deliveryFees + (tips ?? 0) + (bonus ?? 0);

  bool get hasTips => tips != null;
  bool get hasBonus => bonus != null;
}

class EarningsSummary {
  const EarningsSummary({
    required this.range,
    required this.todayTotal,
    required this.weekTotal,
    required this.monthTotal,
    required this.todayOrders,
    required this.weekOrders,
    required this.monthOrders,
    required this.dailySeries,
    required this.breakdown,
    this.withdrawableBalance,
    this.onlineMinutes,
    this.serverTotal,
    this.serverTripCount,
    this.serverAveragePerTrip,
    this.rangeFrom,
    this.rangeTo,
  });

  /// الفترة اللي الملخص ده بيوصفها.
  final EarningsRange range;

  /// المجاميع المحسوبة على الجهاز — بتتملى من [fromDelivered] بس، وبتفضل أصفار
  /// في نسخة الـ API لأن النداء بيرجّع فترة واحدة. اقرا [rangeTotal] بدلها.
  final double todayTotal;
  final double weekTotal;
  final double monthTotal;
  final int todayOrders;
  final int weekOrders;
  final int monthOrders;

  /// رصيد قابل للسحب — **مابقاش بيتقرا من هنا**. شاشة الأرباح بتاخده من
  /// `GET /captains/me/wallet` (`availableToWithdraw`) وهو الرقم الصح.
  /// سايبينه للنسخة المحسوبة على الجهاز بس.
  final double? withdrawableBalance;

  /// دقايق الأونلاين — **لسه null دايماً**، محتاجة endpoint للورديات.
  final int? onlineMinutes;

  // ── أرقام السيرفر للفترة المطلوبة (null في النسخة المحسوبة على الجهاز) ──

  final double? serverTotal;
  final int? serverTripCount;
  final double? serverAveragePerTrip;
  final DateTime? rangeFrom;
  final DateTime? rangeTo;

  /// أعمدة المخطط — من السبت للجمعة، مصفّرة من السيرفر.
  final List<EarningsBar> dailySeries;

  final EarningsBreakdown breakdown;

  // ── مساعدات للشاشات ──

  /// جاي من الـ API مش محسوب على الجهاز.
  bool get isFromServer => serverTotal != null;

  /// مجموع الفترة — رقم السيرفر لو موجود، وإلا المحسوب على الجهاز.
  double get rangeTotal =>
      serverTotal ??
      switch (range) {
        EarningsRange.today => todayTotal,
        EarningsRange.week => weekTotal,
        EarningsRange.month => monthTotal,
      };

  int get rangeOrders =>
      serverTripCount ??
      switch (range) {
        EarningsRange.today => todayOrders,
        EarningsRange.week => weekOrders,
        EarningsRange.month => monthOrders,
      };

  /// متوسط الرحلة في الفترة — السيرفر بيحسبه، وبنحسبه محلياً لو مش موجود.
  double get averagePerOrder =>
      serverAveragePerTrip ?? (rangeOrders == 0 ? 0 : rangeTotal / rangeOrders);

  /// أعلى عمود — لتطبيع ارتفاعات المخطط. بيرجع ١ لو كله أصفار عشان مانقسمش على صفر.
  double get maxDaily {
    final peak = dailySeries.fold<double>(0, (max, bar) => bar.value > max ? bar.value : max);
    return peak <= 0 ? 1 : peak;
  }

  bool get isEmpty => rangeOrders == 0;

  /// أسماء أيام الأسبوع بترتيب السبت → الجمعة.
  static const dayLabels = ['سبت', 'أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة'];

  /// ملخص فاضي — الحالة الابتدائية قبل ما البيانات توصل.
  factory EarningsSummary.empty([EarningsRange range = EarningsRange.today]) => EarningsSummary(
        range: range,
        todayTotal: 0,
        weekTotal: 0,
        monthTotal: 0,
        todayOrders: 0,
        weekOrders: 0,
        monthOrders: 0,
        dailySeries: [for (final label in dayLabels) (label: label, value: 0.0, trips: 0)],
        breakdown: const EarningsBreakdown(deliveryFees: 0),
      );

  /// رد `GET /captains/me/earnings?range=…` — المسار المعتمد.
  ///
  /// `dailySeries` بتيجي مصفّرة ومترتبة من السيرفر ومجموعها = `total`، فمابنلمسهاش
  /// ولا بنعيد ترتيبها. الأسماء العربية للأيام بتيجي جاهزة في `label`.
  factory EarningsSummary.fromJson(Map<String, dynamic> json, {required EarningsRange range}) {
    final window = (json['range'] as Map<String, dynamic>?) ?? const {};
    final breakdown = (json['breakdown'] as Map<String, dynamic>?) ?? const {};
    final total = asMoney(json['total']);
    final tripCount = asInt(json['tripCount']);

    return EarningsSummary(
      range: range,
      serverTotal: total,
      serverTripCount: tripCount,
      serverAveragePerTrip: asMoneyOrNull(json['averagePerTrip']),
      rangeFrom: asDate(window['from']),
      rangeTo: asDate(window['to']),
      // النداء بيرجّع فترة واحدة بس — بنملى المجموع بتاعها في خانتها وبس.
      todayTotal: range == EarningsRange.today ? total : 0,
      weekTotal: range == EarningsRange.week ? total : 0,
      monthTotal: range == EarningsRange.month ? total : 0,
      todayOrders: range == EarningsRange.today ? tripCount : 0,
      weekOrders: range == EarningsRange.week ? tripCount : 0,
      monthOrders: range == EarningsRange.month ? tripCount : 0,
      onlineMinutes: null,
      dailySeries: [
        for (final raw in (json['dailySeries'] as List<dynamic>? ?? const []))
          if (raw is Map<String, dynamic>)
            (
              label: asText(raw['label']),
              value: asMoney(raw['total']),
              trips: asInt(raw['trips']),
            ),
      ],
      breakdown: EarningsBreakdown(
        deliveryFees: asMoney(breakdown['tripPayouts']),
        // أرقام حقيقية دلوقتي — الصفر معناه «مافيش» مش «مش معروف».
        tips: asMoney(breakdown['tips']),
        bonus: asMoney(breakdown['bonuses']),
      ),
    );
  }

  /// بيحسب كل حاجة من الطلبات المسلّمة — **fallback** (شوف تعليق أول الملف).
  ///
  /// [trips] المفروض تكون كل الطلبات المسلّمة من بداية الشهر أو بداية الأسبوع
  /// (أيهما أسبق) لحد دلوقتي — الـ repository هو اللي بيجيبها.
  factory EarningsSummary.fromDelivered(
    List<CaptainTrip> trips, {
    EarningsRange range = EarningsRange.today,
    double? walletBalance,
    DateTime? now,
  }) {
    final today = startOfDay(now ?? DateTime.now());
    final weekStart = startOfWeek(today);
    final monthStart = DateTime(today.year, today.month);

    var todayTotal = 0.0, weekTotal = 0.0, monthTotal = 0.0;
    var todayOrders = 0, weekOrders = 0, monthOrders = 0;
    final buckets = List<double>.filled(7, 0);
    final bucketTrips = List<int>.filled(7, 0);

    for (final trip in trips) {
      if (!trip.isDelivered) continue;

      // وقت التسليم هو المرجع؛ لو ناقص بنرجع لوقت الطلب.
      final at = trip.deliveredAt ?? trip.placedAt;
      final day = startOfDay(at);
      final payout = trip.payout;

      if (!day.isBefore(monthStart)) {
        monthTotal += payout;
        monthOrders++;
      }
      if (!day.isBefore(weekStart)) {
        weekTotal += payout;
        weekOrders++;
        buckets[dayIndex(at)] += payout;
        bucketTrips[dayIndex(at)]++;
      }
      if (day == today) {
        todayTotal += payout;
        todayOrders++;
      }
    }

    return EarningsSummary(
      range: range,
      todayTotal: todayTotal,
      weekTotal: weekTotal,
      monthTotal: monthTotal,
      todayOrders: todayOrders,
      weekOrders: weekOrders,
      monthOrders: monthOrders,
      withdrawableBalance: walletBalance,
      onlineMinutes: null,
      dailySeries: [
        for (var i = 0; i < 7; i++) (label: dayLabels[i], value: buckets[i], trips: bucketTrips[i]),
      ],
      breakdown: EarningsBreakdown(
        deliveryFees: switch (range) {
          EarningsRange.today => todayTotal,
          EarningsRange.week => weekTotal,
          EarningsRange.month => monthTotal,
        },
      ),
    );
  }

  /// نص الليل بتاريخ معيّن.
  static DateTime startOfDay(DateTime value) => DateTime(value.year, value.month, value.day);

  /// السبت اللي قبل [value] (أو نفسه لو سبت) — بداية الأسبوع في السعودية.
  static DateTime startOfWeek(DateTime value) =>
      startOfDay(value).subtract(Duration(days: dayIndex(value)));

  /// ترتيب اليوم في أسبوع بيبدأ سبت: سبت=٠ … جمعة=٦.
  /// (DateTime.weekday: اتنين=١ … أحد=٧).
  static int dayIndex(DateTime value) => (value.weekday + 1) % 7;
}
