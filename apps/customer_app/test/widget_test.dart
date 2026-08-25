// اختبارات دخان: السلة والفاتورة + إقلاع التطبيق من السبلاش للشاشة التعريفية.
import 'package:customer_app/data/mock_data.dart';
import 'package:customer_app/main.dart';
import 'package:customer_app/providers/cart_provider.dart';
import 'package:customer_app/providers/checkout_provider.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('إضافة صنف للسلة تحسب الإجمالي والضريبة صح', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);

    final restaurant = MockData.restaurantById('burger_lab');
    final item = restaurant.allItems.first; // تشيز برجر دبل — 35 ر.س
    final cheese = item.optionGroups
        .firstWhere((g) => g.id == 'extras')
        .options
        .firstWhere((o) => o.id == 'cheese'); // +4

    container.read(cartProvider.notifier).add(restaurant, item, options: [cheese], quantity: 2);

    final cart = container.read(cartProvider);
    expect(cart.itemCount, 2);
    expect(cart.subtotal, 78); // (35 + 4) × 2

    final bill = container.read(billProvider);
    expect(bill.deliveryFee, 5); // رسوم Burger Lab
    expect(bill.vat, closeTo((78 + 5) * 0.15, 0.001));
    expect(bill.total, closeTo(78 + 5 + bill.vat, 0.001));
  });

  test('كوبون QADIR20 يخصم 20% من المجموع الفرعي', () {
    final container = ProviderContainer();
    addTearDown(container.dispose);

    final restaurant = MockData.restaurantById('burger_lab');
    container.read(cartProvider.notifier).add(restaurant, restaurant.allItems.first);

    expect(container.read(appliedCouponProvider.notifier).apply('QADIR20'), isNull);
    expect(container.read(billProvider).discount, closeTo(35 * 0.20, 0.001));

    expect(container.read(appliedCouponProvider.notifier).apply('WRONG'), isNotNull);
  });

  testWidgets('التطبيق يقلع من السبلاش وينتقل للشاشة التعريفية', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: QadirFoodApp()));

    expect(find.text('FOOD'), findsOneWidget);

    await tester.pumpAndSettle(const Duration(seconds: 2));

    expect(find.text('اطلب من أفضل مطاعم مدينتك'), findsOneWidget);
  });
}
