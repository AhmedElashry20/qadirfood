// الورديات — Dart عادي من غير freezed ولا codegen.
//
// ✅ **بقى فيه دورة حياة كاملة للوردية** في موديول الكابتن:
//   • GET  /captains/me/shifts?range=today|week|month → [ShiftsSummary]
//   • POST /captains/me/shifts/start                  → [ShiftView] (بيفتح وردية)
//   • POST /captains/me/shifts/end                    → [ShiftView]‏|null (بيقفلها)
//
// `onlineMinutes` بيعدّ الوردية المفتوحة لحد دلوقتي، فمابنحسبش أي وقت على الجهاز —
// السيرفر هو المرجع. ده اللي بيملى «ساعات الاتصال» اللي كانت «—» زمان.
import '../core/enums.dart';
import '../core/format.dart';

/// وردية واحدة — صف من `shifts[]` أو رد بدء/إنهاء الوردية.
class ShiftView {
  const ShiftView({
    required this.id,
    required this.isActive,
    required this.minutes,
    required this.tripCount,
    required this.earnings,
    this.startedAt,
    this.endedAt,
  });

  final String id;

  final DateTime? startedAt;

  /// `null` طول ما الوردية شغّالة.
  final DateTime? endedAt;

  /// الوردية دي هي المفتوحة دلوقتي؟
  final bool isActive;

  /// طول الوردية بالدقايق — للوردية المفتوحة بيعدّ لحد دلوقتي.
  final int minutes;
  final int tripCount;
  final double earnings;

  factory ShiftView.fromJson(Map<String, dynamic> json) => ShiftView(
        id: asText(json['id']),
        startedAt: asDate(json['startedAt']),
        endedAt: asDate(json['endedAt']),
        isActive: json['isActive'] == true,
        minutes: asInt(json['minutes']),
        tripCount: asInt(json['tripCount']),
        earnings: asMoney(json['earnings']),
      );
}

/// رد `GET /captains/me/shifts?range=…` — مجاميع الفترة + الوردية المفتوحة + السجل.
class ShiftsSummary {
  const ShiftsSummary({
    required this.range,
    required this.onlineMinutes,
    required this.trips,
    required this.earnings,
    required this.shifts,
    this.activeShift,
    this.rangeFrom,
    this.rangeTo,
  });

  /// الفترة اللي الملخص ده بيوصفها.
  final EarningsRange range;

  /// مجموع دقايق الاتصال في الفترة — الوردية المفتوحة بتتحسب لحد دلوقتي.
  final int onlineMinutes;
  final int trips;
  final double earnings;

  /// الوردية المفتوحة دلوقتي — `null` لو الكابتن مش على وردية.
  final ShiftView? activeShift;

  /// سجل ورديات الفترة، الأحدث الأول (زي ما السيرفر بيرتّبها).
  final List<ShiftView> shifts;

  final DateTime? rangeFrom;
  final DateTime? rangeTo;

  /// الكابتن على وردية مفتوحة دلوقتي؟ — مصدر حالة زرار البدء/الإنهاء.
  bool get isOnShift => activeShift != null;

  bool get isEmpty => shifts.isEmpty;

  factory ShiftsSummary.fromJson(Map<String, dynamic> json, {required EarningsRange range}) {
    final window = (json['range'] as Map<String, dynamic>?) ?? const {};
    final active = json['activeShift'];

    return ShiftsSummary(
      range: range,
      onlineMinutes: asInt(json['onlineMinutes']),
      trips: asInt(json['trips']),
      earnings: asMoney(json['earnings']),
      activeShift: active is Map<String, dynamic> ? ShiftView.fromJson(active) : null,
      shifts: [
        for (final raw in (json['shifts'] as List<dynamic>? ?? const []))
          if (raw is Map<String, dynamic>) ShiftView.fromJson(raw),
      ],
      rangeFrom: asDate(window['from']),
      rangeTo: asDate(window['to']),
    );
  }
}
