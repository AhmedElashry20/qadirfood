// شاشة ٢: الشاشات التعريفية
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/router.dart';
import '../../core/theme.dart';
import '../../widgets/common.dart';

class _IntroPage {
  const _IntroPage(this.emoji, this.title, this.body);

  final String emoji;
  final String title;
  final String body;
}

const _pages = <_IntroPage>[
  _IntroPage(
    '🍔',
    'اطلب من أفضل مطاعم مدينتك',
    'مئات المطاعم والأطباق، وكلها على بُعد ضغطة',
  ),
  _IntroPage(
    '🛵',
    'تتبّع طلبك لحظة بلحظة',
    'شوف كابتن التوصيل على الخريطة والوقت المتبقي بالثانية',
  ),
  _IntroPage(
    '🎉',
    'وصل! بالهنا والشفا 🎉',
    'قيّم تجربتك واكسب نقاط قادر مع كل طلب',
  ),
];

class IntroScreen extends StatefulWidget {
  const IntroScreen({super.key});

  @override
  State<IntroScreen> createState() => _IntroScreenState();
}

class _IntroScreenState extends State<IntroScreen> {
  final _controller = PageController();
  int _index = 0;

  bool get _isLast => _index == _pages.length - 1;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _next() {
    if (_isLast) {
      context.go(QRoutes.language);
    } else {
      _controller.nextPage(
        duration: const Duration(milliseconds: 280),
        curve: Curves.easeOut,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: QColors.surface,
      body: SafeArea(
        child: Column(
          children: [
            // «تخطي» على يسار الشاشة بصريًا حتى في RTL.
            Align(
              alignment: Alignment.centerLeft,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(QSpace.screenH, 8, QSpace.screenH, 0),
                child: TextButton(
                  onPressed: () => context.go(QRoutes.language),
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: Text(
                    'تخطي',
                    style: TextStyle(
                      fontFamily: 'Cairo',
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: QColors.faint,
                    ),
                  ),
                ),
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _controller,
                itemCount: _pages.length,
                onPageChanged: (i) => setState(() => _index = i),
                itemBuilder: (_, i) => _IntroPageView(page: _pages[i]),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(QSpace.screenH, 8, QSpace.screenH, 24),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      for (var i = 0; i < _pages.length; i++)
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          margin: const EdgeInsets.symmetric(horizontal: 4),
                          width: i == _index ? 22 : 8,
                          height: 8,
                          decoration: BoxDecoration(
                            color: i == _index ? QColors.brand : QColors.border,
                            borderRadius: BorderRadius.circular(QRadius.pill),
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    child: QButton(
                      label: _isLast ? 'يلا نبدأ' : 'التالي',
                      onPressed: _next,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _IntroPageView extends StatelessWidget {
  const _IntroPageView({required this.page});

  final _IntroPage page;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: QSpace.screenH),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 160,
            height: 160,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: QColors.tint,
              shape: BoxShape.circle,
            ),
            child: Text(page.emoji, style: const TextStyle(fontSize: 72)),
          ),
          const SizedBox(height: 32),
          Text(page.title, style: QText.display, textAlign: TextAlign.center),
          const SizedBox(height: 10),
          Text(
            page.body,
            style: QText.caption.copyWith(fontSize: 14.5),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}
