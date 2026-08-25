// شاشة ٢٢: تفاصيل الطلب — GET /orders/:id (وإعادة الطلب من /orders/:id/reorder)
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

const _sectionTitle =
    TextStyle(fontFamily: 'Cairo', fontSize: 14, fontWeight: FontWeight.w800, color: QColors.ink);

const _goldLink = TextStyle(
  fontFamily: 'Cairo',
  fontSize: 12.5,
  fontWeight: FontWeight.w800,
  color: QColors.gold,
);

const _metaLabel =
    TextStyle(fontFamily: 'Cairo', fontSize: 13, fontWeight: FontWeight.w600, color: QColors.label);

const _metaValue =
    TextStyle(fontFamily: 'Cairo', fontSize: 13, fontWeight: FontWeight.w700, color: QColors.ink);

class OrderDetailsScreen extends ConsumerWidget {
  const OrderDetailsScreen({super.key, required this.orderId});

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final order = ref.watch(orderProvider(orderId));

    return order.when(
      loading: () => const Scaffold(
        backgroundColor: QColors.canvas,
        appBar: QHeader(title: 'تفاصيل الطلب'),
        body: Center(child: CircularProgressIndicator(color: QColors.brand)),
      ),
      error: (e, _) => Scaffold(
        backgroundColor: QColors.canvas,
        appBar: const QHeader(title: 'تفاصيل الطلب'),
        body: _ErrorView(
          message: e is ApiException ? e.message : 'تعذّر تحميل الطلب',
          onRetry: () => ref.invalidate(orderProvider(orderId)),
        ),
      ),
      data: (o) => _OrderDetailsView(order: o),
    );
  }
}

class _OrderDetailsView extends ConsumerWidget {
  const _OrderDetailsView({required this.order});

  final Order order;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final showEta = order.etaLabel != null && order.status.isActive;
    final delivered = order.status == OrderStatus.delivered;
    final emoji = delivered ? '✓' : '🛵';
    final captain = order.captain;
    final pickupCode = order.pickupCode;

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: QHeader(
        title: 'طلب ${ltr(order.number)}',
        subtitle: Text(
          '$emoji ${order.status.ar}${showEta ? " — يوصل ${ltr(order.etaLabel!)}" : ""}',
          style: TextStyle(
            fontFamily: 'Cairo',
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: order.status.color,
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.all(QSpace.screenH),
        children: [
          // ── المطعم + إعادة الطلب ──
          QCard(
            padding: _cardPadding,
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
                        style: const TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 15,
                          fontWeight: FontWeight.w800,
                          color: QColors.ink,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        '${order.address.title} · ${order.address.details}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: QColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                InkWell(
                  onTap: () => _reorder(context, ref, order),
                  child: const Text('اطلب مجدداً', style: _goldLink),
                ),
              ],
            ),
          ),
          const SizedBox(height: QSpace.gap),

          // ── الأصناف + الفاتورة ──
          QCard(
            padding: _cardPadding,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('الأصناف', style: _sectionTitle),
                const SizedBox(height: 10),
                for (final line in order.lines) _LineRow(line: line),
                const Divider(color: QColors.line, height: 20),
                _BillRow(
                  label: 'التوصيل + الضريبة',
                  value: Text(
                    money(order.deliveryFee + order.vat),
                    style: QText.num(size: 13, weight: FontWeight.w700),
                  ),
                ),
                if (order.discount > 0) ...[
                  const SizedBox(height: 6),
                  _BillRow(
                    label: 'خصم ${order.couponCode ?? ''}',
                    color: QColors.success,
                    value: Text(
                      ltr('-${money(order.discount)}'),
                      style: QText.num(size: 13, weight: FontWeight.w700, color: QColors.success),
                    ),
                  ),
                ],
                const SizedBox(height: 10),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text(
                      'الإجمالي',
                      style: TextStyle(
                        fontFamily: 'Cairo',
                        fontSize: 15,
                        fontWeight: FontWeight.w900,
                        color: QColors.ink,
                      ),
                    ),
                    QPrice(value: order.total, size: 15),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: QSpace.gap),

          // ── الدفع / العنوان / الكابتن / كود الاستلام ──
          QCard(
            padding: _cardPadding,
            child: Column(
              children: [
                _MetaRow(
                  label: 'الدفع',
                  value: Text(order.paymentLabel, style: _metaValue),
                ),
                const SizedBox(height: 8),
                _MetaRow(
                  label: 'العنوان',
                  value: Text(
                    '${order.address.title} — ${order.address.details}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.end,
                    style: _metaValue,
                  ),
                ),
                if (captain != null) ...[
                  const SizedBox(height: 8),
                  _MetaRow(
                    label: 'الكابتن',
                    value: Text(
                      '${captain.name} · ${rating(captain.rating)}★',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.end,
                      style: _metaValue,
                    ),
                  ),
                ],
                if (delivered && pickupCode != null && pickupCode.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  _MetaRow(
                    label: 'كود الاستلام',
                    value: Text(
                      ltr(pickupCode),
                      style: QText.num(size: 13, weight: FontWeight.w800),
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: QSpace.gap),

          // ── الأزرار ──
          Row(
            children: [
              Expanded(
                child: order.status.isActive
                    ? QButton(
                        label: 'تتبع الطلب',
                        onPressed: () => context.push(QRoutes.track(order.id)),
                      )
                    : QButton(
                        label: 'قيّم الطلب ★',
                        onPressed: () => context.push(QRoutes.rate(order.id)),
                      ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: QButton(
                  style: QButtonStyle.outline,
                  label: 'فاتورة PDF',
                  onPressed: () => _snack(context, 'قريباً'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// GET /orders/:id/reorder — بنفتح صفحة الفرع بالمسوّدة، من غير ما نبني سلة من بيانات قديمة.
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

/// «2× تشيز برجر — وسط + جبنة» + سعر السطر.
class _LineRow extends StatelessWidget {
  const _LineRow({required this.line});

  final OrderLine line;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text.rich(
              TextSpan(
                children: [
                  TextSpan(
                    // عزل «2×» عشان الـ bidi ما يقلبهاش لـ «×2» جوّه السطر العربي.
                    text: ltr('${line.quantity}×'),
                    style: QText.num(size: 13.5, weight: FontWeight.w800, color: QColors.gold),
                  ),
                  TextSpan(text: ' ${line.name}'),
                  if (line.optionsLabel != null) TextSpan(text: ' — ${line.optionsLabel}'),
                ],
              ),
              style: const TextStyle(
                fontFamily: 'Cairo',
                fontSize: 13.5,
                fontWeight: FontWeight.w700,
                color: QColors.ink,
              ),
            ),
          ),
          const SizedBox(width: 10),
          QPrice(value: line.lineTotal, size: 13.5, showCurrency: false),
        ],
      ),
    );
  }
}

class _BillRow extends StatelessWidget {
  const _BillRow({required this.label, required this.value, this.color});

  final String label;
  final Widget value;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: _metaLabel.copyWith(color: color ?? QColors.label)),
        value,
      ],
    );
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow({required this.label, required this.value});

  final String label;
  final Widget value;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Text(label, style: _metaLabel),
        const SizedBox(width: 12),
        Expanded(child: Align(alignment: AlignmentDirectional.centerEnd, child: value)),
      ],
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
