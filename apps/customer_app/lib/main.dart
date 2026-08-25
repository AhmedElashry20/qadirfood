// نقطة البداية — ProviderScope + اللغة المحفوظة + تحميل التوكن قبل ما التطبيق يقلع.
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/api_client.dart';
import 'core/locale.dart';
import 'core/router.dart';
import 'core/socket_service.dart';
import 'core/theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final prefs = await SharedPreferences.getInstance();
  final tokens = TokenStore(prefs);

  final container = ProviderContainer(
    overrides: [
      tokenStoreProvider.overrideWithValue(tokens),
      initialLanguageProvider.overrideWithValue(readSavedLanguage(prefs)),
    ],
  );

  // لو فيه توكن محفوظ، نفتح السوكيت من دلوقتي عشان حالات الطلب توصل فوراً.
  if (tokens.isLoggedIn) container.read(socketServiceProvider).connect();

  runApp(
    UncontrolledProviderScope(
      container: container,
      child: QadirFoodApp(isLoggedIn: tokens.isLoggedIn),
    ),
  );
}

class QadirFoodApp extends ConsumerStatefulWidget {
  const QadirFoodApp({super.key, this.isLoggedIn = false});

  final bool isLoggedIn;

  @override
  ConsumerState<QadirFoodApp> createState() => _QadirFoodAppState();
}

class _QadirFoodAppState extends ConsumerState<QadirFoodApp> {
  late final _router = buildRouter(isLoggedIn: widget.isLoggedIn);

  @override
  Widget build(BuildContext context) {
    final language = ref.watch(languageProvider);

    return MaterialApp.router(
      title: 'قادر فود',
      debugShowCheckedModeBanner: false,
      theme: buildQadirTheme(),
      routerConfig: _router,
      locale: language.locale,
      supportedLocales: [for (final l in AppLanguage.values) l.locale],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      // اتجاه الواجهة بيتبع اللغة المختارة (عربي/أوردو/فارسي = RTL).
      builder: (context, child) => Directionality(
        textDirection: language.direction,
        child: child ?? const SizedBox.shrink(),
      ),
    );
  }
}
