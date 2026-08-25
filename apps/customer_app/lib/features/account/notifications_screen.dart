// شاشة ٢٩: الإشعارات — مافيش API للإشعارات لسه، فالقائمة مبنية على طلبات العميل الحقيقية (GET /orders).
// الإشعارات الفورية (Push) هتشتغل لما Firebase يترّبط.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/enums.dart';
import '../../core/format.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../models/order.dart';
import '../../providers/orders_provider.dart';
import '../../widgets/common.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final orders = ref.watch(ordersProvider);

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: const QHeader(title: 'الإشعارات'),
      body: orders.when(
        loading: () => const Center(child: CircularProgressIndicator(color: QColors.brand)),
        error: (e, _) => _ErrorView(
          message: e is ApiException ? e.message : 'تعذّر تحميل الإشعارات',
          onRetry: () => ref.invalidate(ordersProvider),
        ),
        data: (list) => _NotificationsList(orders: list),
      ),
    );
  }
}

class _NotificationsList extends StatelessWidget {
  const _NotificationsList({required this.orders});

  final List<Order> orders;

  static bool _isToday(Order o) {
    final at = o.placedAt;
    if (at == null) return false;
    final now = DateTime.now();
    return at.year == now.year && at.month == now.month && at.day == now.day;
  }

  @override
  Widget build(BuildContext context) {
    if (orders.isEmpty) {
      return ListView(
        padding: const EdgeInsets.all(QSpace.screenH),
        children: const [
          QEmpty(message: 'مافي إشعارات — أول ما تطلب هتلاقي تحديثات طلبك هنا', emoji: '🔔'),
          SizedBox(height: 14),
          _FirebaseNote(),
        ],
      );
    }

    final firstToday = orders.indexWhere(_isToday);
    final firstOlder = orders.indexWhere((o) => !_isToday(o));

    return ListView(
      padding: const EdgeInsets.all(QSpace.screenH),
      children: [
        for (var i = 0; i < orders.length; i++) ...[
          if (i == firstToday) ...[
            const _GroupLabel('اليوم'),
            const SizedBox(height: 10),
          ] else if (i == firstOlder) ...[
            if (i != 0) const SizedBox(height: 6),
            const _GroupLabel('أقدم'),
            const SizedBox(height: 10),
          ],
          _OrderNotificationTile(order: orders[i]),
          if (i != orders.length - 1) const SizedBox(height: 10),
        ],
        const SizedBox(height: 14),
        const _FirebaseNote(),
      ],
    );
  }
}

class _GroupLabel extends StatelessWidget {
  const _GroupLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        fontFamily: 'Cairo',
        fontSize: 12,
        fontWeight: FontWeight.w800,
        color: QColors.faint,
      ),
    );
  }
}

/// صف الإشعار = طلب حقيقي. الطلب الشغّال بيبان بخلفية صفرا فاتحة (زي غير المقروء).
class _OrderNotificationTile extends StatelessWidget {
  const _OrderNotificationTile({required this.order});

  final Order order;

  String get _emoji => switch (order.status) {
        OrderStatus.delivered => '✓',
        OrderStatus.cancelled || OrderStatus.rejected => '✕',
        OrderStatus.pending => '🧾',
        _ => '🛵',
      };

  @override
  Widget build(BuildContext context) {
    final active = order.status.isActive;

    return Container(
      decoration: BoxDecoration(
        color: active ? QColors.tint : QColors.surface,
        borderRadius: BorderRadius.circular(QRadius.lg),
        boxShadow: kCardShadow,
      ),
      clipBehavior: Clip.antiAlias,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: () => context.push(
            active ? QRoutes.orderDetails(order.id) : QRoutes.pastOrder(order.id),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 42,
                  height: 42,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: active ? QColors.brand : QColors.chip,
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: Text(_emoji, style: const TextStyle(fontSize: 18)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'طلبك من ${order.restaurantName}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 13.5,
                          fontWeight: FontWeight.w800,
                          color: QColors.ink,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        '${order.status.ar} — ${order.placedAtLabel}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: active ? QColors.goldDeep : QColors.textMuted,
                        ),
                      ),
                      const SizedBox(height: 5),
                      Text(
                        ltr(order.number),
                        style: QText.num(size: 11, weight: FontWeight.w600, color: QColors.hint),
                      ),
                    ],
                  ),
                ),
                if (active) ...[
                  const SizedBox(width: 8),
                  Container(
                    width: 9,
                    height: 9,
                    margin: const EdgeInsets.only(top: 4),
                    decoration: const BoxDecoration(
                      color: QColors.danger,
                      shape: BoxShape.circle,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// شفافية: الإشعارات دي مبنية على الطلبات، مش على نظام إشعارات حقيقي.
class _FirebaseNote extends StatelessWidget {
  const _FirebaseNote();

  @override
  Widget build(BuildContext context) {
    return const Text(
      'الإشعارات الفورية هتشتغل مع ربط Firebase',
      textAlign: TextAlign.center,
      style: TextStyle(
        fontFamily: 'Cairo',
        fontSize: 11.5,
        fontWeight: FontWeight.w600,
        color: QColors.faint,
      ),
    );
  }
}

/// خطأ تحميل + إعادة محاولة.
class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(QSpace.screenH),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message, textAlign: TextAlign.center, style: QText.body),
            const SizedBox(height: QSpace.gapLg),
            QButton(label: 'إعادة المحاولة', onPressed: onRetry),
          ],
        ),
      ),
    );
  }
}
