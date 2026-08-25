// اختبار تكامل على الجهاز مقابل الـ API الحقيقي (لازم السيرفر شغّال على :3000).
// بيدخل بحساب الكاشير، يشوف الطلبات الواردة، ويقبل طلب فعلي.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:merchant_app/core/api_client.dart';
import 'package:merchant_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('دخول المطعم → الطلبات الواردة → قبول طلب حقيقي', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final tokens = TokenStore(await SharedPreferences.getInstance());

    await tester.pumpWidget(
      ProviderScope(
        overrides: [tokenStoreProvider.overrideWithValue(tokens)],
        child: const MerchantApp(),
      ),
    );
    await tester.pumpAndSettle(const Duration(seconds: 2));

    // شاشة الدخول
    expect(find.text('بوابة الشركاء'), findsOneWidget);

    final fields = find.byType(TextField);
    await tester.enterText(fields.at(0), 'cashier@aseel.sa'); // فرع واحد — مافيش اختيار فرع
    await tester.enterText(fields.at(1), '123456');
    await tester.pumpAndSettle();

    await tester.tap(find.text('دخول'));
    await tester.pumpAndSettle(const Duration(seconds: 8));

    // الطلبات الواردة — من قاعدة البيانات الحقيقية
    expect(find.textContaining('طلب جديد'), findsWidgets,
        reason: 'المفروض فيه طلبات PENDING في الـ seed');

    final before = tester.widgetList(find.textContaining('قبول —')).length;
    expect(before, greaterThan(0));

    // قبول أول طلب — نداء حقيقي على السيرفر
    final acceptButton = find.textContaining('قبول —').first;
    await tester.ensureVisible(acceptButton);
    await tester.tap(acceptButton);
    await tester.pumpAndSettle(const Duration(seconds: 8));

    // الطلب المقبول خرج من قائمة الواردة
    final after = tester.widgetList(find.textContaining('قبول —')).length;
    expect(after, before - 1, reason: 'الطلب المقبول لازم يختفي من الواردة');
  });
}
