// شاشة ٤: الطلبات الجارية — تبويبات (قيد التحضير → جاهز → بانتظار الكابتن)
// + بيانات الكابتن المسند. الفلترة كلها على العميل من نفس قائمة /orders/active.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/enums.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../models/order.dart';
import '../../providers/orders_provider.dart';
import '../../widgets/common.dart';
import '../../widgets/order_card.dart';

/// تبويبات الشاشة — كل تبويب بيفلتر حالات معيّنة من قائمة الطلبات الجارية.
enum _ActiveTab {
  preparing('قيد التحضير', [OrderStatus.accepted, OrderStatus.preparing]),
  ready('جاهز', [OrderStatus.ready]),
  awaiting('بانتظار الكابتن', [OrderStatus.captainAssigned]);

  const _ActiveTab(this.label, this.statuses);

  final String label;
  final List<OrderStatus> statuses;
}

class ActiveOrdersScreen extends ConsumerStatefulWidget {
  const ActiveOrdersScreen({super.key});

  @override
  ConsumerState<ActiveOrdersScreen> createState() => _ActiveOrdersScreenState();
}

class _ActiveOrdersScreenState extends ConsumerState<ActiveOrdersScreen> {
  _ActiveTab _tab = _ActiveTab.preparing;

  Future<void> _startPreparing(MerchantOrder order) async {
    try {
      await ref.read(activeOrdersProvider.notifier).markPreparing(order.id);
      if (!mounted) return;
      showQSnack(context, 'بدأ تحضير الطلب');
    } on ApiException catch (e) {
      if (!mounted) return;
      showQSnack(context, e.message);
    } catch (_) {
      if (!mounted) return;
      showQSnack(context, 'حدث خطأ، حاول مرة أخرى');
    }
  }

  Future<void> _markReady(MerchantOrder order) async {
    try {
      await ref.read(activeOrdersProvider.notifier).markReady(order.id);
      if (!mounted) return;
      // مش مستنيين الرجوع من شاشة «جاهز للاستلام» — التحديث بييجي من السوكيت.
      unawaited(context.push(QRoutes.ready(order.id)));
    } on ApiException catch (e) {
      if (!mounted) return;
      showQSnack(context, e.message);
    } catch (_) {
      if (!mounted) return;
      showQSnack(context, 'حدث خطأ، حاول مرة أخرى');
    }
  }

  @override
  Widget build(BuildContext context) {
    // نفس نقطة الربط بتاعة الواردة — بتحدّث القائمة على status_changed و captain_assigned.
    ref.watch(socketRefreshProvider);

    final async = ref.watch(activeOrdersProvider);
    final counts = {
      _ActiveTab.preparing: ref.watch(preparingCountProvider),
      _ActiveTab.ready: ref.watch(readyCountProvider),
      _ActiveTab.awaiting: ref.watch(awaitingCaptainCountProvider),
    };

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: QHeader(
        title: 'الطلبات الجارية',
        showBack: false,
        bottom: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              for (final tab in _ActiveTab.values) ...[
                QChip(
                  label: tab.label,
                  count: counts[tab],
                  selected: _tab == tab,
                  onTap: () => setState(() => _tab = tab),
                ),
                const SizedBox(width: 8),
              ],
            ],
          ),
        ),
      ),
      body: RefreshIndicator(
        color: QColors.ink,
        backgroundColor: QColors.brand,
        onRefresh: () => ref.read(activeOrdersProvider.notifier).refresh(),
        child: async.when(
          loading: () => const QLoading(),
          error: (e, _) => QScrollableState(
            child: QErrorView(
              message: e is ApiException ? e.message : 'حدث خطأ',
              onRetry: () => ref.invalidate(activeOrdersProvider),
            ),
          ),
          data: (all) {
            final orders = [
              for (final order in all)
                if (_tab.statuses.contains(order.status)) order,
            ];

            if (orders.isEmpty) {
              return const QScrollableState(
                child: QEmpty(message: 'لا توجد طلبات في المطبخ الآن', emoji: '🍳'),
              );
            }

            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(
                QSpace.screenH,
                QSpace.gapLg,
                QSpace.screenH,
                32,
              ),
              itemCount: orders.length,
              separatorBuilder: (_, __) => const SizedBox(height: QSpace.gap),
              itemBuilder: (_, i) {
                final order = orders[i];
                return QActiveOrderCard(
                  key: ValueKey(order.id),
                  order: order,
                  onStartPreparing: () => _startPreparing(order),
                  onMarkReady: () => _markReady(order),
                  onOpenDelivery: () => context.push(QRoutes.ready(order.id)),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
