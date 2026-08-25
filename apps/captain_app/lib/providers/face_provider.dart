// التحقق اليومي بالوجه — بوابة الأونلاين.
//
// [faceTodayProvider] بيقرا `GET /face/me/today`: `verifiedToday` (بوابة الأونلاين)
// + آخر فحص + `biometricConfigured`/`provider` (اللي لسه stub — شوف
// models/face_check.dart). الرفع + الفحص خطوتين زي رفع الوثائق بالظبط:
//   ١) سيلفي على `POST /uploads` (folder=selfies) → رابط.
//   ٢) `POST /face/me/check` بالرابط → الفحص بحالته.
// بعد أي فحص بنعمل [refresh] عشان البوابة (والشاشة) تتحدّث فوراً.
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/captain_repository.dart';
import '../models/face_check.dart';

class FaceTodayNotifier extends AsyncNotifier<FaceToday> {
  @override
  Future<FaceToday> build() => ref.watch(captainRepositoryProvider).faceToday();

  /// إعادة قراءة حالة اليوم من السيرفر — بتعدّي على حالة التحميل عشان الشاشة تبيّن.
  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => ref.read(captainRepositoryProvider).faceToday());
  }

  /// رفع سيلفي + تسجيل فحص، وبعدها إعادة قراءة حالة اليوم.
  ///
  /// بيرجّع الفحص عشان الشاشة تعرض النتيجة فوراً، وبيرمي [ApiException] برسالة
  /// السيرفر لو الرفع أو الفحص فشل — مابنبلعش الخطأ هنا.
  Future<FaceCheck> submit(File selfie) async {
    final repository = ref.read(captainRepositoryProvider);
    final selfieUrl = await repository.uploadFile(selfie, folder: 'selfies');
    final check = await repository.submitFaceCheck(selfieUrl);
    await refresh();
    return check;
  }
}

final faceTodayProvider =
    AsyncNotifierProvider<FaceTodayNotifier, FaceToday>(FaceTodayNotifier.new);
