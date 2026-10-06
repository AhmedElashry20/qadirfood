// نقطة البداية — ProviderScope + RTL (locale ar) + MaterialApp.router.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/api_client.dart';
import 'core/router.dart';
import 'core/socket_service.dart';
import 'core/theme.dart';
import 'providers/theme_provider.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // التابلت في المطعم بيشتغل أفقي — بنسمح بكل الاتجاهات.
  await SystemChrome.setPreferredOrientations(DeviceOrientation.values);

  final prefs = await SharedPreferences.getInstance();
  final tokens = TokenStore(prefs);

  final container = ProviderContainer(
    overrides: [tokenStoreProvider.overrideWithValue(tokens)],
  );

  // لو الفرع مسجّل دخول، نفتح السوكيت فوراً عشان الطلبات الجديدة ما تفوتش.
  if (tokens.isLoggedIn) container.read(socketServiceProvider).connect();

  runApp(
    UncontrolledProviderScope(
      container: container,
      child: MerchantApp(isLoggedIn: tokens.isLoggedIn),
    ),
  );
}

class MerchantApp extends ConsumerStatefulWidget {
  const MerchantApp({super.key, this.isLoggedIn = false});

  final bool isLoggedIn;

  @override
  ConsumerState<MerchantApp> createState() => _MerchantAppState();
}

class _MerchantAppState extends ConsumerState<MerchantApp> {
  late final _router = buildRouter(isLoggedIn: widget.isLoggedIn);

  @override
  Widget build(BuildContext context) {
    final mode = ref.watch(themeModeProvider);

    // `QColors.active` لازم تتظبّط **قبل** `buildMerchantTheme()`: الثيم بيقرا من
    // الـ getters، فلو الترتيب اتقلب الثيم بيتبنى بألوان الوضع القديم.
    applyPalette(mode, MediaQuery.platformBrightnessOf(context));

    return MaterialApp.router(
      title: 'قادر فود — المطعم',
      debugShowCheckedModeBanner: false,
      theme: buildMerchantTheme(),
      darkTheme: buildMerchantTheme(brightness: Brightness.dark),
      themeMode: mode,
      routerConfig: _router,
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      // تاني مرة عن قصد: الشجرة بتتبنى تاني لما وضع الجهاز يتغيّر والتطبيق
      // شغّال، فلازم الـ palette تكون مظبوطة هنا كمان.
      builder: (context, child) {
        applyPalette(mode, MediaQuery.platformBrightnessOf(context));
        return Directionality(
          textDirection: TextDirection.rtl,
          child: child ?? const SizedBox.shrink(),
        );
      },
    );
  }
}
