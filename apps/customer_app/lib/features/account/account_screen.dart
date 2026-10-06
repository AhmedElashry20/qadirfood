// شاشة ٢٦: حسابي — البيانات من GET /customer/me (مافيش نظام نقاط ولا مستويات في السيرفر).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/format.dart' as fmt;
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../data/api_repository.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/common.dart';

class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  Future<void> _logout(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(authProvider.notifier).logout();
      if (!context.mounted) return;
      context.go(QRoutes.login);
    } on ApiException catch (e) {
      if (!context.mounted) return;
      _snack(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(profileProvider);

    return Scaffold(
      backgroundColor: QColors.canvas,
      body: Column(
        children: [
          _AccountHeader(profile: profile),
          Expanded(
            child: ListView(
              padding:
                  const EdgeInsets.fromLTRB(QSpace.screenH, 16, QSpace.screenH, QSpace.screenH),
              children: [
                _MenuCard(
                  title: 'الطلبات السابقة',
                  emoji: '🧾',
                  onTap: () => context.go(QRoutes.myOrders),
                ),
                const SizedBox(height: 10),
                _MenuCard(
                  title: 'المفضلة',
                  emoji: '❤️',
                  onTap: () => context.push(QRoutes.favorites),
                ),
                const SizedBox(height: 10),
                _MenuCard(
                  title: 'عناويني',
                  emoji: '📍',
                  onTap: () => context.push(QRoutes.addresses),
                ),
                const SizedBox(height: 10),
                _MenuCard(
                  title: 'طرق الدفع',
                  emoji: '💳',
                  onTap: () => context.push(QRoutes.paymentMethods),
                ),
                const SizedBox(height: 10),
                _MenuCard(
                  title: 'الكوبونات والمحفظة',
                  emoji: '🎁',
                  onTap: () => context.push(QRoutes.wallet),
                ),
                const SizedBox(height: 10),
                _MenuCard(
                  title: 'نقاطي',
                  emoji: '⭐',
                  onTap: () => context.push(QRoutes.loyalty),
                ),
                const SizedBox(height: 10),
                _MenuCard(
                  title: 'ادعُ أصدقاءك',
                  emoji: '🤝',
                  onTap: () => context.push(QRoutes.referral),
                ),
                const SizedBox(height: 10),
                _MenuCard(
                  title: 'الإشعارات',
                  emoji: '🔔',
                  onTap: () => context.push(QRoutes.notifications),
                ),
                const SizedBox(height: 10),
                _MenuCard(
                  title: 'الدعم والمساعدة',
                  emoji: '🎧',
                  onTap: () => context.push(QRoutes.support),
                ),
                const SizedBox(height: 10),
                _MenuCard(
                  title: 'الإعدادات',
                  emoji: '⚙️',
                  onTap: () => context.push(QRoutes.settings),
                ),
                const SizedBox(height: 10),
                _MenuCard(
                  title: 'تسجيل الخروج',
                  emoji: '🚪',
                  onTap: () => _logout(context, ref),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// هيدر أسود: الأڤاتار + الاسم + الجوال + ٣ مربعات إحصائية (كلها من الـ API).
class _AccountHeader extends ConsumerWidget {
  const _AccountHeader({required this.profile});

  final AsyncValue<CustomerProfile> profile;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final me = profile.value;
    final failed = profile.hasError && me == null;

    final name = me?.fullName ?? (failed ? 'تعذّر تحميل بياناتك' : '…');
    final initial =
        (me?.fullName.isNotEmpty ?? false) ? me!.fullName.substring(0, 1).toUpperCase() : '؟';

    // الأرقام تفضل «—» لحد ما البروفايل يوصل — مش أصفار وهمية.
    final wallet = me == null ? '—' : fmt.money(me.walletBalance);
    final orders = me == null ? '—' : '${me.ordersCount}';
    final favorites = me == null ? '—' : '${me.favoritesCount}';

    return Container(
      decoration: BoxDecoration(
        color: QColors.inkSurface,
        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(28)),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(QSpace.screenH, 12, QSpace.screenH, QSpace.screenH),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 18),
              Row(
                children: [
                  Container(
                    width: 64,
                    height: 64,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: QColors.brand, shape: BoxShape.circle),
                    child: Text(initial, style: QText.num(size: 24, color: QColors.ink)),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontFamily: 'Cairo',
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Directionality(
                          textDirection: TextDirection.ltr,
                          child: Text(
                            me?.phone ?? '',
                            style: TextStyle(
                              fontFamily: 'Outfit',
                              fontSize: 12.5,
                              fontWeight: FontWeight.w600,
                              color: QColors.darkSub,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (failed) ...[
                    const SizedBox(width: 10),
                    InkWell(
                      onTap: () => ref.invalidate(profileProvider),
                      borderRadius: BorderRadius.circular(QRadius.pill),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
                        decoration: BoxDecoration(
                          color: QColors.brand,
                          borderRadius: BorderRadius.circular(QRadius.pill),
                        ),
                        child: Text(
                          'إعادة المحاولة',
                          style: TextStyle(
                            fontFamily: 'Cairo',
                            fontSize: 11.5,
                            fontWeight: FontWeight.w800,
                            color: QColors.ink,
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(child: _StatBox(value: wallet, label: 'المحفظة (ر.س)')),
                  const SizedBox(width: 10),
                  Expanded(child: _StatBox(value: orders, label: 'طلباتك')),
                  const SizedBox(width: 10),
                  Expanded(child: _StatBox(value: favorites, label: 'المفضلة')),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatBox extends StatelessWidget {
  const _StatBox({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: QColors.inkSoft,
        borderRadius: BorderRadius.circular(QRadius.md),
      ),
      child: Column(
        children: [
          Text(value, style: QText.num(size: 16, color: QColors.brand)),
          const SizedBox(height: 2),
          Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: QColors.darkSub,
            ),
          ),
        ],
      ),
    );
  }
}

/// كل صف في «حسابي» كارت أبيض لوحده.
class _MenuCard extends StatelessWidget {
  const _MenuCard({required this.title, required this.emoji, required this.onTap});

  final String title;
  final String emoji;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: QColors.surface,
        borderRadius: BorderRadius.circular(QRadius.lg),
        boxShadow: kCardShadow,
      ),
      clipBehavior: Clip.antiAlias,
      child: QListTile(title: title, emoji: emoji, onTap: onTap),
    );
  }
}

void _snack(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(message, style: QText.body.copyWith(color: QColors.brand)),
        behavior: SnackBarBehavior.floating,
        backgroundColor: QColors.inkSurface,
        duration: const Duration(seconds: 3),
      ),
    );
}
