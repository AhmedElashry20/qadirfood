// شاشة ٢: تأكيد رمز OTP — POST /auth/otp/verify.
//
// مافيش مزوّد SMS في التطوير: السيرفر بيرجّع الرمز في رد `otp/request`،
// فبنعرضه كتلميح تحت الخانات (الضغط عليه بيملّي الخانات لوحدها).
//
// ⚠️ الكابتن الجديد: أول تحقق بيرجع 400 («الاسم مطلوب للتسجيل لأول مرة» أو
// «رقم الهوية مطلوب لتسجيل كابتن جديد») لأن تسجيل كابتن محتاج رقم هوية.
// ساعتها بنودّيه شاشة التسجيل. خد بالك إن **السيرفر بيحرق الرمز في المحاولة دي**
// (بيعمل consumed: true قبل ما يتشيّك على البيانات) — فشاشة التسجيل بتطلب رمز
// جديد، مابتعتمدش على الرمز ده.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/router.dart';
import '../../core/socket_service.dart';
import '../../core/theme.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/common.dart';

const _kOtpLength = 4;
const _kResendSeconds = 30;

/// خلفية خانة الرمز — اللون ده مش في نظام التصميم، مخصوص لخانات الـ OTP.
const _kOtpBox = Color(0xFF2A2A2A);

class OtpScreen extends ConsumerStatefulWidget {
  const OtpScreen({super.key});

  @override
  ConsumerState<OtpScreen> createState() => _OtpScreenState();
}

class _OtpScreenState extends ConsumerState<OtpScreen> {
  final _code = TextEditingController();
  final _focus = FocusNode();

  Timer? _timer;
  int _remaining = _kResendSeconds;
  bool _verifying = false;

  bool get _complete => _code.text.length == _kOtpLength;

  @override
  void initState() {
    super.initState();
    _code.addListener(() => setState(() {}));
    _focus.addListener(() => setState(() {}));
    _startTimer();
    WidgetsBinding.instance.addPostFrameCallback((_) => _focus.requestFocus());
  }

  @override
  void dispose() {
    _timer?.cancel();
    _code.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _startTimer() {
    _timer?.cancel();
    setState(() => _remaining = _kResendSeconds);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return;
      if (_remaining <= 1) {
        t.cancel();
        setState(() => _remaining = 0);
      } else {
        setState(() => _remaining--);
      }
    });
  }

  void _fillCode(String code) {
    _code.text = code;
    _code.selection = TextSelection.collapsed(offset: code.length);
  }

  Future<void> _resend() async {
    final phone = ref.read(authProvider).phone;
    try {
      await ref.read(authProvider.notifier).requestOtp(phone);
      if (!context.mounted) return;
      _startTimer();
    } on ApiException catch (e) {
      if (!context.mounted) return;
      _snack(context, e.message);
    }
  }

  Future<void> _confirm() async {
    if (_verifying || !_complete) return;
    setState(() => _verifying = true);

    try {
      await ref.read(authProvider.notifier).verifyOtp(_code.text);
      if (!context.mounted) return;

      // الـ notifier بيفتح السوكيت جوّه `_applySession`؛ النداء ده تأكيد
      // (connect بيرجع من غير ما يعمل حاجة لو الاتصال مفتوح).
      ref.read(socketServiceProvider).connect();
      context.go(QRoutes.home);
    } on ApiException catch (e) {
      if (!context.mounted) return;

      // 400 = الرقم جديد ومحتاج تسجيل كامل (اسم + رقم هوية).
      if (ref.read(authProvider).needsRegistration) {
        context.push(QRoutes.register);
        return;
      }
      _snack(context, e.message);
    } finally {
      if (mounted) setState(() => _verifying = false);
    }
  }

  String get _countdown {
    final m = (_remaining ~/ 60).toString().padLeft(2, '0');
    final s = (_remaining % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final devCode = auth.devCode;

    return Scaffold(
      backgroundColor: QColors.ink,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
              child: QBackButton(onDark: true, onTap: () => context.pop()),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'أدخل رمز التحقق',
                      style: TextStyle(
                        fontFamily: 'Cairo',
                        fontSize: 26,
                        fontWeight: FontWeight.w900,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text.rich(
                      TextSpan(
                        text: 'بعتنا رمز من ٤ أرقام على ',
                        style: const TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 14.5,
                          fontWeight: FontWeight.w600,
                          color: QColors.darkSub,
                        ),
                        children: [
                          WidgetSpan(
                            alignment: PlaceholderAlignment.middle,
                            child: QLtr(
                              child: Text(
                                auth.phoneWithCode,
                                style: QText.num(
                                  size: 14.5,
                                  weight: FontWeight.w700,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 28),

                    // ── خانات الرمز ──
                    // حقل شفاف فوق الخانات هو اللي بياخد الإدخال فعلاً، والخانات
                    // بتعرض حروفه. الضغط في أي مكان بيفتح الكيبورد.
                    Stack(
                      alignment: Alignment.center,
                      children: [
                        _OtpBoxes(
                          code: _code.text,
                          focused: _focus.hasFocus,
                          onTap: () => _focus.requestFocus(),
                        ),
                        SizedBox(
                          height: 72,
                          child: TextField(
                            controller: _code,
                            focusNode: _focus,
                            keyboardType: TextInputType.number,
                            inputFormatters: [
                              FilteringTextInputFormatter.digitsOnly,
                              LengthLimitingTextInputFormatter(_kOtpLength),
                            ],
                            showCursor: false,
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: Colors.transparent, fontSize: 1),
                            decoration: const InputDecoration(
                              counterText: '',
                              filled: false,
                              border: InputBorder.none,
                              enabledBorder: InputBorder.none,
                              focusedBorder: InputBorder.none,
                              contentPadding: EdgeInsets.zero,
                            ),
                            // ٤ أرقام = تأكيد تلقائي، الكابتن مش محتاج يضغط زرار.
                            onChanged: (value) {
                              if (value.length == _kOtpLength) _confirm();
                            },
                          ),
                        ),
                      ],
                    ),

                    if (devCode != null) ...[
                      const SizedBox(height: 16),
                      Center(child: _DevCodeHint(code: devCode, onTap: () => _fillCode(devCode))),
                    ],

                    const SizedBox(height: 22),
                    Center(
                      child: _remaining > 0
                          ? Text.rich(
                              TextSpan(
                                text: 'إعادة الإرسال خلال ',
                                style: const TextStyle(
                                  fontFamily: 'Cairo',
                                  fontSize: 13.5,
                                  fontWeight: FontWeight.w600,
                                  color: QColors.darkFooter,
                                ),
                                children: [
                                  TextSpan(
                                    text: _countdown,
                                    style: QText.num(
                                      size: 13.5,
                                      weight: FontWeight.w700,
                                      color: QColors.darkSub,
                                    ),
                                  ),
                                ],
                              ),
                            )
                          : GestureDetector(
                              onTap: _resend,
                              behavior: HitTestBehavior.opaque,
                              child: const Padding(
                                padding: EdgeInsets.symmetric(vertical: 6, horizontal: 12),
                                child: Text(
                                  'إعادة إرسال الرمز',
                                  style: TextStyle(
                                    fontFamily: 'Cairo',
                                    fontSize: 14,
                                    fontWeight: FontWeight.w900,
                                    color: QColors.brand,
                                  ),
                                ),
                              ),
                            ),
                    ),
                    const SizedBox(height: 26),

                    _ConfirmButton(
                      label: 'تأكيد',
                      loading: _verifying,
                      onTap: _complete ? _confirm : null,
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// خانات الرمز — TextField مخفي بياخد الإدخال والخانات بتعرضه.
class _OtpBoxes extends StatelessWidget {
  const _OtpBoxes({required this.code, required this.focused, required this.onTap});

  final String code;
  final bool focused;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: QLtr(
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            for (var i = 0; i < _kOtpLength; i++)
              _OtpBox(
                digit: i < code.length ? code[i] : '',
                // الخانة النشطة = اللي الدور عليها والحقل شغّال.
                active: focused && i == code.length.clamp(0, _kOtpLength - 1),
              ),
          ],
        ),
      ),
    );
  }
}

class _OtpBox extends StatelessWidget {
  const _OtpBox({required this.digit, required this.active});

  final String digit;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 64,
      height: 72,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: active ? QColors.darkField : _kOtpBox,
        borderRadius: BorderRadius.circular(QRadius.lg),
        border: active ? Border.all(color: QColors.brand, width: 2) : null,
      ),
      child: Text(digit, style: QText.num(size: 26, color: Colors.white)),
    );
  }
}

/// تلميح رمز التطوير — بيظهر لأن السيرفر بيرجّع الرمز في الرد (مافيش SMS).
class _DevCodeHint extends StatelessWidget {
  const _DevCodeHint({required this.code, required this.onTap});

  final String code;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(QRadius.pill),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: QColors.darkField,
          borderRadius: BorderRadius.circular(QRadius.pill),
          border: Border.all(color: QColors.inkLine, width: 1.5),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'رمز التطوير: ',
              style: TextStyle(
                fontFamily: 'Cairo',
                fontSize: 12.5,
                fontWeight: FontWeight.w700,
                color: QColors.darkSub,
              ),
            ),
            Text(code, style: QText.num(size: 13.5, color: QColors.brand)),
          ],
        ),
      ),
    );
  }
}

class _ConfirmButton extends StatelessWidget {
  const _ConfirmButton({required this.label, this.onTap, this.loading = false});

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
              ? const SizedBox(
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
