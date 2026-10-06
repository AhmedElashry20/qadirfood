// شاشة ٦: سجل الطلبات — المنتهية والملغاة + فلاتر (اليوم/الأسبوع/الملغية)
// + أسباب الإلغاء في سطر الميتا.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/enums.dart';
import '../../core/format.dart' as fmt;
import '../../core/theme.dart';
import '../../models/order.dart';
import '../../providers/orders_provider.dart';
import '../../widgets/common.dart';
import '../../widgets/order_card.dart';

class OrderHistoryScreen extends ConsumerStatefulWidget {
  const OrderHistoryScreen({super.key});

  @override
  ConsumerState<OrderHistoryScreen> createState() => _OrderHistoryScreenState();
}

class _OrderHistoryScreenState extends ConsumerState<OrderHistoryScreen> {
  HistoryFilter _filter = HistoryFilter.today;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(historyProvider(_filter));

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: QHeader(
        title: 'سجل الطلبات',
        bottom: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              for (final filter in HistoryFilter.values) ...[
                QChip(
                  label: filter.label,
                  selected: _filter == filter,
                  onTap: () => setState(() => _filter = filter),
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
        onRefresh: () async => ref.invalidate(historyProvider(_filter)),
        child: async.when(
          loading: () => const QLoading(),
          error: (e, _) => QScrollableState(
            child: QErrorView(
              message: e is ApiException ? e.message : 'حدث خطأ',
              onRetry: () => ref.invalidate(historyProvider(_filter)),
            ),
          ),
          data: (orders) => orders.isEmpty
              ? const QScrollableState(
                  child: QEmpty(message: 'لا توجد طلبات في هذه المدة', emoji: '🧾'),
                )
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(
                    QSpace.screenH,
                    QSpace.gapLg,
                    QSpace.screenH,
                    32,
                  ),
                  // أول عنصر هو كارت الملخّص الأسود.
                  itemCount: orders.length + 1,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, i) => i == 0
                      ? _SummaryCard(filter: _filter, orders: orders)
                      : QHistoryOrderRow(order: orders[i - 1]),
                ),
        ),
      ),
    );
  }
}

/// كارت أسود بإجمالي المدة المختارة — بنستبعد المرفوض/الملغي من المجموع (قيمتهم صفر).
class _SummaryCard extends StatelessWidget {
  const _SummaryCard({required this.filter, required this.orders});

  final HistoryFilter filter;
  final List<MerchantOrder> orders;

  @override
  Widget build(BuildContext context) {
    var total = 0.0;
    for (final order in orders) {
      final cancelled =
          order.status == OrderStatus.rejected || order.status == OrderStatus.cancelled;
      if (!cancelled) total += order.total;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
      decoration: BoxDecoration(
        color: QColors.inkSurface,
        borderRadius: BorderRadius.circular(QRadius.lg),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(
                      '${filter.label} — ',
                      style: TextStyle(
                        fontFamily: 'Cairo',
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: QColors.darkSub,
                      ),
                    ),
                    QLtr(
                      child: Text(
                        '${orders.length}',
                        style: QText.num(size: 12.5, color: QColors.darkSub),
                      ),
                    ),
                    Text(
                      ' طلب',
                      style: TextStyle(
                        fontFamily: 'Cairo',
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: QColors.darkSub,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                // مش QPrice لأن التصميم بيحدد «ر.س» بـ 13 ثابتة مش نسبة من الرقم.
                Text.rich(
                  TextSpan(
                    text: fmt.money(total),
                    style: QText.num(size: 22, weight: FontWeight.w800, color: QColors.brand),
                    children: [
                      TextSpan(
                        text: ' ر.س',
                        style: TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: QColors.brand,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const Text('📈', style: TextStyle(fontSize: 26)),
        ],
      ),
    );
  }
}
