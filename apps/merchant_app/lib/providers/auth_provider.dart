// تسجيل الدخول + اختيار الفرع + حفظ التوكن
// طبقة رفيعة فوق AuthRepository — بتفتح السوكيت بعد نجاح الدخول.
// الشاشة هي اللي ماسكة الـ TextEditingController؛ هنا بس نتيجة النداء.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api_client.dart';
import '../core/socket_service.dart';
import '../data/merchant_repository.dart';

class AuthState {
  const AuthState({
    this.identifier = '',
    this.isLoggedIn = false,
    this.branches = const [],
    this.needsBranch = false,
  });

  /// آخر إيميل/جوال اتكتب — بنستخدمه في إعادة النداء بعد اختيار الفرع.
  final String identifier;
  final bool isLoggedIn;

  /// فروع الحساب لما يكون متعدد الفروع (فاضية في الحالة العادية).
  final List<BranchOption> branches;

  /// true = السيرفر طلب اختيار فرع، فشرائح الفروع بتظهر في شاشة الدخول.
  final bool needsBranch;

  AuthState copyWith({
    String? identifier,
    bool? isLoggedIn,
    List<BranchOption>? branches,
    bool? needsBranch,
  }) =>
      AuthState(
        identifier: identifier ?? this.identifier,
        isLoggedIn: isLoggedIn ?? this.isLoggedIn,
        branches: branches ?? this.branches,
        needsBranch: needsBranch ?? this.needsBranch,
      );
}

class AuthNotifier extends Notifier<AuthState> {
  @override
  AuthState build() => AuthState(isLoggedIn: ref.read(tokenStoreProvider).isLoggedIn);

  /// بيرمي [ApiException] لو البيانات غلط أو الحساب مش مربوط بفرع.
  /// لما الحساب يبقى على أكتر من فرع بيرجّع من غير ما يرمي، وبيحطّ
  /// [AuthState.needsBranch] = true عشان الشاشة تعرض شرائح الفروع،
  /// وبعدين بتنادي تاني ومعاها [branchId] المختار.
  Future<void> login({
    required String identifier,
    required String password,
    String? branchId,
  }) async {
    final result = await ref.read(authRepositoryProvider).login(
          identifier: identifier,
          password: password,
          branchId: branchId,
        );

    switch (result) {
      case LoginNeedsBranch(:final branches):
        state = state.copyWith(
          identifier: identifier,
          branches: branches,
          needsBranch: true,
          isLoggedIn: false,
        );

      case LoginSuccess():
        // الريبو حفظ التوكن بالفعل — نفتح السوكيت عشان order:new ما يفوتش.
        ref.read(socketServiceProvider).connect();
        state = AuthState(identifier: identifier, isLoggedIn: true);
    }
  }

  Future<void> logout() async {
    await ref.read(authRepositoryProvider).logout();
    ref.read(socketServiceProvider).disconnect();
    state = const AuthState();
  }
}

final authProvider = NotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);
