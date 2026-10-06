// طبقة رقيقة فوق ApiClient — بترجّع موديلات التطبيق جاهزة للبروڤايدرز.
// كل الأخطاء بتطلع منها كـ ApiException برسالتها العربية من السيرفر زي ما هي.
//
// ══════════════════════════════════════════════════════════════════════════
//              إيه اللي **بقى موجود** وإيه اللي **لسه ناقص**
// ══════════════════════════════════════════════════════════════════════════
// ✅ اتعمل موديول كامل للكابتن (`/api/captains/me`) + مسار رفع ملفات (`/api/uploads`).
//    كل مسارات `captains/me` بترمي 403 برسالة «الجلسة مش مربوطة بحساب كابتن» لو
//    التوكن مالوش `captainId` — شوف التحذير تحت.
//
//  ١) ✅ **بيانات الكابتن** — `GET /captains/me` و `PATCH /captains/me`
//     (نوع المركبة، اللوحة، الصورة). [CaptainRepository.me] بيستخدمه دلوقتي،
//     والتركيب من صف `captain` المرفق مع الطلب بقى fallback للـ 403 بس.
//  ٢) ✅ **الوثائق** — `GET/POST /captains/me/documents` بترجّع **خمس صفوف دايماً**
//     بحالات MISSING/PENDING/APPROVED/REJECTED/EXPIRED مع سبب الرفض وتاريخ الانتهاء.
//     الرفع بيتم على مرحلتين: `POST /uploads` بيرجّع رابط، وبعدين الرابط بيتسجّل.
//  ٣) ✅ **الأرباح** — `GET /captains/me/earnings?range=today|week|month` بمتسلسلة
//     أيام مصفّرة وتفصيل مصادر (أجرة/إكرامية/مكافأة).
//  ٤) ✅ **المحفظة والسحب** — رصيد، كشف حساب مرقّم، طلبات سحب، وحسابات استلام.
//  ٥) ✅ **رفع الملفات** — `POST /uploads` (٨ ميجا حد أقصى، jpg/png/webp/pdf).
//
// ❌ اللي **لسه مالوش باك إند**:
//  ١) **نسبة قبول العروض** — السيرفر بيرجّع `acceptanceRate: null` دايماً لأن مافيش
//     جدول بيسجّل رد الكابتن على العرض (قبول/رفض/انتهاء مهلة). مانعرضهاش خالص.
//  ٢) **المستوى/التصنيف (tier)** — مالوش وجود في الداتابيز خالص.
//  ٣) **الورديات (Shifts)** — جدول `shifts` بيتحدّث من السيرفر عند التسليم بس؛
//     مافيش بدء/إنهاء وردية ولا قراءة لها. «ساعات الأونلاين» بتفضل «—».
//  ٤) **الإكراميات والمكافآت** — الحقول بقت موجودة في تفصيل الأرباح وبترجع أرقام
//     حقيقية، بس **هتفضل صفر** لحد ما حاجة تكتب حركات `TIP` / `BONUS` في المحفظة.
//  ٥) **تقييم الكابتن للعميل** — مافيش مسار يكتبه.
//  ٦) **الدعم والتذاكر** — مافيش أي مسار للدعم ولا شات ولا شكاوى.
//  ٧) **التحقق بالوجه** — عمود `faceVerifiedAt` موجود، ومافيش أي مسار بيكتب فيه.
//  ٨) **إثبات التسليم (OTP/صورة)** — PATCH /delivered مابياخدش body أصلاً.
//  ٩) **تحديث حالة أونلاين/أوفلاين** — عبر السوكيت بس (`captain:status_update`)،
//     مافيش REST مقابل. (`GET /captains/me` بيرجّع `status` للقراءة بس.)
// ١٠) **العروض المعلّقة** — عرض الرحلة بيوصل عبر السوكيت بس؛ لو التطبيق كان
//     مقفول العرض بيضيع، ومافيش endpoint يجيب العروض المفتوحة.
//
// ⚠️ ملاحظتين على سلوك السيرفر لازم تتعرفوا:
//  • POST /auth/otp/verify بـ role=CAPTAIN بيعمل صف `users` بس — **مش بيعمل صف
//    `captains`** (العمود `nationalId` إلزامي وفريد فماينفعش ينعمل فاضي). يعني
//    التوكن بيطلع من غير `captainId`، وساعتها GET /orders **مابيتفلترش** ويرجّع
//    طلبات مش بتاعة الكابتن، وأي PATCH بيرجع 403. الكابتن لازم يكون متعمول له صف
//    في الداتابيز (seed أو أدمن) عشان التطبيق يشتغل صح.
//  • رد /auth/otp/verify بيرجّع `branchId` مش `captainId` — فـ [CaptainSession.captainId]
//    بيفضل null غالباً.
//  • ردود PATCH (pickup / on-the-way / delivered) صفوف Prisma خام: المبالغ نصوص
//    ومافيش lat/lng. الموديلات بتتحمّل ده، بس الخريطة بتفضّل نسخة الـ GET.
//  • `order:status_changed` بيتبعت لغرف العميل والفرع والأدمن — **مش لغرفة الكابتن**.
//    لو الشاشة عايزة تتابع تغيّر الحالة لازم تعمل join لغرفة `order:{id}`.
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api_client.dart';
import '../core/enums.dart';
import '../core/format.dart';
import '../models/order_chat.dart';
import '../models/captain.dart';
import '../models/distributions.dart';
import '../models/earnings.dart';
import '../models/face_check.dart';
import '../models/order.dart';
import '../models/shift.dart';
import '../models/wallet.dart';

// ─────────────────────────── أنواع مساعدة ───────────────────────────

/// جلسة الكابتن بعد التحقق من الـ OTP.
class CaptainSession {
  const CaptainSession({
    required this.accessToken,
    required this.refreshToken,
    required this.userId,
    required this.fullName,
    required this.phone,
    this.email,
    this.avatarUrl,
    this.captainId,
    this.user = const <String, dynamic>{},
  });

  final String accessToken;
  final String refreshToken;
  final String userId;
  final String fullName;
  final String phone;
  final String? email;
  final String? avatarUrl;

  /// معرّف صف الكابتن — **الرد الحالي مابيرجّعوش** (بيرجّع `branchId` بس)، فبيفضل
  /// null. سايبينه في الموديل عشان لو الباك إند ضافه ما نلمسش الشاشات.
  final String? captainId;

  /// الـ `user` object الخام — بيتمرّر لـ [Captain.fromUser] لما مايكونش في طلبات.
  final Map<String, dynamic> user;

  factory CaptainSession.fromJson(Map<String, dynamic> json) {
    final user = (json['user'] as Map<String, dynamic>?) ?? const {};
    return CaptainSession(
      accessToken: asText(json['accessToken']),
      refreshToken: asText(json['refreshToken']),
      userId: asText(user['id']),
      fullName: asText(user['fullName']),
      phone: asText(user['phone']),
      email: user['email'] as String?,
      avatarUrl: user['avatarUrl'] as String?,
      captainId: json['captainId'] as String?,
      user: user,
    );
  }
}

/// نتيجة طلب الرمز — `devCode` بيرجع في بيئة التطوير بس (السيرفر مش بيبعت SMS لسه).
typedef OtpRequest = ({int expiresInSeconds, String? devCode});

/// صفحة من سجل الرحلات (GET /orders).
typedef TripsPage = ({
  List<CaptainTrip> trips,
  int total,
  int page,
  int pageSize,
});

/// حالات الرحلة الجارية — نفس تعريف `OrderStatus.isActiveTrip`.
const _activeStatuses = [
  OrderStatus.captainAssigned,
  OrderStatus.pickedUp,
  OrderStatus.onTheWay,
];

// ─────────────────────────── الدخول ───────────────────────────

class AuthRepository {
  const AuthRepository(this._api);

  final ApiClient _api;

  /// POST /auth/otp/request — الرمز صالح ٥ دقايق.
  /// في التطوير السيرفر بيرجّع الرمز نفسه في `devCode` عشان مافيش SMS متوصّل.
  Future<OtpRequest> requestOtp(String phone) async {
    final res = await _api.post<Map<String, dynamic>>(
      '/auth/otp/request',
      body: {'phone': phone},
    );

    return (
      expiresInSeconds: asInt(res['expiresInSeconds'], 300),
      devCode: res['devCode'] as String?,
    );
  }

  /// POST /auth/otp/verify — [fullName] إلزامي في أول دخول بس (السيرفر بيرمي
  /// «الاسم مطلوب للتسجيل لأول مرة» لو المستخدم جديد ومافيش اسم).
  /// التوكن بيتحفظ في TokenStore هنا علطول لما التحقق ينجح.
  /// [nationalId] إلزامي لتسجيل كابتن جديد — السيرفر بيرفض من غيره بـ 400
  /// «رقم الهوية مطلوب لتسجيل كابتن جديد» لأن سجل الكابتن مايتعملش بدونه.
  Future<CaptainSession> verifyOtp({
    required String phone,
    required String code,
    String? fullName,
    String? nationalId,
  }) async {
    final res = await _api.post<Map<String, dynamic>>(
      '/auth/otp/verify',
      body: {
        'phone': phone,
        'code': code,
        'role': 'CAPTAIN',
        if (fullName != null && fullName.trim().isNotEmpty) 'fullName': fullName.trim(),
        if (nationalId != null && nationalId.trim().isNotEmpty) 'nationalId': nationalId.trim(),
      },
    );

    final session = CaptainSession.fromJson(res);
    await _api.tokens.save(access: session.accessToken, refresh: session.refreshToken);
    return session;
  }

  bool get isLoggedIn => _api.tokens.isLoggedIn;

  /// مافيش endpoint لتسجيل الخروج — بنمسح التوكن محلياً بس.
  Future<void> logout() => _api.tokens.clear();
}

// ─────────────────────────── الرحلات ───────────────────────────

class TripsRepository {
  const TripsRepository(this._api);

  final ApiClient _api;

  /// الرحلة الجارية دلوقتي — أول طلب حالته [OrderStatus.isActiveTrip]، وnull لو مافيش.
  ///
  /// مافيش endpoint مخصص لها؛ بنستخدم GET /orders بفلتر الحالات التلاتة
  /// (السيرفر بيرتّب `placedAt desc` فأحدث رحلة هي الأولى).
  Future<CaptainTrip?> active() async {
    final page = await history(pageSize: 5, statuses: _activeStatuses);
    for (final trip in page.trips) {
      if (trip.status.isActiveTrip) return trip;
    }
    return null;
  }

  /// GET /orders — السجل، محصور تلقائياً على الكابتن اللي في التوكن
  /// (`where.captainId = user.captainId` في orders.service.ts).
  ///
  /// ⚠️ لو التوكن مافيهوش captainId (شوف تحذير أول الملف) الفلتر بيتجاهل تماماً
  /// والرد بيرجّع طلبات مش بتاعة الكابتن.
  Future<TripsPage> history({
    int page = 1,
    int pageSize = 20,
    List<OrderStatus> statuses = const [],
    DateTime? from,
    DateTime? to,
  }) async {
    final res = await _api.get<Map<String, dynamic>>(
      '/orders',
      query: {
        'page': page,
        'pageSize': pageSize,
        // الـ API بيقبل مصفوفة بس: status[]=DELIVERED&status[]=…
        if (statuses.isNotEmpty) 'status[]': [for (final s in statuses) s.wire],
        if (from != null) 'from': from.toIso8601String(),
        if (to != null) 'to': to.toIso8601String(),
      },
    );

    return (
      trips: [
        for (final raw in (res['data'] as List<dynamic>? ?? const []))
          CaptainTrip.fromJson(raw as Map<String, dynamic>),
      ],
      total: asInt(res['total']),
      page: asInt(res['page'], page),
      pageSize: asInt(res['pageSize'], pageSize),
    );
  }

  /// GET /orders/:id — بإحداثيات الفرع والعنوان (بيعدّي على mapOrder).
  Future<CaptainTrip> byId(String id) async =>
      CaptainTrip.fromJson(await _api.get<Map<String, dynamic>>('/orders/$id'));

  /// PATCH /orders/:id/pickup — السيرفر بيطابق كود الاستلام ويرمي
  /// «كود الاستلام غير صحيح» لو غلط. لازم الطلب يكون CAPTAIN_ASSIGNED.
  Future<CaptainTrip> pickup(String id, String pickupCode) async => CaptainTrip.fromJson(
        await _api.patch<Map<String, dynamic>>(
          '/orders/$id/pickup',
          body: {'pickupCode': pickupCode},
        ),
      );

  /// PATCH /orders/:id/on-the-way — من PICKED_UP لـ ON_THE_WAY.
  Future<CaptainTrip> onTheWay(String id) async => CaptainTrip.fromJson(
        await _api.patch<Map<String, dynamic>>('/orders/$id/on-the-way'),
      );

  /// PATCH /orders/:id/delivered — بيتطلب **كود العميل + صورة إثبات**. بيقفل
  /// الحساب المالي ويرجّع الكابتن ONLINE.
  Future<CaptainTrip> delivered(String id, String code, {String? photoUrl}) async => CaptainTrip.fromJson(
        await _api.patch<Map<String, dynamic>>(
          '/orders/$id/delivered',
          body: {'code': code, if (photoUrl != null) 'photoUrl': photoUrl},
        ),
      );

  // ── التوصيل بالتناوب (الحرم) ──

  /// POST /relay/:id/arrive — مندوب المركبة وصل بوابة الحرم: النظام بيختار مندوب
  /// مشي متاح ويفتح عملية تسليم. بيرجّع بيانات مندوب المشي ونقطة الالتقاء.
  Future<Map<String, dynamic>> relayArrive(String id, {String? photoUrl, double? lat, double? lng}) =>
      _api.post<Map<String, dynamic>>('/relay/$id/arrive', body: {
        if (photoUrl != null) 'photoUrl': photoUrl,
        if (lat != null) 'lat': lat,
        if (lng != null) 'lng': lng,
      });

  /// POST /relay/:id/confirm — مندوب المشي يؤكّد الاستلام بكود مندوب المركبة + صورة.
  Future<void> relayConfirm(String id, String code, String photoUrl) =>
      _api.post<Map<String, dynamic>>('/relay/$id/confirm', body: {'code': code, 'photoUrl': photoUrl});

  /// GET /relay/incoming — التسليمات المستنية تأكيد مندوب المشي.
  // ── محادثة الطلب مع العميل ──
  // نفس مسارات تطبيق العميل — الصلاحية على السيرفر بتحدّد مين طرف في الطلب.

  /// GET /orders/:id/messages
  Future<OrderChat> chat(String orderId) async => OrderChat.fromJson(
        await _api.get<Map<String, dynamic>>('/orders/$orderId/messages'),
      );

  /// POST /orders/:id/messages — بيرمي [ApiException] لو المحادثة مقفولة.
  Future<void> sendMessage(String orderId, String body) async {
    await _api.post<Map<String, dynamic>>(
      '/orders/$orderId/messages',
      body: {'body': body},
    );
  }

  /// PATCH /orders/:id/messages/read
  Future<void> markChatRead(String orderId) async {
    await _api.patch<Map<String, dynamic>>('/orders/$orderId/messages/read');
  }

  Future<List<Map<String, dynamic>>> relayIncoming() async {
    final res = await _api.get<List<dynamic>>('/relay/incoming');
    return res.cast<Map<String, dynamic>>();
  }
}

// ─────────────────────────── الأرباح ───────────────────────────

class EarningsRepository {
  const EarningsRepository(this._api);

  final ApiClient _api;

  /// أقصى عدد صفحات بنجيبها — سقف أمان عشان مانجيبش السجل كله في شاشة أرباح.
  static const _maxPages = 5;
  static const _pageSize = 100;

  /// ملخص الأرباح **محسوب على الجهاز**.
  ///
  /// ⚠️ بقى فيه endpoint حقيقي للأرباح ([CaptainRepository.earnings]) وهو المصدر
  /// المعتمد في شاشة الأرباح وشاشة الورديات. الحسبة دي لسه هنا لأن الرئيسية
  /// (`home_screen`) وسجل الرحلات (`my_trips_screen`) بيستخدموها، وهي بتملى
  /// **التلات مجاميع** في نداء واحد وده اللي الشاشتين دول محتاجينه.
  ///
  /// بنجيب الطلبات المسلّمة من بداية الشهر أو بداية الأسبوع (أيهما أسبق) مهما كانت
  /// [range]، عشان التلات مجاميع (اليوم/الأسبوع/الشهر) تطلع كلها صحيحة في نفس النداء.
  /// [range] بتحدد بس أنهي مجموع الشاشة بتبرزه.
  ///
  /// اللي مش قابل للحساب بيرجع null: ساعات الأونلاين، البقشيش، الحوافز.
  /// راجع تعليقات lib/models/earnings.dart.
  Future<EarningsSummary> summary([EarningsRange range = EarningsRange.today]) async {
    final now = DateTime.now();
    final monthStart = DateTime(now.year, now.month);
    final weekStart = EarningsSummary.startOfWeek(now);
    final from = weekStart.isBefore(monthStart) ? weekStart : monthStart;

    final trips = <CaptainTrip>[];
    double? walletBalance;

    for (var page = 1; page <= _maxPages; page++) {
      final res = await _api.get<Map<String, dynamic>>(
        '/orders',
        query: {
          'page': page,
          'pageSize': _pageSize,
          'status[]': [OrderStatus.delivered.wire],
          'from': from.toIso8601String(),
        },
      );

      final rows = (res['data'] as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>();
      for (final raw in rows) {
        trips.add(CaptainTrip.fromJson(raw));
        // رصيد المحفظة بيجي مرفق مع الكابتن في أي طلب — ده المصدر الوحيد المتاح.
        walletBalance ??= _walletOf(raw);
      }

      if (trips.length >= asInt(res['total']) || rows.length < _pageSize) break;
    }

    return EarningsSummary.fromDelivered(
      trips,
      range: range,
      walletBalance: walletBalance,
      now: now,
    );
  }

  static double? _walletOf(Map<String, dynamic> order) {
    final captain = order['captain'] as Map<String, dynamic>?;
    return captain == null ? null : asMoneyOrNull(captain['walletBalance']);
  }
}

// ─────────────────────────── الكابتن ───────────────────────────

class CaptainRepository {
  const CaptainRepository(this._api);

  final ApiClient _api;

  /// بيانات الكابتن — `GET /captains/me`.
  ///
  /// الرد فيه كل حاجة في نداء واحد: التقييم، المحفظة، عدد التوصيلات، سنة الانضمام،
  /// رقم الهوية مقنّع، وملخص الوثائق (`documentsSummary`).
  ///
  /// **الـ fallback القديم لسه هنا عن قصد**: لو النداء رجع 403 يبقى التوكن مالوش
  /// `captainId` (المستخدم اتعمل من /auth/otp/verify من غير صف كابتن — شوف التحذير
  /// أول الملف). في الحالة دي بنرجع نركّب الكابتن من صف `captain` المرفق مع أحدث
  /// طلب زي الأول، وبعدها من [session]، عشان الشاشات ماتفضلش فاضية تماماً.
  /// أي خطأ تاني (شبكة، ٥٠٠) بيتمرّر زي ما هو — مابنخفيش أعطال حقيقية.
  Future<Captain> me({CaptainSession? session}) async {
    try {
      return Captain.fromMe(await _api.get<Map<String, dynamic>>('/captains/me'));
    } on ApiException catch (e) {
      if (e.statusCode != 403) rethrow;
      return _meFallback(session, reason: e.message);
    }
  }

  /// PATCH /captains/me — نوع المركبة واللوحة والصورة بس (الباقي مش قابل للتعديل).
  Future<Captain> updateProfile({
    String? vehicleType,
    String? plateNumber,
    String? avatarUrl,
  }) async =>
      Captain.fromMe(
        await _api.patch<Map<String, dynamic>>(
          '/captains/me',
          body: {
            if (vehicleType != null) 'vehicleType': vehicleType,
            if (plateNumber != null) 'plateNumber': plateNumber,
            if (avatarUrl != null) 'avatarUrl': avatarUrl,
          },
        ),
      );

  // ─────────────────────────── الوثائق ───────────────────────────

  /// GET /captains/me/documents — **خمس صفوف دايماً** بترتيب ثابت:
  /// IDENTITY · LICENSE · VEHICLE_REG · INSURANCE · PHOTO.
  /// الأنواع اللي مترفعتش بترجع بـ `id: null` و `status: MISSING`.
  Future<List<CaptainDocument>> documents() async {
    final res = await _api.get<List<dynamic>>('/captains/me/documents');
    return [
      for (final raw in res)
        if (raw is Map<String, dynamic>) CaptainDocument.fromJson(raw),
    ];
  }

  /// POST /captains/me/documents — بيسجّل رابط ملف مرفوع على نوع وثيقة.
  ///
  /// **upsert**: لو النوع مرفوع قبل كده بيتبدّل، والحالة بترجع PENDING دايماً —
  /// يعني إعادة رفع وثيقة مرفوضة بتشيل الرفض لوحدها.
  Future<CaptainDocument> uploadDocument({
    required String type,
    required String fileUrl,
    DateTime? expiresAt,
  }) async =>
      CaptainDocument.fromJson(
        await _api.post<Map<String, dynamic>>(
          '/captains/me/documents',
          body: {
            'type': type,
            'fileUrl': fileUrl,
            if (expiresAt != null) 'expiresAt': expiresAt.toIso8601String(),
          },
        ),
      );

  /// POST /uploads — رفع ملف واحد (multipart، اسم الحقل `file`) وبيرجّع رابطه.
  ///
  /// بيستخدم الـ Dio الخام (`ApiClient.dio`) لأن [ApiClient] بيبعت
  /// `Content-Type: application/json` افتراضياً، والـ multipart محتاج
  /// content-type بـ boundary — عشان كده بنحدّده صراحة في [Options].
  /// الحدود من السيرفر: ٨ ميجا، و jpg/png/webp/pdf بس.
  Future<String> uploadFile(File file, {String folder = 'documents'}) async {
    final form = FormData.fromMap({
      'file': await MultipartFile.fromFile(
        file.path,
        filename: file.path.split(Platform.pathSeparator).last,
      ),
      'folder': folder,
    });

    try {
      final res = await _api.dio.post<Map<String, dynamic>>(
        '/uploads',
        data: form,
        options: Options(contentType: 'multipart/form-data'),
      );

      final url = asText(res.data?['url']);
      if (url.isEmpty) throw const ApiException('نجح الرفع لكن لا يوجد رابط في الرد');
      return url;
    } on DioException catch (e) {
      throw _asApiException(e);
    }
  }

  // ─────────────────────────── الأرباح والمحفظة ───────────────────────────

  /// GET /captains/me/earnings — مجموع الفترة وعدد الرحلات ومتسلسلة الأيام والتفصيل.
  /// المتسلسلة بتيجي مصفّرة ومترتبة من السبت ومجموعها = `total` بالظبط.
  Future<EarningsSummary> earnings([EarningsRange range = EarningsRange.today]) async =>
      EarningsSummary.fromJson(
        await _api.get<Map<String, dynamic>>(
          '/captains/me/earnings',
          query: {'range': range.name},
        ),
        range: range,
      );

  // ─────────────────────────── الورديات ───────────────────────────

  /// GET /captains/me/shifts?range=today|week|month — مجاميع الفترة (دقايق
  /// الاتصال/الرحلات/الأرباح) + الوردية المفتوحة دلوقتي (لو فيه) + سجل الورديات.
  /// `onlineMinutes` بيعدّ الوردية المفتوحة لحد دلوقتي — المصدر الوحيد لـ«ساعات
  /// الاتصال» اللي كانت «—» زمان.
  Future<ShiftsSummary> shifts([EarningsRange range = EarningsRange.today]) async =>
      ShiftsSummary.fromJson(
        await _api.get<Map<String, dynamic>>(
          '/captains/me/shifts',
          query: {'range': range.name},
        ),
        range: range,
      );

  /// POST /captains/me/shifts/start — بيفتح وردية ويخلّي الكابتن ONLINE.
  /// **idempotent**: بيرجّع الوردية المفتوحة زي ما هي لو الكابتن على وردية أصلاً.
  Future<ShiftView> startShift() async =>
      ShiftView.fromJson(await _api.post<Map<String, dynamic>>('/captains/me/shifts/start'));

  /// POST /captains/me/shifts/end — بيقفل الوردية المفتوحة ويخلّي الكابتن OFFLINE.
  /// بيرجّع الوردية اللي اتقفلت، أو `null` لو مافيش وردية مفتوحة أصلاً.
  Future<ShiftView?> endShift() async {
    final res = await _api.post<dynamic>('/captains/me/shifts/end');
    return res is Map<String, dynamic> ? ShiftView.fromJson(res) : null;
  }

  // ─────────────────────────── التحقق اليومي بالوجه ───────────────────────────

  /// GET /face/me/today — هل الكابتن اتحقّق بالوجه النهاردة + آخر فحص + حالة الخدمة.
  ///
  /// `verifiedToday` هو البوابة: لازم يبقى true قبل ما الكابتن يبدأ استقبال طلبات.
  /// `biometricConfigured` بترجع **false** و `provider` بترجع `'stub'` دلوقتي —
  /// يعني مافيش مطابقة بيومترية حقيقية لسه (الموديل بيسرّبهم للشاشة بصراحة).
  Future<FaceToday> faceToday() async =>
      FaceToday.fromJson(await _api.get<Map<String, dynamic>>('/face/me/today'));

  /// POST /face/me/check — بيسجّل فحص وجه على رابط سيلفي **مرفوع قبل كده**.
  ///
  /// نفس أسلوب رفع الوثائق (خطوتين): ارفع الصورة الأول بـ [uploadFile] عشان
  /// تاخد `selfieUrl`، وبعدين ابعت الرابط هنا. بيرجّع الفحص بحالته
  /// (VERIFIED / PENDING / REJECTED) وبيرمي [ApiException] برسالة السيرفر لو فشل.
  Future<FaceCheck> submitFaceCheck(String selfieUrl) async => FaceCheck.fromJson(
        await _api.post<Map<String, dynamic>>(
          '/face/me/check',
          body: {'selfieUrl': selfieUrl},
        ),
      );

  /// GET /captains/me/wallet — الرصيد والمحجوز والقابل للسحب وحسابات الاستلام.
  Future<Wallet> wallet() async =>
      Wallet.fromJson(await _api.get<Map<String, dynamic>>('/captains/me/wallet'));

  /// GET /captains/me/distributions — توزيعات شركة الأسطول للكابتن التابع لشركة.
  ///
  /// بيرجّع المجاميع (مدفوع/معلّق/عدد رحلات) وقايمة التسويات بحالاتها. الكابتن
  /// المستقل بترجع له قايمة فاضية — الفلوس بتاعته على المحفظة مش هنا.
  Future<CaptainDistributions> myDistributions() async => CaptainDistributions.fromJson(
        await _api.get<Map<String, dynamic>>('/captains/me/distributions'),
      );

  /// GET /captains/me/wallet/transactions — كشف الحساب، الأحدث الأول.
  Future<WalletPage<WalletTransaction>> walletTransactions({
    int page = 1,
    int pageSize = 20,
  }) async =>
      _page(
        await _api.get<Map<String, dynamic>>(
          '/captains/me/wallet/transactions',
          query: {'page': page, 'pageSize': pageSize},
        ),
        WalletTransaction.fromJson,
        page: page,
        pageSize: pageSize,
      );

  /// POST /captains/me/withdrawals — الحد الأدنى ٥٠ ر.س.
  ///
  /// ⚠️ **الرصيد مابيتخصمش هنا**: الطلب بيتحجز حسابياً (`availableToWithdraw`
  /// بيقل و `pendingWithdrawals` بيزيد) والخصم الفعلي بيحصل عند موافقة الأدمن.
  /// أخطاء السيرفر بالعربي: «الحد الأدنى للسحب ٥٠ ر.س» · «الرصيد المتاح أقل من
  /// المبلغ المطلوب» · «حساب الاستلام غير موجود».
  Future<WithdrawalRequest> createWithdrawal({
    required double amount,
    required String payoutMethodId,
  }) async =>
      WithdrawalRequest.fromJson(
        await _api.post<Map<String, dynamic>>(
          '/captains/me/withdrawals',
          body: {'amount': amount, 'payoutMethodId': payoutMethodId},
        ),
      );

  /// GET /captains/me/withdrawals — سجل طلبات السحب مرقّم.
  Future<WalletPage<WithdrawalRequest>> withdrawals({int page = 1, int pageSize = 20}) async =>
      _page(
        await _api.get<Map<String, dynamic>>(
          '/captains/me/withdrawals',
          query: {'page': page, 'pageSize': pageSize},
        ),
        WithdrawalRequest.fromJson,
        page: page,
        pageSize: pageSize,
      );

  // ─────────────────────────── حسابات الاستلام ───────────────────────────

  /// GET /captains/me/payout-methods — `accountRef` بيرجع **مقنّع** دايماً.
  Future<List<PayoutMethod>> payoutMethods() async {
    final res = await _api.get<List<dynamic>>('/captains/me/payout-methods');
    return [
      for (final raw in res)
        if (raw is Map<String, dynamic>) PayoutMethod.fromJson(raw),
    ];
  }

  /// POST /captains/me/payout-methods — [accountRef] بيتخزّن كامل وبيرجع مقنّع.
  Future<PayoutMethod> addPayoutMethod({
    required String destination,
    required String label,
    required String accountRef,
  }) async =>
      PayoutMethod.fromJson(
        await _api.post<Map<String, dynamic>>(
          '/captains/me/payout-methods',
          body: {'destination': destination, 'label': label, 'accountRef': accountRef},
        ),
      );

  /// DELETE /captains/me/payout-methods/:id
  Future<void> deletePayoutMethod(String id) async =>
      _api.delete<Map<String, dynamic>>('/captains/me/payout-methods/$id');

  // ─────────────────────────── داخلي ───────────────────────────

  /// شكل الصفحة واحد في كل قوايم المحفظة — `{data, total, page, pageSize}`.
  WalletPage<T> _page<T>(
    Map<String, dynamic> res,
    T Function(Map<String, dynamic>) parse, {
    required int page,
    required int pageSize,
  }) =>
      (
        data: [
          for (final raw in (res['data'] as List<dynamic>? ?? const []))
            if (raw is Map<String, dynamic>) parse(raw),
        ],
        total: asInt(res['total']),
        page: asInt(res['page'], page),
        pageSize: asInt(res['pageSize'], pageSize),
      );

  /// نفس تحويل الأخطاء اللي في [ApiClient] — محتاجينه هنا لأن رفع الملف بيعدّي
  /// على الـ Dio الخام مش على `ApiClient.get/post`.
  ApiException _asApiException(DioException e) {
    final data = e.response?.data;
    final message = data is Map<String, dynamic> ? data['message'] : null;

    return ApiException(
      switch (message) {
        final String m => m,
        final List<dynamic> list when list.isNotEmpty => list.first.toString(),
        _ => switch (e.type) {
            DioExceptionType.connectionTimeout ||
            DioExceptionType.receiveTimeout ||
            DioExceptionType.sendTimeout =>
              'الاتصال بطيء — حاول مرة أخرى',
            DioExceptionType.connectionError => 'لا يوجد اتصال بالخادم',
            _ => 'تعذّر رفع الملف',
          },
      },
      statusCode: e.response?.statusCode,
    );
  }

  /// الطريقة القديمة — من صف `captain` المرفق مع أحدث طلب، وبعدها من الجلسة.
  /// بتشتغل لما `GET /captains/me` يرجع 403 بس.
  Future<Captain> _meFallback(CaptainSession? session, {required String reason}) async {
    final row = await _latestCaptainRow();

    if (row == null) {
      final user = session?.user;
      if (user == null || user.isEmpty) throw ApiException(reason, statusCode: 403);
      return Captain.fromUser(user, captainId: session?.captainId);
    }

    return Captain.fromJson(row).copyWith(totalDeliveries: await _deliveredCount());
  }

  /// صف `captain` من أحدث طلب — null لو مافيش طلبات ولا الطلب مالوش كابتن.
  Future<Map<String, dynamic>?> _latestCaptainRow() async {
    final res = await _api.get<Map<String, dynamic>>(
      '/orders',
      query: {'page': 1, 'pageSize': 1},
    );

    final data = (res['data'] as List<dynamic>? ?? const []).whereType<Map<String, dynamic>>();
    if (data.isEmpty) return null;
    return data.first['captain'] as Map<String, dynamic>?;
  }

  /// عدد الطلبات المسلّمة — من `total` مش من طول المصفوفة.
  Future<int> _deliveredCount() async {
    final res = await _api.get<Map<String, dynamic>>(
      '/orders',
      query: {
        'page': 1,
        'pageSize': 1,
        'status[]': [OrderStatus.delivered.wire],
      },
    );
    return asInt(res['total']);
  }
}

// ─────────────────────────── البروڤايدرز ───────────────────────────

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(ref.watch(apiClientProvider)),
);

final tripsRepositoryProvider = Provider<TripsRepository>(
  (ref) => TripsRepository(ref.watch(apiClientProvider)),
);

final earningsRepositoryProvider = Provider<EarningsRepository>(
  (ref) => EarningsRepository(ref.watch(apiClientProvider)),
);

final captainRepositoryProvider = Provider<CaptainRepository>(
  (ref) => CaptainRepository(ref.watch(apiClientProvider)),
);
