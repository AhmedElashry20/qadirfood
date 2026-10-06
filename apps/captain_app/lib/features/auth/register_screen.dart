// شاشة ٣: التسجيل ككابتن — بيانات شخصية + هوية وطنية.
//
// ══════════════════════════════════════════════════════════════════════════
//                   ليه الشاشة دي فيها حقل «رمز التحقق»؟
// ══════════════════════════════════════════════════════════════════════════
// السيرفر بيسجّل الكابتن بنفس نداء التحقق (`POST /auth/otp/verify`) بس بزيادة
// `nationalId` — مافيش endpoint تسجيل منفصل. والمشكلة إن الرمز **بيتحرق** في
// أول محاولة فاشلة (auth.service.ts بيعمل `consumed: true` قبل ما يتشيّك على
// الاسم ورقم الهوية)، يعني الرمز اللي جاي من شاشة OTP ميّت.
//
// عشان كده الشاشة بتطلب رمز جديد بزرار «إرسال الرمز» وبتستخدمه في التسجيل.
// لو الـ API اتعمله endpoint تسجيل مستقل يوماً ما، الحقل ده يتشال.
//
// ⚠️ نوع المركبة ورقم اللوحة **مابيتبعتوش للسيرفر**: VerifyOtpDto في
// src/auth/auth.module.ts فيه {phone, code, role, nationalId, fullName} وخلاص،
// والسيرفر بيعمل `captain: { create: { nationalId } }` بس — نوع المركبة بياخد
// الافتراضي MOTORCYCLE. بنجمّعهم في الواجهة عشان لما الـ API يقبلهم مانغيّرش
// الشاشة، وبنقول للكابتن كده صراحةً تحت الحقول.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/common.dart';

/// أنواع المركبات المعروضة — `wire` هي قيمة `VehicleType` في الـ schema
/// (prisma/schema.prisma) عشان تبقى جاهزة لما الـ API يقبل الحقل.
/// «دباب» مالوش قيمة مقابلة في الـ enum، فبنعتبره دراجة آلية.
const _vehicles = <({String label, String wire})>[
  (label: 'دراجة آلية', wire: 'MOTORCYCLE'),
  (label: 'سيارة', wire: 'CAR'),
  (label: 'دباب', wire: 'MOTORCYCLE'),
];

class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _name = TextEditingController();
  final _nationalId = TextEditingController();
  final _plate = TextEditingController();
  final _code = TextEditingController();

  int _vehicle = 0;
  bool _submitting = false;
  bool _sendingCode = false;

  /// رسالة السيرفر العربية — بتتعرض تحت الحقول مش في SnackBar.
  String? _error;

  @override
  void initState() {
    super.initState();
    for (final controller in [_name, _nationalId, _code]) {
      controller.addListener(() => setState(() {}));
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _nationalId.dispose();
    _plate.dispose();
    _code.dispose();
    super.dispose();
  }

  bool get _valid =>
      _name.text.trim().isNotEmpty &&
      _nationalId.text.trim().length == 10 &&
      _code.text.trim().length == 4;

  Future<void> _sendCode() async {
    final phone = ref.read(authProvider).phone;
    if (phone.isEmpty) {
      setState(() => _error = 'ارجع لشاشة الدخول واكتب رقم الجوال الأول');
      return;
    }

    setState(() {
      _sendingCode = true;
      _error = null;
    });

    try {
      await ref.read(authProvider.notifier).requestOtp(phone);
      if (!context.mounted) return;
      _snack(context, 'بعتنا رمز جديد على جوالك');
    } on ApiException catch (e) {
      if (!context.mounted) return;
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _sendingCode = false);
    }
  }

  Future<void> _submit() async {
    if (_submitting || !_valid) return;
    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ref.read(authProvider.notifier).register(
            code: _code.text,
            fullName: _name.text,
            nationalId: _nationalId.text,
            // مابيوصلوش للسيرفر لسه — شوف تعليق أول الملف.
            vehicleType: _vehicles[_vehicle].wire,
            plateNumber: _plate.text.trim().isEmpty ? null : _plate.text.trim(),
          );

      if (!context.mounted) return;
      context.go(QRoutes.documents);
    } on ApiException catch (e) {
      if (!context.mounted) return;
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final devCode = auth.devCode;

    return Scaffold(
      backgroundColor: QColors.inkSurface,
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
                padding: const EdgeInsets.fromLTRB(28, 20, 28, 32),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'كابتن جديد',
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
                        text: 'هنسجّلك على الرقم ',
                        style: TextStyle(
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
                                auth.phoneWithCode.isEmpty ? '—' : auth.phoneWithCode,
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
                    const SizedBox(height: 26),

                    _DarkField(
                      label: 'الاسم الكامل',
                      hint: 'زي ما هو في الهوية',
                      controller: _name,
                    ),
                    const SizedBox(height: 16),

                    _DarkField(
                      label: 'رقم الهوية / الإقامة',
                      hint: '1XXXXXXXXX',
                      controller: _nationalId,
                      numeric: true,
                      maxLength: 10,
                    ),
                    const SizedBox(height: 16),

                    // ── نوع المركبة ──
                    const _FieldLabel('نوع المركبة'),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        for (var i = 0; i < _vehicles.length; i++) ...[
                          if (i > 0) const SizedBox(width: 8),
                          QChip(
                            label: _vehicles[i].label,
                            selected: _vehicle == i,
                            onDark: true,
                            onTap: () => setState(() => _vehicle = i),
                          ),
                        ],
                      ],
                    ),
                    const SizedBox(height: 16),

                    _DarkField(
                      label: 'رقم اللوحة (اختياري)',
                      hint: 'أ ب ج 1234',
                      controller: _plate,
                    ),
                    const SizedBox(height: 10),
                    Text(
                      'نوع المركبة ورقم اللوحة لا يُحفظان بعد — الـ API لا يقبلهما في التسجيل.',
                      style: TextStyle(
                        fontFamily: 'Cairo',
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                        color: QColors.darkFooter,
                      ),
                    ),
                    const SizedBox(height: 22),

                    // ── رمز التحقق ──
                    _DarkField(
                      label: 'رمز التحقق',
                      hint: '••••',
                      controller: _code,
                      numeric: true,
                      maxLength: 4,
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        GestureDetector(
                          onTap: _sendingCode ? null : _sendCode,
                          behavior: HitTestBehavior.opaque,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 6),
                            child: Text(
                              _sendingCode ? 'جاري الإرسال…' : 'إرسال الرمز',
                              style: TextStyle(
                                fontFamily: 'Cairo',
                                fontSize: 13.5,
                                fontWeight: FontWeight.w900,
                                color: QColors.brand,
                              ),
                            ),
                          ),
                        ),
                        const Spacer(),
                        if (devCode != null)
                          GestureDetector(
                            onTap: () {
                              _code.text = devCode;
                              _code.selection = TextSelection.collapsed(offset: devCode.length);
                            },
                            behavior: HitTestBehavior.opaque,
                            child: Padding(
                              padding: const EdgeInsets.symmetric(vertical: 6),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Text(
                                    'رمز التطوير: ',
                                    style: TextStyle(
                                      fontFamily: 'Cairo',
                                      fontSize: 12.5,
                                      fontWeight: FontWeight.w700,
                                      color: QColors.darkSub,
                                    ),
                                  ),
                                  Text(devCode, style: QText.num(size: 13.5, color: QColors.brand)),
                                ],
                              ),
                            ),
                          ),
                      ],
                    ),

                    if (_error != null) ...[
                      const SizedBox(height: 14),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        decoration: BoxDecoration(
                          color: QColors.darkField,
                          borderRadius: BorderRadius.circular(QRadius.md),
                          border: Border.all(color: QColors.dangerOnDark, width: 1.5),
                        ),
                        child: Text(
                          _error!,
                          style: TextStyle(
                            fontFamily: 'Cairo',
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: QColors.dangerOnDark,
                          ),
                        ),
                      ),
                    ],

                    const SizedBox(height: 22),
                    _SubmitButton(
                      label: 'إنشاء الحساب',
                      loading: _submitting,
                      onTap: _valid ? _submit : null,
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

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Text(
        text,
        style: TextStyle(
          fontFamily: 'Cairo',
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: QColors.darkSub,
        ),
      );
}

/// حقل إدخال في الوضع الداكن — QField أبيض فمابينفعش هنا.
class _DarkField extends StatefulWidget {
  const _DarkField({
    required this.label,
    required this.hint,
    required this.controller,
    this.numeric = false,
    this.maxLength,
  });

  final String label;
  final String hint;
  final TextEditingController controller;

  /// أرقام بس + اتجاه LTR + خط Outfit.
  final bool numeric;
  final int? maxLength;

  @override
  State<_DarkField> createState() => _DarkFieldState();
}

class _DarkFieldState extends State<_DarkField> {
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _focus.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final field = TextField(
      controller: widget.controller,
      focusNode: _focus,
      keyboardType: widget.numeric ? TextInputType.number : TextInputType.name,
      inputFormatters: [
        if (widget.numeric) FilteringTextInputFormatter.digitsOnly,
        if (widget.maxLength != null) LengthLimitingTextInputFormatter(widget.maxLength),
      ],
      style: widget.numeric
          ? QText.num(size: 16, color: Colors.white)
          : const TextStyle(
              fontFamily: 'Cairo',
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: Colors.white,
            ),
      decoration: InputDecoration(
        isDense: true,
        filled: false,
        border: InputBorder.none,
        enabledBorder: InputBorder.none,
        focusedBorder: InputBorder.none,
        contentPadding: EdgeInsets.zero,
        counterText: '',
        hintText: widget.hint,
        hintStyle: widget.numeric
            ? QText.num(size: 16, weight: FontWeight.w600, color: QColors.darkFooter)
            : TextStyle(
                fontFamily: 'Cairo',
                fontSize: 15,
                fontWeight: FontWeight.w600,
                color: QColors.darkFooter,
              ),
      ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _FieldLabel(widget.label),
        const SizedBox(height: 8),
        Container(
          height: QSpace.tapTarget,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          alignment: Alignment.centerRight,
          decoration: BoxDecoration(
            color: QColors.darkField,
            borderRadius: BorderRadius.circular(QRadius.md),
            border: Border.all(
              color: _focus.hasFocus ? QColors.brand : QColors.inkLine,
              width: _focus.hasFocus ? 2 : 1.5,
            ),
          ),
          child: widget.numeric
              ? Directionality(textDirection: TextDirection.ltr, child: field)
              : field,
        ),
      ],
    );
  }
}

class _SubmitButton extends StatelessWidget {
  const _SubmitButton({required this.label, this.onTap, this.loading = false});

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
