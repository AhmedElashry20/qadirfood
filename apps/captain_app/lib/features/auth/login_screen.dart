// شاشة ١: تسجيل الدخول بالجوال — POST /auth/otp/request.
//
// ══════════════════════════════════════════════════════════════════════════
//                     أرقام الكباتن الموجودة في الـ seed
// ══════════════════════════════════════════════════════════════════════════
//   • 0533333333 — كابتن أونلاين وعنده رحلات في السجل.
//   • 0544444444 — كابتن أوفلاين.
// الرمز بيرجع في رد الطلب نفسه (`devCode`) لأن مافيش مزوّد SMS متوصّل في
// التطوير — شاشة OTP بتعرضه كتلميح قابل للضغط.
//
// ⚠️ أي رقم تاني هيتعامل كـ«كابتن جديد» وهيروح شاشة التسجيل (لازم رقم هوية).
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../providers/auth_provider.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _phone = TextEditingController();
  final _focus = FocusNode();
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _focus.addListener(() => setState(() {}));
    _phone.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _phone.dispose();
    _focus.dispose();
    super.dispose();
  }

  /// الرقم لازم يبقى ١٠ أرقام بصيغة السيرفر «05XXXXXXXX».
  bool get _valid => AuthNotifier.normalizePhone(_phone.text).length == 10;

  Future<void> _submit() async {
    if (_sending || !_valid) return;
    setState(() => _sending = true);

    try {
      await ref.read(authProvider.notifier).requestOtp(_phone.text);
      if (!context.mounted) return;
      context.push(QRoutes.otp);
    } on ApiException catch (e) {
      if (!context.mounted) return;
      _snack(context, e.message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  /// «كابتن جديد» — بنخزّن الرقم المكتوب (لو صالح) عشان شاشة التسجيل تلاقيه جاهز.
  void _goRegister() {
    if (_valid) ref.read(authProvider.notifier).setPhone(_phone.text);
    context.push(QRoutes.register);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QColors.inkSurface,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 32),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // ── الشعار ──
                Center(
                  child: Container(
                    width: 84,
                    height: 84,
                    decoration: BoxDecoration(
                      color: QColors.brand,
                      borderRadius: BorderRadius.circular(QRadius.sheet),
                    ),
                    alignment: Alignment.center,
                    child: const Text('🛵', style: TextStyle(fontSize: 40)),
                  ),
                ),
                const SizedBox(height: 22),

                const Text(
                  'بوابة الكباتن',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 28,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'سجّل دخولك وابدأ التوصيل واكسب',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: QColors.darkSub,
                  ),
                ),
                const SizedBox(height: 30),

                // ── الجوال ──
                Row(
                  children: [
                    Expanded(
                      child: Container(
                        height: QSpace.tapTarget,
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        decoration: BoxDecoration(
                          color: QColors.darkField,
                          borderRadius: BorderRadius.circular(QRadius.md),
                          border: Border.all(
                            color: _focus.hasFocus ? QColors.brand : QColors.inkLine,
                            width: _focus.hasFocus ? 2 : 1.5,
                          ),
                        ),
                        alignment: Alignment.center,
                        // الأرقام دايماً من الشمال لليمين حتى في واجهة عربية.
                        child: Directionality(
                          textDirection: TextDirection.ltr,
                          child: TextField(
                            controller: _phone,
                            focusNode: _focus,
                            keyboardType: TextInputType.phone,
                            inputFormatters: [
                              FilteringTextInputFormatter.digitsOnly,
                              LengthLimitingTextInputFormatter(10),
                            ],
                            onSubmitted: (_) => _submit(),
                            style: QText.num(size: 17, color: Colors.white),
                            decoration: InputDecoration(
                              isDense: true,
                              filled: false,
                              border: InputBorder.none,
                              enabledBorder: InputBorder.none,
                              focusedBorder: InputBorder.none,
                              contentPadding: EdgeInsets.zero,
                              hintText: '5X XXX XXXX',
                              hintStyle: QText.num(
                                size: 17,
                                weight: FontWeight.w600,
                                color: QColors.darkFooter,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Container(
                      height: QSpace.tapTarget,
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      decoration: BoxDecoration(
                        color: QColors.darkField,
                        borderRadius: BorderRadius.circular(QRadius.md),
                        border: Border.all(color: QColors.inkLine, width: 1.5),
                      ),
                      alignment: Alignment.center,
                      child: Text('+966', style: QText.num(size: 16, color: Colors.white)),
                    ),
                  ],
                ),
                const SizedBox(height: 18),

                // ── دخول ──
                _BrandButton(label: 'دخول', loading: _sending, onTap: _valid ? _submit : null),
                const SizedBox(height: 20),

                // ── كابتن جديد ──
                Center(
                  child: GestureDetector(
                    onTap: _goRegister,
                    behavior: HitTestBehavior.opaque,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Text.rich(
                        TextSpan(
                          text: 'كابتن جديد؟ ',
                          style: TextStyle(
                            fontFamily: 'Cairo',
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: QColors.darkSub,
                          ),
                          children: [
                            TextSpan(
                              text: 'سجّل الآن',
                              style: TextStyle(
                                fontFamily: 'Cairo',
                                fontSize: 14,
                                fontWeight: FontWeight.w900,
                                color: QColors.brand,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 26),

                Text(
                  'بالتسجيل أنت توافق على اتفاقية الكباتن وسياسة الخصوصية',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: QColors.darkFooter,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// الزرار الأصفر الأساسي في الشاشات الداكنة.
/// (QButton بيستخدم راديوس ونصوص مختلفة عن شاشات الدخول في التصميم.)
class _BrandButton extends StatelessWidget {
  const _BrandButton({required this.label, this.onTap, this.loading = false});

  final String label;
  final VoidCallback? onTap;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final enabled = onTap != null && !loading;

    return Material(
      color: enabled ? QColors.brand : QColors.inkLine,
      borderRadius: BorderRadius.circular(QRadius.lg),
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(QRadius.lg),
        child: Container(
          height: QSpace.tapTarget,
          alignment: Alignment.center,
          child: loading
              ? SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2.4, color: QColors.ink),
                )
              : Text(
                  label,
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: enabled ? QColors.ink : QColors.darkFooter,
                  ),
                ),
        ),
      ),
    );
  }
}

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
