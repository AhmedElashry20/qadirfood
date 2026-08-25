// موديل تقرير المطعم — من GET /reports/merchant?range=today|week|month.
//
// ملاحظة على أسماء الحقول: الـ API بيسمّيها orderCount و avgOrderValue و salesByDay،
// والموديل هنا بيعيد تسميتها لأسماء الشاشة (ordersCount / avgBasket / dailySeries).
import '../core/format.dart';

/// عمود في رسم المبيعات — «الأحد» ← 1٬240 ريال.
typedef ReportBar = ({String label, double value});

/// صنف في «الأكثر مبيعاً».
typedef ReportTopItem = ({String name, int count});

class MerchantReport {
  const MerchantReport({
    required this.totalSales,
    required this.ordersCount,
    required this.avgBasket,
    required this.dailySeries,
    required this.topItems,
    this.rating,
    this.ratingCount,
    this.deltaPercent,
    this.rejectionRate = 0,
    this.cancellationRate = 0,
    this.netPayout = 0,
    this.commission = 0,
    this.settlementStatus = 'PENDING',
    this.from,
    this.to,
    this.salesByDate = const {},
  });

  /// إجمالي مبيعات الطلبات المسلَّمة في الفترة.
  final double totalSales;

  /// `orderCount` في الـ API — عدد الطلبات المسلَّمة.
  final int ordersCount;

  /// `avgOrderValue` في الـ API — متوسط قيمة الطلب.
  final double avgBasket;

  /// المبيعات باليوم زي ما رجعت من السيرفر (أيام من غير طلبات مش بترجع أصلاً).
  final List<ReportBar> dailySeries;

  final List<ReportTopItem> topItems;

  /// تقييم الفرع وعدد المقيّمين — مش موجودين في رد /reports/merchant،
  /// فبيفضلوا null. الشاشة بتجيبهم من الفرع (GET /restaurants/branches/:id).
  final double? rating;
  final int? ratingCount;

  /// نسبة التغيّر عن الفترة اللي فاتت — الـ API مابيحسبهاش، فبتفضل null
  /// لحد ما يتضاف endpoint للمقارنة.
  final double? deltaPercent;

  /// نسب الرفض والإلغاء % — موجودة فعلاً في الرد.
  final double rejectionRate;
  final double cancellationRate;

  /// التسوية المالية — صافي المستحق وعمولة المنصة.
  final double netPayout;
  final double commission;
  final String settlementStatus;

  final DateTime? from;
  final DateTime? to;

  /// المبيعات مفهرسة بـ "YYYY-MM-DD" — بيستعملها [weekSeries] في الملء.
  final Map<String, double> salesByDate;

  static const _shortDays = <String>['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

  /// سبعة أعمدة بالظبط منتهية بالنهارده — الأيام اللي مافيهاش مبيعات بتتحط بصفر،
  /// لأن الـ API بيعمل GROUP BY فبيرجّع الأيام اللي فيها طلبات مسلَّمة بس.
  List<ReportBar> get weekSeries {
    final today = DateTime.now();
    final bars = <ReportBar>[];
    for (var back = 6; back >= 0; back--) {
      final day = DateTime(today.year, today.month, today.day - back);
      bars.add((label: _shortDays[day.weekday % 7], value: salesByDate[_key(day)] ?? 0.0));
    }
    return bars;
  }

  static String _key(DateTime day) => '${day.year.toString().padLeft(4, '0')}-'
      '${day.month.toString().padLeft(2, '0')}-'
      '${day.day.toString().padLeft(2, '0')}';

  /// اسم اليوم العربي المختصر من "YYYY-MM-DD" — بيرجّع النص الخام لو التاريخ تالف.
  static String _labelOf(String date) {
    final parsed = DateTime.tryParse(date);
    return parsed == null ? date : _shortDays[parsed.weekday % 7];
  }

  factory MerchantReport.fromJson(Map<String, dynamic> json) {
    final range = (json['range'] as Map<String, dynamic>?) ?? const {};
    final settlement = (json['settlement'] as Map<String, dynamic>?) ?? const {};
    final byDay = (json['salesByDay'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .toList();

    return MerchantReport(
      totalSales: asMoney(json['totalSales']),
      ordersCount: asInt(json['orderCount']),
      avgBasket: asMoney(json['avgOrderValue']),
      dailySeries: [
        for (final day in byDay)
          (label: _labelOf(asText(day['date'])), value: asMoney(day['sales'])),
      ],
      salesByDate: {
        for (final day in byDay) asText(day['date']): asMoney(day['sales']),
      },
      topItems: [
        for (final raw
            in (json['topItems'] as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>())
          (name: asText(raw['nameAr']), count: asInt(raw['count'])),
      ],
      rejectionRate: asMoney(json['rejectionRate']),
      cancellationRate: asMoney(json['cancellationRate']),
      netPayout: asMoney(settlement['netPayout']),
      commission: asMoney(settlement['commission']),
      settlementStatus: asText(settlement['status'], 'PENDING'),
      from: asDate(range['from']),
      to: asDate(range['to']),
    );
  }
}
