// التحقق اليومي بالوجه — كل يوم الكابتن بيصوّر سيلفي والسيرفر بيتحقق منها قبل
// ما يقدر يبقى أونلاين ويستقبل طلبات.
//
// ══════════════════════════════════════════════════════════════════════════
//                    ⚠️ الأمانة: مافيش مطابقة بيومترية حقيقية لسه
// ══════════════════════════════════════════════════════════════════════════
// السيرفر بيرجّع `biometricConfigured = false` و `provider = 'stub'` (محتاج خدمة
// خارجية + مفاتيح). فالشاشة **مابتقولش** «وشّك اتطابق ✅»؛ بتقول نجاح صادق («تم
// استلام تحقّقك اليومي») ولما الخدمة مش مفعّلة بتوضّح إن التحقق مبدئي. نفس أسلوب
// باقي التطبيق في الصراحة عن التكاملات اللي لسه stub.
//
// الرفع نفس أسلوب رفع الوثائق: الكاميرا (الأمامية مفضّلة) → `POST /uploads` →
// `POST /face/me/check` → إعادة قراءة `GET /face/me/today`.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/api_client.dart';
import '../../core/format.dart' as fmt;
import '../../core/theme.dart';
import '../../models/face_check.dart';
import '../../providers/face_provider.dart';
import '../../widgets/common.dart';

class DailyFaceScreen extends ConsumerStatefulWidget {
  const DailyFaceScreen({super.key});

  @override
  ConsumerState<DailyFaceScreen> createState() => _DailyFaceScreenState();
}

class _DailyFaceScreenState extends ConsumerState<DailyFaceScreen> {
  /// بنبيّن التحميل على الزرار طول ما الرفع + الفحص شغّالين.
  bool _busy = false;

  /// يفتح الكاميرا الأمامية → يرفع السيلفي → يسجّل الفحص → يعرض النتيجة.
  Future<void> _capture() async {
    // فتح الكاميرا نفسه ممكن يترفض من المستخدم — ساعتها بنخرج بهدوء.
    final XFile? picked;
    try {
      picked = await ImagePicker().pickImage(
        source: ImageSource.camera,
        preferredCameraDevice: CameraDevice.front,
        maxWidth: 1200,
        imageQuality: 85,
      );
    } catch (_) {
      if (!mounted) return;
      _snack(context, 'مش قادرين نفتح الكاميرا');
      return;
    }
    if (picked == null || !mounted) return;

    setState(() => _busy = true);
    try {
      final check = await ref.read(faceTodayProvider.notifier).submit(File(picked.path));
      if (!mounted) return;
      // نجاح صادق — مافيش ادّعاء بمطابقة بيومترية (شوف تعليق أول الملف).
      _snack(
        context,
        switch (check.status) {
          FaceCheckStatus.verified => 'تم استلام تحقّقك اليومي',
          FaceCheckStatus.pending => 'استلمنا سيلفيك — لسه قيد المراجعة',
          FaceCheckStatus.rejected => check.rejectReason ?? 'التحقق مرفوض — جرّب صورة أوضح',
        },
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      _snack(context, e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final todayAsync = ref.watch(faceTodayProvider);

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: const QHeader(title: 'التحقق اليومي بالوجه'),
      body: todayAsync.when(
        loading: () => const QLoading(),
        error: (error, _) => QErrorView(
          message: error is ApiException ? error.message : 'مش قادرين نجيب حالة التحقق',
          onRetry: () => ref.invalidate(faceTodayProvider),
        ),
        data: (today) => ListView(
          padding: const EdgeInsets.fromLTRB(
            QSpace.screenH,
            QSpace.gapLg,
            QSpace.screenH,
            QSpace.gapLg,
          ),
          children: [
            const _HeroCard(),
            const SizedBox(height: QSpace.gap),
            if (today.check != null) ...[
              _ResultCard(check: today.check!),
              const SizedBox(height: QSpace.gap),
            ],
            // الأمانة: المطابقة البيومترية لسه مش مفعّلة (provider = stub).
            if (!today.biometricConfigured) ...[
              _ProvisionalNote(provider: today.provider),
              const SizedBox(height: QSpace.gap),
            ],
            const _Steps(),
          ],
        ),
      ),
      bottomNavigationBar: todayAsync.maybeWhen(
        data: (today) => QBottomBar(
          child: today.verifiedToday
              ? QButton(
                  label: 'تمام — ارجع وابدأ الشغل',
                  onPressed: () => context.pop(),
                )
              : QButton(
                  label: today.check != null ? 'صوّر تاني' : 'صوّر وشّك',
                  loading: _busy,
                  leading: const Icon(Icons.camera_alt_rounded, size: 20, color: QColors.ink),
                  onPressed: _capture,
                ),
        ),
        orElse: () => null,
      ),
    );
  }
}

/// كارت أسود تعريفي — إيه هو التحقق اليومي وليه.
class _HeroCard extends StatelessWidget {
  const _HeroCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 22),
      decoration: BoxDecoration(
        color: QColors.ink,
        borderRadius: BorderRadius.circular(QRadius.xl),
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('🤳', style: TextStyle(fontSize: 44)),
          SizedBox(height: 14),
          Text(
            'صوّر سيلفي قبل ما تبدأ',
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 20,
              fontWeight: FontWeight.w900,
              color: Colors.white,
            ),
          ),
          SizedBox(height: 8),
          Text(
            'كل يوم بنطلب منك صورة سريعة نتأكد بيها إنك إنت اللي بتشتغل، قبل ما تقدر '
            'تبقى متصل وتستقبل الطلبات.',
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: QColors.darkSub,
              height: 1.7,
            ),
          ),
        ],
      ),
    );
  }
}

/// نتيجة آخر فحص — لونها ونصّها بيتبعوا حالة السيرفر مباشرة.
class _ResultCard extends StatelessWidget {
  const _ResultCard({required this.check});

  final FaceCheck check;

  @override
  Widget build(BuildContext context) {
    final (bg, border, fg, emoji, title) = switch (check.status) {
      FaceCheckStatus.verified => (
          QColors.successTint,
          QColors.success,
          QColors.success,
          '✓',
          'تم استلام تحقّقك اليومي',
        ),
      FaceCheckStatus.pending => (
          QColors.tint,
          QColors.tintBorder,
          QColors.goldDeep,
          '⏳',
          'سيلفيك قيد المراجعة',
        ),
      FaceCheckStatus.rejected => (
          QColors.dangerBorder,
          QColors.danger,
          QColors.danger,
          '✕',
          'التحقق اتـرفض — جرّب تاني',
        ),
    };

    // نص ثانوي: سبب الرفض لو مرفوض، وإلا وقت آخر فحص لو موجود.
    final detail = check.status.isRejected
        ? check.rejectReason
        : (check.checkedAt != null ? 'آخر محاولة ${_hm(check.checkedAt!)}' : null);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(QRadius.lg),
        border: Border.all(color: border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(emoji, style: TextStyle(fontSize: 20, color: fg, fontWeight: FontWeight.w900)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 14.5,
                    fontWeight: FontWeight.w800,
                    color: fg,
                  ),
                ),
                if (detail != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    detail,
                    style: TextStyle(
                      fontFamily: 'Cairo',
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                      color: fg,
                      height: 1.6,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  /// «14:32» — الساعة والدقيقة بس.
  static String _hm(DateTime value) => fmt.ltr(
        '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}',
      );
}

/// ملاحظة الأمانة — بتبان بس لما `biometricConfigured == false`.
class _ProvisionalNote extends StatelessWidget {
  const _ProvisionalNote({required this.provider});

  final String provider;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: QColors.tintSoft,
        borderRadius: BorderRadius.circular(QRadius.md),
        border: Border.all(color: QColors.tintBorder),
      ),
      child: Text.rich(
        TextSpan(
          text: 'ℹ️ المطابقة البيومترية الأوتوماتيكية لسه مش مفعّلة (المزوّد ',
          style: const TextStyle(
            fontFamily: 'Cairo',
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: QColors.goldDeep,
            height: 1.7,
          ),
          children: [
            TextSpan(text: fmt.ltr(provider), style: QText.num(size: 12, color: QColors.goldDeep)),
            const TextSpan(text: '). تحقّقك بيتسجّل مبدئياً وممكن يتراجع لاحقاً.'),
          ],
        ),
      ),
    );
  }
}

/// خطوات سريعة لصورة سليمة.
class _Steps extends StatelessWidget {
  const _Steps();

  static const _items = [
    ('💡', 'إضاءة كويسة والوش باين'),
    ('🕶', 'من غير نظارة شمس أو كمامة'),
    ('🤳', 'استخدم الكاميرا الأمامية'),
  ];

  @override
  Widget build(BuildContext context) {
    return QCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Column(
        children: [
          for (var i = 0; i < _items.length; i++) ...[
            if (i != 0) const Divider(color: QColors.line, height: 1),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Row(
                children: [
                  Text(_items[i].$1, style: const TextStyle(fontSize: 18)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      _items[i].$2,
                      style: QText.body.copyWith(fontSize: 14, fontWeight: FontWeight.w700),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
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
