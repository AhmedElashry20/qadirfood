// شاشة ٦: حسابك تحت المراجعة.
//
// ⚠️ مافيش endpoint للمراجعة ولا للوثائق. الحاجة الوحيدة اللي نقدر نقراها هي
// `captain.isVerified` الجاي جوّه صف الكابتن المرفق مع أي طلب
// ([CaptainRepository.me]) — والصف ده نفسه مابيوصلش غير لو الكابتن عنده طلب
// واحد على الأقل. يعني «تحديث الحالة» ممكن يرجّع خطأ واضح بدل نتيجة، وده
// السلوك الصح: مابنقولش «اتفعّل» من غير ما نعرف.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../providers/auth_provider.dart';
import '../../providers/captain_status_provider.dart';

class PendingReviewScreen extends ConsumerStatefulWidget {
  const PendingReviewScreen({super.key});

  @override
  ConsumerState<PendingReviewScreen> createState() => _PendingReviewScreenState();
}

class _PendingReviewScreenState extends ConsumerState<PendingReviewScreen> {
  bool _checking = false;

  /// بيعيد قراءة بيانات الكابتن — لو اتفعّل بنوديه الرئيسية.
  Future<void> _refresh() async {
    if (_checking) return;
    setState(() => _checking = true);

    try {
      ref.invalidate(captainProvider);
      final captain = await ref.read(captainProvider.future);
      if (!context.mounted) return;

      if (captain.isVerified) {
        context.go(QRoutes.home);
        return;
      }
      _snack(context, 'لسه تحت المراجعة — هنبعتلك إشعار أول ما يتفعّل');
    } on ApiException catch (e) {
      if (!context.mounted) return;
      _snack(context, e.message);
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  Future<void> _logout() async {
    await ref.read(authProvider.notifier).logout();
    if (!context.mounted) return;
    context.go(QRoutes.login);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QColors.ink,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Center(child: Text('⏳', style: TextStyle(fontSize: 64))),
                const SizedBox(height: 22),
                const Text(
                  'حسابك تحت المراجعة',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 24,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 10),
                const Text(
                  'عادة بتاخد 24 ساعة — هنبعتلك إشعار أول ما يتفعّل',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 14.5,
                    fontWeight: FontWeight.w600,
                    color: QColors.darkSub,
                    height: 1.6,
                  ),
                ),
                const SizedBox(height: 30),
                _OutlineOnDarkButton(
                  label: 'تحديث الحالة',
                  loading: _checking,
                  onTap: _refresh,
                ),
                const SizedBox(height: 10),
                TextButton(
                  onPressed: _logout,
                  child: const Text(
                    'تسجيل الخروج',
                    style: TextStyle(
                      fontFamily: 'Cairo',
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: QColors.darkFooter,
                    ),
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

/// زرار محدّد فوق خلفية سودا — QButtonStyle.outline خلفيته بيضا فمابينفعش هنا.
class _OutlineOnDarkButton extends StatelessWidget {
  const _OutlineOnDarkButton({required this.label, this.onTap, this.loading = false});

  final String label;
  final VoidCallback? onTap;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(QRadius.lg),
      child: InkWell(
        onTap: loading ? null : onTap,
        borderRadius: BorderRadius.circular(QRadius.lg),
        child: Container(
          height: QSpace.tapTarget,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(QRadius.lg),
            border: Border.all(color: QColors.inkLine, width: 1.5),
          ),
          child: loading
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2.4, color: QColors.brand),
                )
              : Text(
                  label,
                  style: const TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
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
        backgroundColor: QColors.inkSoft,
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
