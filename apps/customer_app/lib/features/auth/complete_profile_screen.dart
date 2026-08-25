// شاشة ٦: استكمال الملف الشخصي — بتخدم حالتين:
//  (أ) أول تسجيل: الرقم جديد والسيرفر رفض التحقق من غير اسم، فبنعيد
//      `verifyOtp(code, fullName:)` بنفس الرمز اللي المستخدم دخّله في شاشة OTP
//      (الرمز بييجي في `extra` من الراوتر).
//  (ب) مستخدم مسجّل بيعدّل بياناته: بنملّي من `profileProvider` ونحفظ بـ `updateProfile`.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/common.dart';

class CompleteProfileScreen extends ConsumerStatefulWidget {
  const CompleteProfileScreen({super.key, this.otpCode});

  /// رمز الـ OTP اللي المستخدم دخّله — لازم لإتمام أول تسجيل.
  /// الراوتر بيبعته في `extra` (شوف [QRoutes.completeProfile])، والشاشة بتقراه من هناك.
  final String? otpCode;

  @override
  ConsumerState<CompleteProfileScreen> createState() => _CompleteProfileScreenState();
}

class _CompleteProfileScreenState extends ConsumerState<CompleteProfileScreen> {
  late final TextEditingController _name;
  late final TextEditingController _email;

  /// الرمز من الـ constructor أو من `GoRouterState.extra`.
  String? _otpCode;

  bool _agreed = false;
  bool _saving = false;

  /// الشاشة اتفتحت لإتمام أول تسجيل (مش تعديل بيانات).
  bool get _isSignup => !ref.read(authProvider).isLoggedIn;

  @override
  void initState() {
    super.initState();
    final auth = ref.read(authProvider);

    _name = TextEditingController(text: auth.fullName);
    _email = TextEditingController();
    _otpCode = widget.otpCode;

    // مستخدم مسجّل — نملّي الحقول من /customer/me.
    if (auth.isLoggedIn) {
      _agreed = true; // وافق قبل كده وقت التسجيل.
      _prefillFromProfile();
    }
  }

  /// GET /customer/me — لو فشل، المستخدم يقدر يكتب بياناته يدوياً.
  Future<void> _prefillFromProfile() async {
    try {
      final profile = await ref.read(profileProvider.future);
      if (!mounted) return;
      setState(() {
        if (_name.text.trim().isEmpty) _name.text = profile.fullName;
        if (_email.text.trim().isEmpty) _email.text = profile.email ?? '';
      });
    } catch (_) {
      // تجاهُل — الحقول بتفضل فاضية والمستخدم بيكتبها.
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // الراوتر بيبني الشاشة من غير args — الرمز بييجي في `extra`.
    if (_otpCode == null) {
      final extra = GoRouterState.of(context).extra;
      if (extra is String && extra.isNotEmpty) _otpCode = extra;
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_saving) return;

    final name = _name.text.trim();
    final email = _email.text.trim();
    final auth = ref.read(authProvider.notifier);
    final isSignup = _isSignup;
    final code = _otpCode;

    // أول تسجيل من غير رمز — الجلسة ضاعت، نرجّع المستخدم لشاشة الدخول.
    if (isSignup && (code == null || code.isEmpty)) {
      _snack(context, 'انتهت جلسة التحقق — أعد إرسال الرمز');
      context.go(QRoutes.login);
      return;
    }

    setState(() => _saving = true);
    try {
      if (isSignup) {
        // إعادة التحقق بنفس الرمز + الاسم — دي اللي بتنشئ الحساب فعلاً.
        await auth.verifyOtp(code!, fullName: name);
        if (email.isNotEmpty) await auth.updateProfile(email: email);
      } else {
        await auth.updateProfile(fullName: name, email: email.isEmpty ? null : email);
      }

      if (!context.mounted) return;
      context.go(QRoutes.home);
    } on ApiException catch (e) {
      if (!context.mounted) return;
      _snack(context, e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isLoggedIn = ref.watch(authProvider.select((s) => s.isLoggedIn));
    final canSave = !_saving && _name.text.trim().isNotEmpty && (isLoggedIn || _agreed);

    return Scaffold(
      backgroundColor: QColors.surface,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(QSpace.screenH),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const QBackButton(),
              const SizedBox(height: QSpace.gapLg),
              const Text('كمّل بياناتك', style: QText.display),
              const SizedBox(height: QSpace.gapLg),
              const Center(child: _AvatarPicker()),
              const SizedBox(height: QSpace.gapLg),
              QField(
                label: 'الاسم الكامل',
                hint: 'الاسم الكامل',
                controller: _name,
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: QSpace.gapLg),
              QField(
                label: 'البريد الإلكتروني (اختياري)',
                hint: 'name@email.com',
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                textDirection: TextDirection.ltr,
              ),
              const SizedBox(height: QSpace.gapLg),
              // الموافقة على الشروط في أول تسجيل بس.
              if (!isLoggedIn) ...[
                InkWell(
                  onTap: () => setState(() => _agreed = !_agreed),
                  borderRadius: BorderRadius.circular(QRadius.sm),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      children: [
                        QCheckBox(checked: _agreed),
                        const SizedBox(width: 10),
                        const Expanded(
                          child: Text(
                            'أوافق على الشروط وسياسة الخصوصية',
                            style: TextStyle(
                              fontFamily: 'Cairo',
                              fontSize: 13.5,
                              fontWeight: FontWeight.w700,
                              color: QColors.label,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: QSpace.gapLg),
              ],
              SizedBox(
                width: double.infinity,
                child: QButton(
                  label: _saving ? 'جاري الحفظ…' : 'حفظ ومتابعة',
                  enabled: canSave,
                  leading: _saving
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2, color: QColors.ink),
                        )
                      : null,
                  onPressed: _save,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// رسالة سودا بنص أصفر — كل أخطاء الـ API بتظهر بيها.
void _snack(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        backgroundColor: QColors.ink,
        behavior: SnackBarBehavior.floating,
        content: Text(
          message,
          style: const TextStyle(
            fontFamily: 'Cairo',
            fontSize: 13.5,
            fontWeight: FontWeight.w700,
            color: QColors.brand,
          ),
        ),
      ),
    );
}

class _AvatarPicker extends StatelessWidget {
  const _AvatarPicker();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 96,
      height: 96,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: const Color(0xFFFFF6CC),
        shape: BoxShape.circle,
        border: Border.all(color: QColors.brandDeep, width: 2),
      ),
      child: const Text(
        'صورة\nشخصية',
        textAlign: TextAlign.center,
        style: TextStyle(
          fontFamily: 'Cairo',
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: Color(0xFFB89A00),
          height: 1.3,
        ),
      ),
    );
  }
}
