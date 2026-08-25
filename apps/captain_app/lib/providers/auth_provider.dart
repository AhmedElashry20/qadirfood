// تسجيل الدخول بالجوال + OTP — كله من الـ API الحقيقي.
// الأخطاء بتطلع زي ما هي (ApiException) والشاشة بتعرض `e.message`.
// الجوال بيتخزّن دايماً بصيغة السيرفر «05XXXXXXXX» (شوف [AuthNotifier.normalizePhone]).
//
// ══════════════════════════════════════════════════════════════════════════
//        ⚠️ تلات حقايق من السيرفر لازم تتعرف قبل ما تعدّل في الملف ده
// ══════════════════════════════════════════════════════════════════════════
// ١) **تسجيل كابتن جديد محتاج `nationalId`.** السيرفر بيعمل صف `captains` مع
//    اليوزر، والعمود `nationalId` إلزامي، فبيرمي 400 «رقم الهوية مطلوب لتسجيل
//    كابتن جديد» من غيره. و[AuthRepository.verifyOtp] في data/captain_repository.dart
//    **مابيعرضش الحقل ده** (توقيعه: phone/code/fullName بس)، والملف ده مش بتاعنا
//    نعدّله — عشان كده [AuthNotifier.register] بتنادي `/auth/otp/verify` مباشرة
//    عن طريق `apiClientProvider` وبتحفظ التوكن بإيدها زي ما الـ repository بيعمل.
//    أول ما الـ repository يضيف `nationalId` للتوقيع، شيل النداء المباشر ده.
//
// ٢) **الرمز بيتحرق قبل التحقق من البيانات.** في auth.service.ts:
//        const otp = await findFirst({ consumed: false, ... });
//        if (!otp) throw ...
//        await update({ data: { consumed: true } });   ← بيتحرق هنا
//        ... بعد كده بس بيتشيّك على fullName و nationalId
//    يعني أول محاولة تحقق لكابتن جديد بترجع 400 و**بتستهلك الرمز**. فالرمز اللي
//    شاشة OTP بتوديه لشاشة التسجيل بيبقى ميّت، ولازم رمز جديد. عشان كده شاشة
//    التسجيل فيها حقل رمز + «إعادة إرسال» بدل ما تعتمد على الرمز المحمول.
//
// ٣) **نوع المركبة واللوحة مالهمش مكان في الطلب.** VerifyOtpDto في
//    src/auth/auth.module.ts فيه {phone, code, role, nationalId, fullName} وخلاص —
//    مافيش vehicleType ولا plateNumber، والسيرفر بيعمل الصف بـ
//    `captain: { create: { nationalId } }` بس (النوع بياخد الافتراضي MOTORCYCLE).
//    فشاشة التسجيل بتجمّع النوع للعرض بس ومابتبعتوش.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api_client.dart';
import '../core/socket_service.dart';
import '../data/captain_repository.dart';

class AuthState {
  const AuthState({
    this.phone = '',
    this.fullName = '',
    this.isLoggedIn = false,
    this.devCode,
    this.needsRegistration = false,
  });

  /// الجوال بصيغة الـ API — «05XXXXXXXX».
  final String phone;

  /// اسم الكابتن — بيتملّي من الجلسة بعد التحقق.
  final String fullName;
  final bool isLoggedIn;

  /// رمز التحقق اللي السيرفر بيرجعه في بيئة التطوير — شاشة OTP بتعرضه كتلميح
  /// قابل للضغط. مافيش مزوّد SMS متوصّل لسه.
  final String? devCode;

  /// السيرفر رفض التحقق لأن الرقم بيدخل لأول مرة — يا إما «الاسم مطلوب للتسجيل
  /// لأول مرة» يا «رقم الهوية مطلوب لتسجيل كابتن جديد». الاتنين 400 والاتنين معناهم
  /// «وديه شاشة التسجيل».
  final bool needsRegistration;

  /// «+966 5XXXXXXXX» — للعرض بس.
  String get phoneWithCode {
    if (phone.isEmpty) return '';
    return '+966 ${phone.startsWith('0') ? phone.substring(1) : phone}';
  }

  AuthState copyWith({
    String? phone,
    String? fullName,
    bool? isLoggedIn,
    String? devCode,
    bool clearDevCode = false,
    bool? needsRegistration,
  }) =>
      AuthState(
        phone: phone ?? this.phone,
        fullName: fullName ?? this.fullName,
        isLoggedIn: isLoggedIn ?? this.isLoggedIn,
        devCode: clearDevCode ? null : (devCode ?? this.devCode),
        needsRegistration: needsRegistration ?? this.needsRegistration,
      );
}

class AuthNotifier extends Notifier<AuthState> {
  @override
  AuthState build() => AuthState(isLoggedIn: ref.watch(tokenStoreProvider).isLoggedIn);

  AuthRepository get _auth => ref.read(authRepositoryProvider);

  /// «5X XXX XXXX» أو «+966 5…» → صيغة الـ API «05XXXXXXXX».
  static String normalizePhone(String input) {
    var digits = input.replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) return '';
    if (digits.startsWith('00966')) digits = digits.substring(5);
    if (digits.startsWith('966')) digits = digits.substring(3);
    if (!digits.startsWith('0')) digits = '0$digits';
    return digits;
  }

  /// شاشة الدخول بتخزّن الرقم قبل ما تطلب الرمز منه.
  void setPhone(String phone) => state = state.copyWith(phone: normalizePhone(phone));

  /// POST /auth/otp/request — بيخزّن `devCode` في الحالة عشان شاشة OTP تعرضه.
  Future<void> requestOtp(String phone) async {
    final normalized = normalizePhone(phone);
    state = state.copyWith(phone: normalized, clearDevCode: true, needsRegistration: false);

    final challenge = await _auth.requestOtp(normalized);
    state = state.copyWith(devCode: challenge.devCode);
  }

  /// POST /auth/otp/verify للكابتن **الموجود** — التوكن بيتحفظ جوّه الـ repository.
  ///
  /// أي 400 هنا معناه إن الرقم جديد ومحتاج تسجيل كامل (اسم + رقم هوية)، فبنرفع
  /// `needsRegistration` وبنعيد رمي الـ [ApiException] عشان الشاشة توجّه لشاشة
  /// التسجيل. الرمز الغلط بيرجع 401 مش 400.
  Future<void> verifyOtp(String code) async {
    try {
      final session = await _auth.verifyOtp(phone: state.phone, code: code);
      _applySession(session);
    } on ApiException catch (e) {
      if (e.statusCode == 400) state = state.copyWith(needsRegistration: true);
      rethrow;
    }
  }

  /// تسجيل كابتن جديد — نفس الـ endpoint بس بـ `nationalId`.
  ///
  /// بننادي الـ API مباشرة مش عن طريق [AuthRepository.verifyOtp] لأن توقيعها
  /// مافيهوش `nationalId` (شوف الملاحظة رقم ١ فوق). بنحفظ التوكن بإيدنا هنا زي
  /// ما الـ repository بيعمل بالظبط.
  ///
  /// [vehicleType] و [plateNumber] **مابيتبعتوش** — مالهمش حقول في الـ DTO
  /// (الملاحظة رقم ٣). موجودين في التوقيع عشان الشاشة تفضل صادقة لما الـ API يضيفهم.
  Future<void> register({
    required String code,
    required String fullName,
    required String nationalId,
    String? vehicleType,
    String? plateNumber,
  }) async {
    final api = ref.read(apiClientProvider);

    final res = await api.post<Map<String, dynamic>>(
      '/auth/otp/verify',
      body: {
        'phone': state.phone,
        'code': code.trim(),
        'role': 'CAPTAIN',
        'fullName': fullName.trim(),
        'nationalId': nationalId.trim(),
      },
    );

    final session = CaptainSession.fromJson(res);
    await api.tokens.save(access: session.accessToken, refresh: session.refreshToken);
    _applySession(session);
  }

  void _applySession(CaptainSession session) {
    state = state.copyWith(
      isLoggedIn: true,
      fullName: session.fullName,
      phone: session.phone.isEmpty ? state.phone : session.phone,
      needsRegistration: false,
      clearDevCode: true,
    );

    ref.read(socketServiceProvider).connect();
  }

  /// مافيش endpoint لتسجيل الخروج — بنمسح التوكن ونقفل السوكيت محلياً.
  Future<void> logout() async {
    await _auth.logout();
    ref.read(socketServiceProvider).disconnect();
    state = const AuthState();
  }
}

final authProvider = NotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);
