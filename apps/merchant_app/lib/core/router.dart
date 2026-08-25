// go_router — مسارات الـ ١٣ شاشة + الشل السفلي (الطلبات/المنيو/التقارير/الإعدادات).
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/login_screen.dart';
import '../features/menu/item_editor_screen.dart';
import '../features/menu/menu_screen.dart';
import '../features/orders/active_orders_screen.dart';
import '../features/orders/incoming_orders_screen.dart';
import '../features/orders/order_history_screen.dart';
import '../features/orders/order_ready_screen.dart';
import '../features/reports/reports_screen.dart';
import '../features/settings/branch_status_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/settings/working_hours_screen.dart';
import '../widgets/bottom_nav.dart';

abstract final class QRoutes {
  static const login = '/login';

  /// تبويبات الشل.
  static const orders = '/orders'; // الواردة
  static const active = '/orders/active'; // الجارية
  static const menu = '/menu';
  static const reports = '/reports';
  static const settings = '/settings';

  static const history = '/orders/history';

  static String ready(String orderId) => '/orders/$orderId/ready';

  static const itemEditor = '/menu/item';
  static String editItem(String itemId) => '/menu/item?id=$itemId';

  static const workingHours = '/settings/hours';
  static const branchStatus = '/settings/status';
}

final _rootKey = GlobalKey<NavigatorState>();
final _shellKey = GlobalKey<NavigatorState>();

/// [isLoggedIn] بييجي من التوكن المحفوظ.
GoRouter buildRouter({bool isLoggedIn = false}) => GoRouter(
      navigatorKey: _rootKey,
      initialLocation: isLoggedIn ? QRoutes.orders : QRoutes.login,
      routes: [
        GoRoute(path: QRoutes.login, builder: (_, __) => const LoginScreen()),

        // ── التبويبات ──
        ShellRoute(
          navigatorKey: _shellKey,
          builder: (context, state, child) => MerchantShell(child: child),
          routes: [
            GoRoute(path: QRoutes.orders, builder: (_, __) => const IncomingOrdersScreen()),
            GoRoute(path: QRoutes.active, builder: (_, __) => const ActiveOrdersScreen()),
            GoRoute(path: QRoutes.menu, builder: (_, __) => const MenuScreen()),
            GoRoute(path: QRoutes.reports, builder: (_, __) => const ReportsScreen()),
            GoRoute(path: QRoutes.settings, builder: (_, __) => const SettingsScreen()),
          ],
        ),

        GoRoute(path: QRoutes.history, builder: (_, __) => const OrderHistoryScreen()),
        GoRoute(
          path: '/orders/:id/ready',
          builder: (_, state) => OrderReadyScreen(orderId: state.pathParameters['id']!),
        ),
        GoRoute(
          path: QRoutes.itemEditor,
          builder: (_, state) => ItemEditorScreen(itemId: state.uri.queryParameters['id']),
        ),
        GoRoute(path: QRoutes.workingHours, builder: (_, __) => const WorkingHoursScreen()),
        GoRoute(path: QRoutes.branchStatus, builder: (_, __) => const BranchStatusScreen()),
      ],
    );
