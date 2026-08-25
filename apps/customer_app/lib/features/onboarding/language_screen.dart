// شاشة ٣: اختيار اللغة — ٧ لغات، والاختيار بيغيّر اتجاه الواجهة فوراً.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/locale.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';

class LanguageScreen extends ConsumerWidget {
  const LanguageScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final selected = ref.watch(languageProvider);

    return Scaffold(
      backgroundColor: QColors.surface,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(QSpace.screenH, QSpace.screenH, QSpace.screenH, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // /language بيتفتح بـ go من شاشة التعريف، فمفيش stack يرجع له.
                  QBackButton(onTap: () => context.go(QRoutes.intro)),
                  const SizedBox(height: 24),
                  const Text('اختر لغتك', style: QText.display),
                  const SizedBox(height: 6),
                  const Text('تقدر تغيّرها بعدين من الإعدادات', style: QText.caption),
                  const SizedBox(height: 20),
                ],
              ),
            ),
            Expanded(
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: QSpace.screenH),
                itemCount: AppLanguage.values.length,
                separatorBuilder: (_, __) => const SizedBox(height: QSpace.gap),
                itemBuilder: (_, i) {
                  final language = AppLanguage.values[i];
                  return _LanguageCard(
                    language: language,
                    selected: language == selected,
                    onTap: () => ref.read(languageProvider.notifier).select(language),
                  );
                },
              ),
            ),
            QBottomBar(
              color: QColors.surface,
              child: QButton(
                label: 'متابعة',
                onPressed: () => context.go(QRoutes.login),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LanguageCard extends StatelessWidget {
  const _LanguageCard({
    required this.language,
    required this.selected,
    required this.onTap,
  });

  final AppLanguage language;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(QRadius.lg),
        boxShadow: kCardShadow,
      ),
      child: QCard(
        selected: selected,
        onTap: onTap,
        color: selected ? QColors.tintSoft : QColors.surface,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: selected ? QColors.tintStrong : QColors.chip,
                borderRadius: BorderRadius.circular(QRadius.md),
              ),
              child: Text(language.flag, style: const TextStyle(fontSize: 22)),
            ),
            const SizedBox(width: QSpace.gap),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // الاسم بلغته وباتجاهها هي (مثلاً «اردو» من اليمين).
                  Directionality(
                    textDirection: language.direction,
                    child: Text(
                      language.nativeName,
                      style: QText.cardTitle.copyWith(fontFamily: language.fontFamily),
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(language.subtitle, style: QText.caption),
                ],
              ),
            ),
            QRadioDot(selected: selected),
          ],
        ),
      ),
    );
  }
}
