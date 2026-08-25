// شاشة ٥: تأكيد OTP — POST /auth/otp/verify
// مافيش مزوّد SMS في التطوير: السيرفر بيرجّع الرمز في رد الطلب،
// فبنعرضه كتلميح تحت الخانات (الضغط عليه بيملّي الخانات لوحدها).
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/common.dart';

const _kOtpLength = 4;
const _kResendSeconds = 24;

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

  String get _digits => _code.text;
  bool get _complete => _digits.length == _kOtpLength;

  @override
  void initState() {
    super.initState();
    _focus.addListener(() => setState(() {}));
    _startTimer();
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
    setState(() {});
  }

  /// إعادة طلب الرمز من السيرفر — بيحدّث `devCode` في الحالة كمان.
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

  /// الرقم اللي بيدخل لأول مرة: السيرفر بيرفض من غير اسم، والـ notifier بيرفع
  /// `needsName` ويعيد رمي الخطأ — ساعتها بنودّي المستخدم لشاشة إكمال البيانات
  /// ومعاها نفس الرمز عشان تعيد التحقق بالاسم.
  Future<void> _confirm() async {
    if (_verifying) return;
    setState(() => _verifying = true);

    final code = _digits;
    try {
      await ref.read(authProvider.notifier).verifyOtp(code);
      if (!context.mounted) return;
      context.go(QRoutes.home);
    } on ApiException catch (e) {
      if (!context.mounted) return;

      if (ref.read(authProvider).needsName) {
        context.push(QRoutes.completeProfile, extra: code);
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
    final phone = auth.phoneWithCode;
    final devCode = auth.devCode;

    return Scaffold(
      backgroundColor: QColors.surface,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(QSpace.screenH),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const QBackButton(),
              const SizedBox(height: 24),
              const Text('أدخل رمز التحقق', style: QText.display),
              const SizedBox(height: 8),
              Text.rich(
                TextSpan(
                  text: 'أرسلنا رمز من 4 أرقام إلى ',
                  style: QText.caption.copyWith(fontSize: 15),
                  children: [
                    WidgetSpan(
                      alignment: PlaceholderAlignment.middle,
                      child: Directionality(
                        textDirection: TextDirection.ltr,
                        child: Text(
                          phone,
                          style: QText.num(size: 15, weight: FontWeight.w700),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 32),
              _OtpBoxes(
                code: _digits,
                focus: _focus,
                controller: _code,
                onChanged: () => setState(() {}),
              ),
              if (devCode != null) ...[
                const SizedBox(height: 14),
                Center(
                  child: _DevCodeHint(code: devCode, onTap: () => _fillCode(devCode)),
                ),
              ],
              const SizedBox(height: 22),
              Center(
                child: _remaining > 0
                    ? Text.rich(
                        TextSpan(
                          text: 'إعادة الإرسال خلال ',
                          style: QText.caption.copyWith(fontSize: 13.5),
                          children: [
                            TextSpan(
                              text: _countdown,
                              style: QText.num(
                                size: 13.5,
                                weight: FontWeight.w700,
                                color: QColors.textMuted,
                              ),
                            ),
                          ],
                        ),
                      )
                    : InkWell(
                        onTap: _resend,
                        borderRadius: BorderRadius.circular(QRadius.sm),
                        child: const Padding(
                          padding: EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                          child: Text(
                            'إعادة إرسال الرمز',
                            style: TextStyle(
                              fontFamily: 'Cairo',
                              fontSize: 13.5,
                              fontWeight: FontWeight.w800,
                              color: QColors.gold,
                            ),
                          ),
                        ),
                      ),
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                child: QButton(
                  label: _verifying ? 'جاري التحقق…' : 'تأكيد',
                  enabled: _complete && !_verifying,
                  leading: _verifying
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2, color: QColors.ink),
                        )
                      : null,
                  onPressed: _confirm,
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

/// تلميح رمز التطوير — السيرفر بيرجّع الرمز في الرد لأن مافيش SMS.
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
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: QColors.tint,
          borderRadius: BorderRadius.circular(QRadius.pill),
          border: Border.all(color: QColors.tintBorder),
        ),
        child: Text.rich(
          TextSpan(
            text: 'رمز التطوير: ',
            style: const TextStyle(
              fontFamily: 'Cairo',
              fontSize: 12.5,
              fontWeight: FontWeight.w700,
              color: QColors.goldDeep,
            ),
            children: [
              TextSpan(
                text: code,
                style: QText.num(size: 13, weight: FontWeight.w800, color: QColors.goldDeep),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// خانات الرمز: حقل مخفي واحد وراها بيمسك الكيبورد.
class _OtpBoxes extends StatelessWidget {
  const _OtpBoxes({
    required this.code,
    required this.focus,
    required this.controller,
    required this.onChanged,
  });

  final String code;
  final FocusNode focus;
  final TextEditingController controller;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    // مؤشر الكتابة الحالي — لو الرمز اكتمل مفيش خانة مضيّة.
    final cursor = code.length;

    return Stack(
      alignment: Alignment.center,
      children: [
        // الحقل الحقيقي — شفاف تمامًا وتحت الخانات، والضغط بيروح للـ GestureDetector فوقه.
        SizedBox(
          width: double.infinity,
          height: 72,
          child: Opacity(
            opacity: 0,
            child: TextField(
              controller: controller,
              focusNode: focus,
              autofocus: true,
              keyboardType: TextInputType.number,
              maxLength: _kOtpLength,
              showCursor: false,
              cursorColor: Colors.transparent,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              onChanged: (_) => onChanged(),
              decoration: const InputDecoration(counterText: ''),
            ),
          ),
        ),
        GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: () => focus.requestFocus(),
          child: Directionality(
            textDirection: TextDirection.ltr,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 0; i < _kOtpLength; i++) ...[
                  if (i > 0) const SizedBox(width: 14),
                  _OtpBox(
                    digit: i < code.length ? code[i] : '',
                    active: focus.hasFocus && i == cursor,
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
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
        color: active ? QColors.tintSoft : const Color(0xFFF7F5EE),
        borderRadius: BorderRadius.circular(QRadius.lg),
        border: active ? Border.all(color: QColors.brand, width: 2) : null,
      ),
      child: Text(digit, style: QText.num(size: 28, weight: FontWeight.w800)),
    );
  }
}
