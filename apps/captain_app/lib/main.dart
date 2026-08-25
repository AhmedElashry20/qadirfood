// نقطة البداية — ProviderScope + RTL + تحميل التوكن قبل ما التطبيق يقلع.
//
// تطبيق الكابتن عربي بس (مافيش مبدّل لغة زي تطبيق العميل)، فالاتجاه RTL ثابت
// واللغة `ar` ثابتة.
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/api_client.dart';
import 'core/router.dart';
import 'core/socket_service.dart';
import 'core/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  final tokens = TokenStore(prefs);

  final container = ProviderContainer(
    overrides: [tokenStoreProvider.overrideWithValue(tokens)],
  );

  // لو فيه توكن محفوظ، نفتح السوكيت من دلوقتي — عروض الرحلات بتوصل عليه بس،
  // ولو التطبيق مش متوصّل العرض بيضيع خالص (مافيش endpoint يجيب العروض المعلّقة).
  //
  // ملاحظة: الاتصال **مش** معناه إن الكابتن أونلاين. حالة الأونلاين بتتبعت
  // بـ `captain:status_update` لما يضغط الزرار الكبير، وبترجع أوفلاين مع كل
  // إقلاع لأن مافيش REST endpoint نقرا منه الحالة الحقيقية.
  if (tokens.isLoggedIn) container.read(socketServiceProvider).connect();

  runApp(
    UncontrolledProviderScope(
      container: container,
      child: CaptainApp(isLoggedIn: tokens.isLoggedIn),
    ),
  );
}

class CaptainApp extends ConsumerStatefulWidget {
  const CaptainApp({super.key, this.isLoggedIn = false});

  final bool isLoggedIn;

  @override
  ConsumerState<CaptainApp> createState() => _CaptainAppState();
}

class _CaptainAppState extends ConsumerState<CaptainApp> {
  late final _router = buildRouter(isLoggedIn: widget.isLoggedIn);

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'قادر فود — كابتن',
      debugShowCheckedModeBanner: false,
      theme: buildCaptainTheme(),
      routerConfig: _router,
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      builder: (context, child) => Directionality(
        textDirection: TextDirection.rtl,
        child: child ?? const SizedBox.shrink(),
      ),
    );
  }
}
