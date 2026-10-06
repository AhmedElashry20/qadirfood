// شاشة ١: سبلاش — بعد الأنيميشن بنوجّه حسب التوكن المحفوظ.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/router.dart';
import '../../core/theme.dart';
import '../../providers/auth_provider.dart';

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer(const Duration(milliseconds: 1800), () {
      if (!mounted) return;
      // التوكن محفوظ؟ ندخل على الرئيسية على طول، وإلا نبدأ من شاشة التعريف.
      final isLoggedIn = ref.read(authProvider).isLoggedIn;
      context.go(isLoggedIn ? QRoutes.home : QRoutes.intro);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QColors.inkSurface,
      body: const SafeArea(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Image(
                image: AssetImage('assets/images/qadir-logo.png'),
                width: 260,
              ),
              SizedBox(height: 8),
              Text(
                'FOOD',
                style: TextStyle(
                  fontFamily: 'Outfit',
                  fontSize: 22,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 6,
                  color: Color(0xFFB8912F),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
