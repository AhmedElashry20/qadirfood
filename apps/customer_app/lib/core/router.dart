// go_router — مسارات كل الشاشات + الشل السفلي (الرئيسية/البحث/طلباتي/حسابي).
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../features/account/account_screen.dart';
import '../features/account/favorites_screen.dart';
import '../features/account/notifications_screen.dart';
import '../features/account/raise_ticket_screen.dart';
import '../features/account/settings_screen.dart';
import '../features/account/support_screen.dart';
import '../features/account/ticket_detail_screen.dart';
import '../features/tracking/order_chat_screen.dart';
import '../features/account/loyalty_screen.dart';
import '../features/account/referral_screen.dart';
import '../features/account/wallet_screen.dart';
import '../features/auth/complete_profile_screen.dart';
import '../features/auth/login_screen.dart';
import '../features/auth/otp_screen.dart';
import '../features/checkout/checkout_screen.dart';
import '../features/checkout/order_success_screen.dart';
import '../features/checkout/payment_method_screen.dart';
import '../features/checkout/payment_screen.dart';
import '../features/home/category_restaurants_screen.dart';
import '../features/home/filters_screen.dart';
import '../features/home/home_screen.dart';
import '../features/home/search_screen.dart';
import '../features/location/address_editor_screen.dart';
import '../features/location/addresses_screen.dart';
import '../features/location/pick_location_screen.dart';
import '../features/onboarding/intro_screen.dart';
import '../features/onboarding/language_screen.dart';
import '../features/onboarding/splash_screen.dart';
import '../features/orders/my_orders_screen.dart';
import '../features/orders/past_order_screen.dart';
import '../features/orders/rate_order_screen.dart';
import '../features/restaurant/cart_screen.dart';
import '../features/restaurant/item_screen.dart';
import '../features/restaurant/restaurant_screen.dart';
import '../features/tracking/live_tracking_screen.dart';
import '../features/tracking/order_details_screen.dart';
import '../widgets/bottom_nav.dart';

/// أسماء المسارات — استخدم `context.push(QRoutes.cart)` بدل النصوص المكتوبة.
abstract final class QRoutes {
  static const splash = '/';
  static const intro = '/intro';
  static const language = '/language';
  static const login = '/login';
  static const otp = '/otp';
  static const completeProfile = '/complete-profile';

  static const home = '/home';
  static const search = '/search';
  static const filters = '/filters';
  static const myOrders = '/orders';
  static const account = '/account';

  static String category(String id) => '/category/$id';
  static String restaurant(String id) => '/restaurant/$id';
  static String item(String restaurantId, String itemId) =>
      '/restaurant/$restaurantId/item/$itemId';

  static const cart = '/cart';
  static const checkout = '/checkout';
  static const paymentMethods = '/payment-methods';
  static const addCard = '/payment-methods/add';

  static const addresses = '/addresses';
  static const pickLocation = '/addresses/pick';
  static const addressEditor = '/addresses/edit';

  static String orderSuccess(String id) => '/order/$id/success';
  static String track(String id) => '/order/$id/track';
  static String orderDetails(String id) => '/order/$id';
  static String pastOrder(String id) => '/order/$id/receipt';
  static String rate(String id) => '/order/$id/rate';

  static const favorites = '/favorites';
  static const wallet = '/wallet';
  static const loyalty = '/loyalty';
  static const referral = '/referral';
  static const orderChat = '/orders/chat';
  static const notifications = '/notifications';
  static const support = '/support';
  static const raiseTicket = '/support/new';
  static String ticket(String id) => '/support/ticket/$id';
  static const settings = '/settings';
}

final _rootKey = GlobalKey<NavigatorState>();
final _shellKey = GlobalKey<NavigatorState>();

/// [isLoggedIn] بييجي من التوكن المحفوظ — المستخدم المسجّل بيدخل على الرئيسية على طول.
GoRouter buildRouter({bool isLoggedIn = false}) => GoRouter(
      navigatorKey: _rootKey,
      initialLocation: isLoggedIn ? QRoutes.home : QRoutes.splash,
      routes: [
        GoRoute(path: QRoutes.splash, builder: (_, __) => const SplashScreen()),
        GoRoute(path: QRoutes.intro, builder: (_, __) => const IntroScreen()),
        GoRoute(path: QRoutes.language, builder: (_, __) => const LanguageScreen()),
        GoRoute(path: QRoutes.login, builder: (_, __) => const LoginScreen()),
        GoRoute(path: QRoutes.otp, builder: (_, __) => const OtpScreen()),
        GoRoute(path: QRoutes.completeProfile, builder: (_, __) => const CompleteProfileScreen()),

        // ── التبويبات الأربعة ──
        ShellRoute(
          navigatorKey: _shellKey,
          builder: (context, state, child) => QBottomNavShell(child: child),
          routes: [
            GoRoute(path: QRoutes.home, builder: (_, __) => const HomeScreen()),
            GoRoute(path: QRoutes.search, builder: (_, __) => const SearchScreen()),
            GoRoute(path: QRoutes.myOrders, builder: (_, __) => const MyOrdersScreen()),
            GoRoute(path: QRoutes.account, builder: (_, __) => const AccountScreen()),
          ],
        ),

        GoRoute(path: QRoutes.filters, builder: (_, __) => const FiltersScreen()),
        GoRoute(
          path: '/category/:id',
          builder: (_, state) => CategoryRestaurantsScreen(categoryId: state.pathParameters['id']!),
        ),
        GoRoute(
          path: '/restaurant/:id',
          builder: (_, state) => RestaurantScreen(restaurantId: state.pathParameters['id']!),
          routes: [
            GoRoute(
              path: 'item/:itemId',
              builder: (_, state) => ItemScreen(
                restaurantId: state.pathParameters['id']!,
                itemId: state.pathParameters['itemId']!,
              ),
            ),
          ],
        ),

        GoRoute(
          path: QRoutes.orderChat,
          builder: (_, state) => OrderChatScreen(orderId: state.extra as String? ?? ''),
        ),
        GoRoute(path: QRoutes.loyalty, builder: (_, __) => const LoyaltyScreen()),
        GoRoute(path: QRoutes.referral, builder: (_, __) => const ReferralScreen()),
        GoRoute(path: QRoutes.cart, builder: (_, __) => const CartScreen()),
        GoRoute(path: QRoutes.checkout, builder: (_, __) => const CheckoutScreen()),
        GoRoute(path: QRoutes.paymentMethods, builder: (_, __) => const PaymentMethodScreen()),
        GoRoute(path: QRoutes.addCard, builder: (_, __) => const PaymentScreen()),

        GoRoute(path: QRoutes.addresses, builder: (_, __) => const AddressesScreen()),
        GoRoute(path: QRoutes.pickLocation, builder: (_, __) => const PickLocationScreen()),
        GoRoute(
          path: QRoutes.addressEditor,
          builder: (_, state) {
            final args = state.extra as AddressEditorArgs?;
            return AddressEditorScreen(args: args);
          },
        ),

        GoRoute(
          path: '/order/:id/success',
          builder: (_, state) => OrderSuccessScreen(orderId: state.pathParameters['id']!),
        ),
        GoRoute(
          path: '/order/:id/track',
          builder: (_, state) => LiveTrackingScreen(orderId: state.pathParameters['id']!),
        ),
        GoRoute(
          path: '/order/:id/receipt',
          builder: (_, state) => PastOrderScreen(orderId: state.pathParameters['id']!),
        ),
        GoRoute(
          path: '/order/:id/rate',
          builder: (_, state) => RateOrderScreen(orderId: state.pathParameters['id']!),
        ),
        GoRoute(
          path: '/order/:id',
          builder: (_, state) => OrderDetailsScreen(orderId: state.pathParameters['id']!),
        ),

        GoRoute(path: QRoutes.favorites, builder: (_, __) => const FavoritesScreen()),
        GoRoute(path: QRoutes.wallet, builder: (_, __) => const WalletScreen()),
        GoRoute(path: QRoutes.notifications, builder: (_, __) => const NotificationsScreen()),
        GoRoute(path: QRoutes.support, builder: (_, __) => const SupportScreen()),
        GoRoute(path: QRoutes.raiseTicket, builder: (_, __) => const RaiseTicketScreen()),
        GoRoute(
          path: '/support/ticket/:id',
          builder: (_, state) => TicketDetailScreen(ticketId: state.pathParameters['id']!),
        ),
        GoRoute(path: QRoutes.settings, builder: (_, __) => const SettingsScreen()),
      ],
    );
