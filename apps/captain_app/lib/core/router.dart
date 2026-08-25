// go_router — مسارات الـ ١٨ شاشة.
//
// ⚠️ [QRoutes] هو **العقد المشترك** بين اللي بيكتب شاشات الدخول/الرئيسية/العرض
// واللي بيكتب شاشات الرحلة/السجل/الأرباح/الإعدادات. أي تغيير في اسم ثابت هنا
// بيكسر الشاشتين. استخدم `context.push(QRoutes.wallet)` بدل النصوص المكتوبة.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/documents_screen.dart';
import '../features/auth/face_verification_screen.dart';
import '../features/auth/login_screen.dart';
import '../features/auth/otp_screen.dart';
import '../features/auth/pending_review_screen.dart';
import '../features/auth/register_screen.dart';
import '../features/earnings/earnings_screen.dart';
import '../features/earnings/wallet_screen.dart';
import '../features/face/daily_face_screen.dart';
import '../features/home/home_screen.dart';
import '../features/relay/relay_screens.dart';
import '../features/home/trip_offer_screen.dart';
import '../features/orders/my_trips_screen.dart';
import '../features/orders/trip_details_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/shift/shift_screen.dart';
import '../features/trip/delivery_confirm_screen.dart';
import '../features/trip/pickup_screen.dart';
import '../features/trip/rate_screen.dart';
import '../features/trip/to_customer_screen.dart';
import '../features/trip/to_restaurant_screen.dart';

/// أسماء المسارات — استخدمها بدل النصوص المكتوبة.
abstract final class QRoutes {
  // ── الدخول والتفعيل ──
  static const login = '/login';
  static const otp = '/otp';
  static const register = '/register';
  static const documents = '/documents';
  static const pending = '/pending';
  static const face = '/face';

  /// التحقق اليومي بالوجه — بوابة الأونلاين (غير شاشة تفعيل الوجه [face]).
  static const dailyFace = '/daily-face';

  // ── الرئيسية والعرض ──
  static const home = '/home';
  static const offer = '/offer';

  // ── الرحلة الجارية ──
  /// شاشة الرحلة الأساسية (الطريق للمطعم) — نقطة الدخول لأي رحلة.
  static String trip(String id) => '/trip/$id';

  /// استلام الطلب من المطعم (مطابقة كود الاستلام).
  static String tripPickup(String id) => '/trip/$id/pickup';

  /// الطريق للعميل + بث الموقع.
  static String tripToCustomer(String id) => '/trip/$id/to-customer';

  /// تأكيد التسليم وتحصيل الكاش.
  static String tripDeliver(String id) => '/trip/$id/deliver';

  /// تقييم بعد التسليم.
  static String tripRate(String id) => '/trip/$id/rate';

  /// التوصيل بالتناوب (الحرم): تسليم مندوب المركبة عند البوابة، واستلامات المشي.
  static String relayHandoff(String id) => '/trip/$id/relay-handoff';
  static const relayIncoming = '/relay-incoming';

  // ── السجل والأرباح والحساب ──
  static const trips = '/trips';

  /// تفاصيل رحلة من السجل.
  static String tripDetails(String id) => '/trips/$id';

  static const earnings = '/earnings';
  static const wallet = '/wallet';

  /// الملف الشخصي — نفس شاشة الإعدادات (فيها «بياناتي» والمركبة والوثائق).
  static const profile = '/profile';
  static const settings = '/settings';
  static const shift = '/shift';
}

final _rootKey = GlobalKey<NavigatorState>();

/// [isLoggedIn] بييجي من التوكن المحفوظ — الكابتن المسجّل بيدخل على الرئيسية على طول.
GoRouter buildRouter({bool isLoggedIn = false}) => GoRouter(
      navigatorKey: _rootKey,
      initialLocation: isLoggedIn ? QRoutes.home : QRoutes.login,
      routes: [
        // ── الدخول والتفعيل ──
        GoRoute(path: QRoutes.login, builder: (_, __) => const LoginScreen()),
        GoRoute(path: QRoutes.otp, builder: (_, __) => const OtpScreen()),
        GoRoute(path: QRoutes.register, builder: (_, __) => const RegisterScreen()),
        GoRoute(path: QRoutes.documents, builder: (_, __) => const DocumentsScreen()),
        GoRoute(path: QRoutes.pending, builder: (_, __) => const PendingReviewScreen()),
        GoRoute(path: QRoutes.face, builder: (_, __) => const FaceVerificationScreen()),
        GoRoute(path: QRoutes.dailyFace, builder: (_, __) => const DailyFaceScreen()),

        // ── الرئيسية ──
        GoRoute(path: QRoutes.home, builder: (_, __) => const HomeScreen()),

        // عرض الرحلة — بيتفتح فوق الرئيسية بخلفية شفافة (الخريطة بتفضل بانة تحته).
        GoRoute(
          path: QRoutes.offer,
          pageBuilder: (_, state) => const NoTransitionPage(child: TripOfferScreen()),
        ),

        // ── الرحلة الجارية ──
        // المسارات الفرعية الأول عشان `/trip/:id` ماتبلعش اللي بعدها.
        GoRoute(
          path: '/trip/:id/pickup',
          builder: (_, state) => PickupScreen(orderId: state.pathParameters['id']!),
        ),
        GoRoute(
          path: '/trip/:id/to-customer',
          builder: (_, state) => ToCustomerScreen(orderId: state.pathParameters['id']!),
        ),
        GoRoute(
          path: '/trip/:id/deliver',
          builder: (_, state) => DeliveryConfirmScreen(orderId: state.pathParameters['id']!),
        ),
        GoRoute(
          path: '/trip/:id/rate',
          builder: (_, state) => RateScreen(orderId: state.pathParameters['id']!),
        ),
        // ── التوصيل بالتناوب (الحرم) ──
        GoRoute(
          path: '/trip/:id/relay-handoff',
          builder: (_, state) => RelayHandoffScreen(orderId: state.pathParameters['id']!),
        ),
        GoRoute(path: QRoutes.relayIncoming, builder: (_, __) => const RelayIncomingScreen()),
        GoRoute(
          path: '/trip/:id',
          builder: (_, state) => ToRestaurantScreen(orderId: state.pathParameters['id']!),
        ),

        // ── السجل ──
        GoRoute(path: QRoutes.trips, builder: (_, __) => const MyTripsScreen()),
        GoRoute(
          path: '/trips/:id',
          builder: (_, state) => TripDetailsScreen(orderId: state.pathParameters['id']!),
        ),

        // ── الأرباح والحساب ──
        GoRoute(path: QRoutes.earnings, builder: (_, __) => const EarningsScreen()),
        GoRoute(path: QRoutes.wallet, builder: (_, __) => const WalletScreen()),
        GoRoute(path: QRoutes.shift, builder: (_, __) => const ShiftScreen()),
        // الملف والإعدادات نفس الشاشة — التصميم حاططهم مع بعض.
        GoRoute(path: QRoutes.profile, builder: (_, __) => const SettingsScreen()),
        GoRoute(path: QRoutes.settings, builder: (_, __) => const SettingsScreen()),
      ],
    );
