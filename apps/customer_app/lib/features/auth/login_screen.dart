// شاشة ٤: تسجيل الدخول بالجوال — POST /auth/otp/request
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/common.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _phone = TextEditingController();

  bool _sending = false;

  bool get _valid => _phone.text.trim().length >= 9;

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  /// بيطلب الرمز من السيرفر — في التطوير السيرفر بيرجّعه في الرد (شاشة OTP بتعرضه).
  Future<void> _sendCode() async {
    if (_sending) return;
    setState(() => _sending = true);

    try {
      await ref.read(authProvider.notifier).requestOtp(_phone.text.trim());
      if (!context.mounted) return;
      context.push(QRoutes.otp);
    } on ApiException catch (e) {
      if (!context.mounted) return;
      _snack(context, e.message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QColors.surface,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(QSpace.screenH),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // /login بيتفتح بـ go من شاشة اللغة، فمفيش stack يرجع له — لازم وجهة صريحة.
              QBackButton(onTap: () => context.go(QRoutes.language)),
              const SizedBox(height: 24),
              Text('أهلاً بك 👋', style: QText.display),
              const SizedBox(height: 6),
              Text(
                'سجّل برقم جوالك ونوصّلك رمز تحقق',
                style: QText.caption.copyWith(fontSize: 15),
              ),
              const SizedBox(height: 28),
              Row(
                children: [
                  Expanded(
                    child: _PhoneField(controller: _phone, onChanged: (_) => setState(() {})),
                  ),
                  const SizedBox(width: 10),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(QRadius.md),
                      border: Border.all(color: QColors.border, width: 1.5),
                    ),
                    // من غير QLtr الـ bidi بيقلب «+966» فيبقى «966+».
                    child: QLtr(
                      child: Text('+966', style: QText.num(size: 15, weight: FontWeight.w700)),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: QButton(
                  label: _sending ? 'جاري الإرسال…' : 'إرسال الرمز',
                  enabled: _valid && !_sending,
                  leading: _sending
                      ? SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2, color: QColors.ink),
                        )
                      : null,
                  onPressed: _sendCode,
                ),
              ),
              const SizedBox(height: 22),
              const _OrDivider(),
              const SizedBox(height: 22),
              SizedBox(
                width: double.infinity,
                child: QButton(
                  label: 'تسجيل عبر Apple',
                  style: QButtonStyle.outline,
                  leading: Icon(Icons.apple, size: 20, color: QColors.ink),
                  // مفيش social login في الـ API — الدخول بالجوال بس.
                  onPressed: () => _snack(context, 'قريباً'),
                ),
              ),
              const SizedBox(height: QSpace.gap),
              SizedBox(
                width: double.infinity,
                child: QButton(
                  label: 'تسجيل عبر Google',
                  style: QButtonStyle.outline,
                  leading: Icon(Icons.g_mobiledata_rounded, size: 24, color: QColors.ink),
                  onPressed: () => _snack(context, 'قريباً'),
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
        backgroundColor: QColors.inkSurface,
        behavior: SnackBarBehavior.floating,
        content: Text(
          message,
          style: TextStyle(
            fontFamily: 'Cairo',
            fontSize: 13.5,
            fontWeight: FontWeight.w700,
            color: QColors.brand,
          ),
        ),
      ),
    );
}

/// حقل الجوال — حد أصفر عريض والرقم دايمًا LTR.
class _PhoneField extends StatelessWidget {
  const _PhoneField({required this.controller, required this.onChanged});

  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final border = OutlineInputBorder(
      borderRadius: const BorderRadius.all(Radius.circular(QRadius.md)),
      borderSide: BorderSide(color: QColors.brand, width: 2),
    );

    return TextField(
      controller: controller,
      onChanged: onChanged,
      keyboardType: TextInputType.phone,
      textDirection: TextDirection.ltr,
      textAlign: TextAlign.left,
      maxLength: 9,
      // أرقام بس — عشان المسافة أو + أو - ماتاكلش من الـ 9 خانات وتعدّي شرط الصحة.
      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
      style: QText.num(size: 16, weight: FontWeight.w700),
      decoration: InputDecoration(
        counterText: '',
        hintText: '5X XXX XXXX',
        // من غير ده الـ hint بيتحاذى يمين والأرقام المكتوبة شمال.
        hintTextDirection: TextDirection.ltr,
        hintStyle: QText.num(size: 16, weight: FontWeight.w600, color: QColors.hint),
        border: border,
        enabledBorder: border,
        focusedBorder: border,
      ),
    );
  }
}

class _OrDivider extends StatelessWidget {
  const _OrDivider();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(child: Divider(color: QColors.line, thickness: 1)),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Text(
            'أو',
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: QColors.hint,
            ),
          ),
        ),
        Expanded(child: Divider(color: QColors.line, thickness: 1)),
      ],
    );
  }
}
