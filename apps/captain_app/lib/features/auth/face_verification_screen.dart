// شاشة ٥: التحقق بالوجه (اشتراط الهيئة) — كاميرا + سيلفي.
//
// ══════════════════════════════════════════════════════════════════════════
//                    ⚠️ الشاشة دي **stub بالكامل** عن قصد
// ══════════════════════════════════════════════════════════════════════════
// العمود `faceVerifiedAt` موجود في جدول `captains`، بس **مافيش أي مسار في الـ
// API بيكتب فيه** ولا فيه رفع صور ولا خدمة تحقق. وكمان مافيش حزمة كاميرا في
// pubspec.yaml.
//
// سايبين المسار (`QRoutes.face`) موجود عشان أي تنقّل ليه مايكسرش، بس الشاشة
// بتقول الحقيقة بدل ما تعمل كاميرا وهمية وتدّي إحساس زايف إن التحقق تم.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';

class FaceVerificationScreen extends StatelessWidget {
  const FaceVerificationScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QColors.inkSurface,
      body: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Center(child: Text('🪞', style: TextStyle(fontSize: 64))),
                const SizedBox(height: 22),
                const Text(
                  'التحقق بالوجه',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 24,
                    fontWeight: FontWeight.w900,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  'تحتاج هذه الميزة ربط كاميرا وتحقّقاً في الـ API',
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
                Material(
                  color: Colors.transparent,
                  borderRadius: BorderRadius.circular(QRadius.lg),
                  child: InkWell(
                    onTap: () => context.pop(),
                    borderRadius: BorderRadius.circular(QRadius.lg),
                    child: Container(
                      height: QSpace.tapTarget,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(QRadius.lg),
                        border: Border.all(color: QColors.inkLine, width: 1.5),
                      ),
                      child: const Text(
                        'رجوع',
                        style: TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                        ),
                      ),
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
