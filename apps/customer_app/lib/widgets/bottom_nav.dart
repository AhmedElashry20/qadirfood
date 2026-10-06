// شريط التنقّل السفلي — الرئيسية · البحث · طلباتي · حسابي (المفعّل أسود، والباقي رمادي).
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/router.dart';
import '../core/theme.dart';

class QBottomNavShell extends StatelessWidget {
  const QBottomNavShell({super.key, required this.child});

  final Widget child;

  static const _tabs = [
    (path: QRoutes.home, label: 'الرئيسية', icon: Icons.home_rounded),
    (path: QRoutes.search, label: 'البحث', icon: Icons.search_rounded),
    (path: QRoutes.myOrders, label: 'طلباتي', icon: Icons.receipt_long_rounded),
    (path: QRoutes.account, label: 'حسابي', icon: Icons.person_rounded),
  ];

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).uri.path;

    return Scaffold(
      body: child,
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: QColors.surface,
          border: Border(top: BorderSide(color: QColors.line)),
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 10),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                for (final tab in _tabs)
                  _NavItem(
                    label: tab.label,
                    icon: tab.icon,
                    active: location == tab.path,
                    onTap: () => context.go(tab.path),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.label,
    required this.icon,
    required this.active,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = active ? QColors.ink : QColors.navInactive;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(QRadius.sm),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 22, color: color),
            const SizedBox(height: 3),
            Text(
              label,
              style: TextStyle(
                fontFamily: 'Cairo',
                fontSize: 11,
                fontWeight: active ? FontWeight.w800 : FontWeight.w600,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
