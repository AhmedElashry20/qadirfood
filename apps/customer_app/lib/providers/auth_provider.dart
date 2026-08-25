// الدخول بالجوال + OTP + الملف الشخصي — كله من الـ API الحقيقي.
// الأخطاء بتطلع زي ما هي (ApiException) والشاشة بتعرض `e.message`.
// الجوال بيتخزّن دايماً بصيغة السيرفر «05XXXXXXXX» (شوف [AuthNotifier.normalizePhone]).
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api_client.dart';
import '../core/socket_service.dart';
import '../data/api_repository.dart';

class AuthState {
  const AuthState({
    this.phone = '',
    this.fullName = '',
    this.isLoggedIn = false,
    this.devCode,
    this.needsName = false,
  });

  /// الجوال بصيغة الـ API — «05XXXXXXXX».
  final String phone;

  /// اسم المستخدم — بيتملّي من الجلسة بعد التحقق.
  final String fullName;
  final bool isLoggedIn;

  /// رمز التحقق اللي السيرفر بيرجعه في بيئة التطوير — شاشة OTP بتعرضه كتلميح.
  final String? devCode;

  /// السيرفر رفض التحقق لأن الرقم بيدخل لأول مرة والاسم مطلوب —
  /// الشاشة بتطلب الاسم وتنادي [AuthNotifier.verifyOtp] تاني بـ `fullName`.
  final bool needsName;

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
    bool? needsName,
  }) =>
      AuthState(
        phone: phone ?? this.phone,
        fullName: fullName ?? this.fullName,
        isLoggedIn: isLoggedIn ?? this.isLoggedIn,
        devCode: clearDevCode ? null : (devCode ?? this.devCode),
        needsName: needsName ?? this.needsName,
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

  /// شاشة تسجيل الدخول بتخزّن الرقم قبل ما تطلب الرمز.
  void setPhone(String phone) => state = state.copyWith(phone: normalizePhone(phone));

  /// الاسم اللي المستخدم كتبه قبل التحقق (شاشة إكمال البيانات) —
  /// بيتبعت مع [verifyOtp] لو الرقم بيسجّل لأول مرة.
  void setName(String fullName) => state = state.copyWith(fullName: fullName.trim());

  /// POST /auth/otp/request — بيخزّن `devCode` في الحالة عشان شاشة OTP تعرضه.
  Future<void> requestOtp(String phone) async {
    final normalized = normalizePhone(phone);
    state = state.copyWith(phone: normalized, clearDevCode: true, needsName: false);

    final challenge = await _auth.requestOtp(normalized);
    state = state.copyWith(devCode: challenge.devCode);
  }

  /// POST /auth/otp/verify — التوكن بيتحفظ جوّه الـ repository.
  ///
  /// الاسم إلزامي أول مرة الرقم بيدخل. لو مابعتناش اسم والسيرفر رجّع 400،
  /// بنرفع `needsName = true` وبنعيد رمي الـ [ApiException] عشان الشاشة تسأل عن
  /// الاسم وتنادي الدالة تاني: `verifyOtp(code, fullName: '…')`.
  Future<void> verifyOtp(String code, {String? fullName}) async {
    final name = (fullName ?? state.fullName).trim();
    try {
      final session = await _auth.verifyOtp(
        phone: state.phone,
        code: code,
        fullName: name.isEmpty ? null : name,
      );

      state = state.copyWith(
        isLoggedIn: true,
        fullName: session.fullName,
        phone: session.phone.isEmpty ? state.phone : session.phone,
        needsName: false,
        clearDevCode: true,
      );

      ref.read(socketServiceProvider).connect();
    } on ApiException catch (e) {
      // 400 = «الاسم مطلوب للتسجيل لأول مرة» (الرمز الغلط بيرجع 401).
      if (e.statusCode == 400 && name.isEmpty) state = state.copyWith(needsName: true);
      rethrow;
    }
  }

  /// PATCH /customer/me — بيحدّث الاسم/الإيميل وبيعيد تحميل [profileProvider].
  Future<void> updateProfile({String? fullName, String? email}) async {
    final profile = await ref.read(customerRepositoryProvider).updateMe(
          fullName: fullName,
          email: email,
        );

    state = state.copyWith(fullName: profile.fullName);
    ref.invalidate(profileProvider);
  }

  Future<void> logout() async {
    await _auth.logout();
    ref.read(socketServiceProvider).disconnect();
    state = const AuthState();
  }
}

final authProvider = NotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);

/// GET /customer/me — الاسم والجوال والإيميل ورصيد المحفظة وعدد الطلبات والمفضلة.
/// بيتعاد تحميله تلقائياً بعد الدخول أو الخروج.
final profileProvider = FutureProvider<CustomerProfile>((ref) {
  ref.watch(authProvider.select((s) => s.isLoggedIn));
  return ref.watch(customerRepositoryProvider).me();
});
