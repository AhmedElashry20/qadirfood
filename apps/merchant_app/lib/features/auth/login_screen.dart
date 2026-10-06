// شاشة ١: تسجيل الدخول — إيميل/جوال + كلمة مرور + نسيت كلمة المرور + اختيار الفرع لو متعدد
// «بوابة الشركاء» — شاشة داكنة بالكامل. لو الحساب على أكتر من فرع، السيرفر
// بيرجّع الفروع من غير توكن فبتظهر شرائح الاختيار وبيضغط «دخول» تاني.
//
// حسابات الاختبار المزروعة (كلمة السر واحدة: 123456):
//   manager@aseel.sa / 123456  → فرعين، بيظهر اختيار الفرع
//   cashier@aseel.sa / 123456  → فرع واحد، بيدخل على طول
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/router.dart';
import '../../core/socket_service.dart';
import '../../core/theme.dart';
import '../../data/merchant_repository.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/common.dart';

/// خلفية حقول الإدخال فوق الأسود — مستخدمة في الشاشة دي بس فمش في QColors.
const _kDarkField = Color(0xFF262626);

/// نص الشرائح غير المختارة فوق الأسود.
const _kDimText = Color(0xFFCFCFCF);

/// نص الفوتر (رقم الإصدار).
const _kFooterText = Color(0xFF6E6E6E);

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _identifier = TextEditingController();
  final _password = TextEditingController();

  String? _branchId;
  bool _loading = false;

  @override
  void dispose() {
    _identifier.dispose();
    _password.dispose();
    super.dispose();
  }

  void _snack(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          backgroundColor: QColors.inkSurface,
          content: Text(message, style: QText.body.copyWith(color: QColors.brand)),
        ),
      );
  }

  Future<void> _submit() async {
    final identifier = _identifier.text.trim();
    final password = _password.text;

    if (identifier.isEmpty || password.isEmpty) {
      _snack('اكتب رقم المنشأة وكلمة المرور');
      return;
    }

    if (ref.read(authProvider).needsBranch && _branchId == null) {
      _snack('اختار الفرع الأول');
      return;
    }

    setState(() => _loading = true);
    try {
      await ref.read(authProvider.notifier).login(
            identifier: identifier,
            password: password,
            branchId: _branchId,
          );
      // داخل State بنستخدم `mounted` بتاعة الـ State بدل context.mounted
      // (نفس الضمانة، والـ analyzer بيطلبها كده).
      if (!mounted) return;

      // لو السيرفر طلب اختيار فرع، الشرائح بتظهر لوحدها من الـ watch تحت.
      if (!ref.read(authProvider).isLoggedIn) return;

      ref.read(socketServiceProvider).connect();
      if (!mounted) return;
      context.go(QRoutes.orders);
    } on ApiException catch (e) {
      if (!mounted) return;
      _snack(e.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);

    return Scaffold(
      backgroundColor: QColors.inkSurface,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 28),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const SizedBox(height: 40),
                    _logo(),
                    const SizedBox(height: 30),
                    _DarkField(
                      label: 'رقم المنشأة أو البريد',
                      hint: 'manager@aseel.sa',
                      controller: _identifier,
                      keyboardType: TextInputType.emailAddress,
                      textDirection: TextDirection.ltr,
                    ),
                    const SizedBox(height: 16),
                    _DarkField(
                      label: 'كلمة المرور',
                      hint: '••••••',
                      controller: _password,
                      obscure: true,
                    ),
                    if (auth.needsBranch && auth.branches.isNotEmpty) ...[
                      const SizedBox(height: 18),
                      _branchPicker(auth.branches),
                    ],
                    const SizedBox(height: 24),
                    _submitButton(),
                    const SizedBox(height: 20),
                    _footerLinks(),
                    const SizedBox(height: 34),
                    _version(),
                    const SizedBox(height: 12),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _logo() => Column(
        children: [
          Container(
            width: 84,
            height: 84,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: QColors.brand,
              borderRadius: BorderRadius.circular(24),
            ),
            child: const Text('🍔', style: TextStyle(fontSize: 40)),
          ),
          const SizedBox(height: 18),
          const Text(
            'بوابة الشركاء',
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
            'أدر مطعمك وطلباتك من مكان واحد',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: QColors.darkSub,
            ),
          ),
        ],
      );

  /// شرائح الفروع — بتظهر بس لما السيرفر يرجّع requiresBranchSelection.
  Widget _branchPicker(List<BranchOption> branches) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'الفرع (حساب متعدد الفروع)',
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: QColors.darkSub,
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final branch in branches)
                _BranchChip(
                  label: branch.nameAr,
                  selected: _branchId == branch.id,
                  onTap: () => setState(() => _branchId = branch.id),
                ),
            ],
          ),
        ],
      );

  Widget _submitButton() => Material(
        color: QColors.brand,
        borderRadius: BorderRadius.circular(QRadius.lg),
        child: InkWell(
          onTap: _loading ? null : _submit,
          borderRadius: BorderRadius.circular(QRadius.lg),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 16),
            alignment: Alignment.center,
            child: _loading
                ? SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2.4, color: QColors.ink),
                  )
                : Text(
                    'دخول',
                    style: TextStyle(
                      fontFamily: 'Cairo',
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: QColors.ink,
                    ),
                  ),
          ),
        ),
      );

  /// مافيش API لنسيان كلمة السر ولا للتسجيل كشريك — الاتنين بيوجّهوا لفريق قادر فود.
  Widget _footerLinks() => Center(
        child: GestureDetector(
          onTap: () => _snack('تواصل مع فريق قادر فود'),
          child: Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: 'نسيت كلمة المرور؟ · ',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: QColors.darkSub,
                  ),
                ),
                TextSpan(
                  text: 'انضم كشريك',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: QColors.brand,
                  ),
                ),
              ],
            ),
            textAlign: TextAlign.center,
          ),
        ),
      );

  Widget _version() => const Center(
        child: QLtr(
          child: Text(
            'Qadir Merchant · v3.1',
            style: TextStyle(
              fontFamily: 'Outfit',
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: _kFooterText,
            ),
          ),
        ),
      );
}

/// حقل إدخال داكن — QField مبنية للخلفية الفاتحة فمش صالحة للشاشة دي.
class _DarkField extends StatefulWidget {
  const _DarkField({
    required this.label,
    required this.hint,
    required this.controller,
    this.keyboardType,
    this.textDirection,
    this.obscure = false,
  });

  final String label;
  final String hint;
  final TextEditingController controller;
  final TextInputType? keyboardType;
  final TextDirection? textDirection;
  final bool obscure;

  @override
  State<_DarkField> createState() => _DarkFieldState();
}

class _DarkFieldState extends State<_DarkField> {
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _focus.addListener(_onFocusChange);
  }

  void _onFocusChange() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _focus.removeListener(_onFocusChange);
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final focused = _focus.hasFocus;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          widget.label,
          style: TextStyle(
            fontFamily: 'Cairo',
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: QColors.darkSub,
          ),
        ),
        const SizedBox(height: 8),
        Container(
          decoration: BoxDecoration(
            color: _kDarkField,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: focused ? QColors.brand : QColors.inkLine,
              width: focused ? 2 : 1.5,
            ),
          ),
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
          child: TextField(
            controller: widget.controller,
            focusNode: _focus,
            keyboardType: widget.keyboardType,
            textDirection: widget.textDirection,
            obscureText: widget.obscure,
            cursorColor: QColors.brand,
            style: const TextStyle(
              fontFamily: 'Outfit',
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
            decoration: InputDecoration(
              isDense: true,
              filled: false,
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
              contentPadding: EdgeInsets.zero,
              hintStyle: TextStyle(
                fontFamily: 'Outfit',
                fontSize: 15,
                fontWeight: FontWeight.w500,
                color: QColors.darkSub,
              ),
            ).copyWith(hintText: widget.hint),
          ),
        ),
      ],
    );
  }
}

/// شريحة فرع فوق خلفية داكنة — QChip بتستخدم inkSoft، والتصميم هنا عايز
/// إطار inkLine على خلفية #262626.
class _BranchChip extends StatelessWidget {
  const _BranchChip({required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(QRadius.pill),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? QColors.brand : _kDarkField,
          borderRadius: BorderRadius.circular(QRadius.pill),
          border: selected ? null : Border.all(color: QColors.inkLine, width: 1.5),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontFamily: 'Cairo',
            fontSize: 13.5,
            fontWeight: selected ? FontWeight.w800 : FontWeight.w700,
            color: selected ? QColors.ink : _kDimText,
          ),
        ),
      ),
    );
  }
}
