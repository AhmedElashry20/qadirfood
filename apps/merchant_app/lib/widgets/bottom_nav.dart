// الشل السفلي — الطلبات · المنيو · التقارير · الإعدادات.
// تبويب «الطلبات» بيغطي الواردة والجارية (المسارين تحت /orders).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/connectivity_service.dart';
import '../core/router.dart';
import '../core/theme.dart';

class MerchantShell extends ConsumerWidget {
  const MerchantShell({super.key, required this.child});

  final Widget child;

  static const _tabs = [
    (path: QRoutes.orders, label: 'الطلبات', icon: Icons.receipt_long_rounded),
    (path: QRoutes.menu, label: 'المنيو', icon: Icons.restaurant_menu_rounded),
    (path: QRoutes.reports, label: 'التقارير', icon: Icons.bar_chart_rounded),
    (path: QRoutes.settings, label: 'الإعدادات', icon: Icons.settings_rounded),
  ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final location = GoRouterState.of(context).uri.path;
    final isOnline = ref.watch(isOnlineProvider);

    return Scaffold(
      body: Column(
        children: [
          if (!isOnline) const OfflineBanner(),
          Expanded(child: child),
        ],
      ),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(
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
                    // «الطلبات» يفضل مفعّل في الواردة والجارية.
                    active: location.startsWith(tab.path),
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
    final color = active ? QColors.ink : QColors.faint;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(QRadius.sm),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 23, color: color),
            const SizedBox(height: 3),
            Text(
              label,
              style: TextStyle(
                fontFamily: 'Cairo',
                fontSize: 11.5,
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

/// بانر تحذير كبير لما النت يقطع — الفرع لازم يعرف إنه مش شايف طلبات جديدة.
class OfflineBanner extends StatelessWidget {
  const OfflineBanner({super.key});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: QColors.danger,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: QSpace.screenH, vertical: 10),
          child: Row(
            children: [
              const Icon(Icons.wifi_off_rounded, size: 20, color: Colors.white),
              const SizedBox(width: 10),
              const Expanded(
                child: Text(
                  'مافيش اتصال بالإنترنت — الطلبات الجديدة مش هتوصل',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 13.5,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
