// شاشة ٢٣: طلباتي — من الـ API (GET /orders) مع سحب للتحديث وإلغاء الطلب الجديد.
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

const _cardPadding = EdgeInsets.symmetric(horizontal: 16, vertical: 14);

const _name = TextStyle(
  fontFamily: 'Cairo',
  fontSize: 15,
  fontWeight: FontWeight.w800,
  color: QColors.ink,
);

class MyOrdersScreen extends ConsumerStatefulWidget {
  const MyOrdersScreen({super.key});

  @override
  ConsumerState<MyOrdersScreen> createState() => _MyOrdersScreenState();
}

class _MyOrdersScreenState extends ConsumerState<MyOrdersScreen> {
  OrdersTab _tab = OrdersTab.current;

  @override
  Widget build(BuildContext context) {
    // القائمة الكاملة (للتحميل/الخطأ) + المرشّحة للتبويب الحالي.
    final all = ref.watch(ordersProvider);
    final orders = ref.watch(ordersByTabProvider(_tab));

    return Scaffold(
      backgroundColor: QColors.canvas,
      body: Column(
        children: [
          // ── هيدر بدون زر رجوع (الشاشة جوّه الشل السفلي) ──
          Container(
            decoration: const BoxDecoration(
              color: QColors.surface,
              border: Border(bottom: BorderSide(color: QColors.line)),
            ),
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(QSpace.screenH, 12, QSpace.screenH, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('طلباتي', style: QText.screenTitle),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        for (final t in OrdersTab.values) ...[
                          QChip(
                            label: t.ar,
                            selected: t == _tab,
                            onTap: () => setState(() => _tab = t),
                          ),
                          const SizedBox(width: 8),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),

          Expanded(
            child: all.when(
              loading: () => const Center(
                child: CircularProgressIndicator(color: QColors.brand),
              ),
              error: (e, _) => _ErrorView(
                message: e is ApiException ? e.message : 'تعذّر تحميل الطلبات',
                onRetry: () => ref.invalidate(ordersProvider),
              ),
              data: (_) => RefreshIndicator(
                color: QColors.ink,
                backgroundColor: QColors.brand,
                onRefresh: () => ref.read(ordersProvider.notifier).refresh(),
                child: orders.isEmpty
                    ? ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.all(QSpace.screenH),
                        children: const [QEmpty(message: 'مافي طلبات هنا', emoji: '🧾')],
                      )
                    : ListView.separated(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.all(QSpace.screenH),
                        itemCount: orders.length,
                        separatorBuilder: (_, __) => const SizedBox(height: QSpace.gap),
                        itemBuilder: (_, i) {
                          final o = orders[i];
                          if (o.status.isActive) return _ActiveOrderCard(order: o);
                          if (o.status.isCancelledOrRejected) return _CancelledOrderCard(order: o);
                          return _DoneOrderCard(order: o);
                        },
                      ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// الطلب الجاري — إطار أصفر + زر تتبع (+ إلغاء وهو لسه PENDING).
class _ActiveOrderCard extends ConsumerWidget {
  const _ActiveOrderCard({required this.order});

  final Order order;

  /// السيرفر بيسمح بالإلغاء وهو PENDING بس — بعد ما المطعم يأكّد بيرمي ApiException.
  Future<void> _cancel(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: QColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(QRadius.lg)),
        title: const Text('إلغاء الطلب؟', style: QText.section),
        content: const Text(
          'الإلغاء متاح طول ما المطعم لسه ما أكّدش الطلب.',
          style: QText.bodyMuted,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('تراجع', style: QText.body),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text('إلغاء الطلب', style: QText.body.copyWith(color: QColors.danger)),
          ),
        ],
      ),
    );

    if (confirmed != true || !context.mounted) return;

    try {
      await ref.read(ordersProvider.notifier).cancel(order.id);
      if (!context.mounted) return;
      _snack(context, 'تم إلغاء الطلب');
    } on ApiException catch (e) {
      if (!context.mounted) return;
      _snack(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // «9:15 PM» لازم يتعزل عشان ما ينقلبش جوّه الجملة العربية.
    final eta = order.etaLabel == null ? '' : ' — يوصل ${ltr(order.etaLabel!)}';
    final canCancel = order.status == OrderStatus.pending;

    return QCard(
      selected: true,
      padding: _cardPadding,
      onTap: () => context.push(QRoutes.orderDetails(order.id)),
      child: Column(
        children: [
          Row(
            children: [
              QImage(url: order.restaurantImageUrl, width: 52, height: 52, radius: QRadius.md),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      order.restaurantName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: _name,
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '🛵 ${order.status.ar}$eta',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontFamily: 'Cairo',
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: QColors.gold,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              QPrice(value: order.total, size: 14),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: QButton(
                  label: 'تتبع الطلب',
                  onPressed: () => context.push(QRoutes.track(order.id)),
                ),
              ),
              if (canCancel) ...[
                const SizedBox(width: 10),
                Expanded(
                  child: QButton(
                    style: QButtonStyle.outline,
                    label: 'إلغاء الطلب',
                    onPressed: () => _cancel(context, ref),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

/// طلب متسلّم — الضغط يفتح الفاتورة السابقة.
class _DoneOrderCard extends ConsumerWidget {
  const _DoneOrderCard({required this.order});

  final Order order;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return QCard(
      padding: _cardPadding,
      onTap: () => context.push(QRoutes.pastOrder(order.id)),
      child: Row(
        children: [
          QImage(url: order.restaurantImageUrl, width: 52, height: 52, radius: QRadius.md),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  order.restaurantName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: _name,
                ),
                const SizedBox(height: 2),
                Text(
                  '✓ ${order.status.ar} — ${order.placedAtLabel}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: QColors.success,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  order.itemsSummary,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 11.5,
                    fontWeight: FontWeight.w600,
                    color: QColors.textMuted,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              QPrice(value: order.total, size: 14, showCurrency: false),
              const SizedBox(height: 4),
              InkWell(
                onTap: () => _reorder(context, ref, order),
                child: const Text(
                  'اطلب مجدداً',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 11.5,
                    fontWeight: FontWeight.w800,
                    color: QColors.gold,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// طلب ملغي/مرفوض.
class _CancelledOrderCard extends StatelessWidget {
  const _CancelledOrderCard({required this.order});

  final Order order;

  @override
  Widget build(BuildContext context) {
    return QCard(
      padding: _cardPadding,
      onTap: () => context.push(QRoutes.pastOrder(order.id)),
      child: Row(
        children: [
          QImage(url: order.restaurantImageUrl, width: 52, height: 52, radius: QRadius.md),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  order.restaurantName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: _name,
                ),
                const SizedBox(height: 2),
                Text(
                  '✕ ${order.status.ar} — ${order.placedAtLabel}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: QColors.danger,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          QPrice(value: order.total, size: 14, color: QColors.hint, showCurrency: false),
        ],
      ),
    );
  }
}

/// «اطلب مجدداً» — GET /orders/:id/reorder ثم فتح صفحة الفرع.
/// مابنبنيش سلة من بيانات قديمة: المستخدم بيراجع الأصناف في المنيو الحالي.
Future<void> _reorder(BuildContext context, WidgetRef ref, Order order) async {
  try {
    final draft = await ref.read(ordersProvider.notifier).reorder(order.id);
    if (!context.mounted) return;

    context.push(QRoutes.restaurant(draft.branchId.isEmpty ? order.branchId : draft.branchId));
    _snack(
      context,
      draft.hasUnavailable ? 'بعض الأصناف مش متوفرة دلوقتي' : 'ضفنا أصناف الطلب — راجعها قبل الدفع',
    );
  } on ApiException catch (e) {
    if (!context.mounted) return;
    _snack(context, e.message);
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

void _snack(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(message, style: QText.body.copyWith(color: QColors.brand)),
        behavior: SnackBarBehavior.floating,
        backgroundColor: QColors.ink,
        duration: const Duration(seconds: 3),
      ),
    );
}
