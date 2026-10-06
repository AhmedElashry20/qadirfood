// كارت الطلب — رقم الطلب، الأصناف، الملاحظات، القيمة، وقت الورود.
// فيه ٣ أشكال: الوارد (قبول/رفض + عدّاد)، الجاري (شريط تقدّم + جاهز)، وصف السجل.
import 'dart:async';

import 'package:flutter/material.dart';

import '../core/enums.dart';
import '../core/format.dart' as fmt;
import '../core/theme.dart';
import '../models/order.dart';
import 'common.dart';
import 'countdown_timer.dart';
import 'status_chip.dart';

/// سناك بار موحّد لكل رسائل الشاشات (خطأ أو تأكيد) — أسود ونصه أصفر.
void showQSnack(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        backgroundColor: QColors.inkSurface,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 3),
        content: Text(
          message,
          style: QText.body.copyWith(color: QColors.brand),
        ),
      ),
    );
}

/// بتخلّي حالة «فاضي» أو «خطأ» قابلة للسحب عشان RefreshIndicator يشتغل عليها
/// (الـ RefreshIndicator محتاج ابن Scrollable وإلا السحب مابيتحسّش).
class QScrollableState extends StatelessWidget {
  const QScrollableState({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (_, constraints) => SingleChildScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        child: ConstrainedBox(
          constraints: BoxConstraints(minHeight: constraints.maxHeight),
          child: child,
        ),
      ),
    );
  }
}

/// «HH:MM» بأرقام لاتينية — السجل بيعرض وقت الطلب.
String qClock(DateTime time) =>
    '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}';

// ────────────────────── اختيار وقت التحضير ──────────────────────

/// شرائح ١٠/١٥/٢٠/٣٠ — المختارة سودا بنص أصفر. بتستخدمها كارت الوارد وشيت القبول.
class QPrepTimeChips extends StatelessWidget {
  const QPrepTimeChips({
    super.key,
    required this.value,
    required this.onChanged,
    this.showLabel = true,
  });

  final int value;
  final ValueChanged<int> onChanged;
  final bool showLabel;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        if (showLabel) ...[
          Text('وقت التحضير:', style: QText.tiny),
          const SizedBox(width: 8),
        ],
        for (final minutes in kPrepTimeOptions) ...[
          _PrepChip(
            minutes: minutes,
            selected: minutes == value,
            onTap: () => onChanged(minutes),
          ),
          const SizedBox(width: 6),
        ],
        const SizedBox(width: 2),
        Text(
          'دقيقة',
          style: TextStyle(
            fontFamily: 'Cairo',
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: QColors.textMuted,
          ),
        ),
      ],
    );
  }
}

class _PrepChip extends StatelessWidget {
  const _PrepChip({required this.minutes, required this.selected, required this.onTap});

  final int minutes;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        constraints: const BoxConstraints(minWidth: 42, minHeight: 36),
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(
          color: selected ? QColors.ink : QColors.chip,
          borderRadius: BorderRadius.circular(10),
        ),
        child: QLtr(
          child: Text(
            '$minutes',
            style: QText.num(
              size: 14.5,
              weight: FontWeight.w800,
              color: selected ? QColors.brand : QColors.label,
            ),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────── كارت الطلب الوارد ───────────────────────

/// كارت «طلب جديد» — إطار أصفر وهالة، عدّاد ٦٠ ثانية، وأزرار قبول/رفض.
class QIncomingOrderCard extends StatefulWidget {
  const QIncomingOrderCard({
    super.key,
    required this.order,
    required this.onAccept,
    required this.onReject,
  });

  final MerchantOrder order;

  /// بتاخد وقت التحضير المختار — الشاشة هي اللي بتنادي الـ API وبتعرض الأخطاء.
  final Future<void> Function(int prepMinutes) onAccept;
  final Future<void> Function() onReject;

  @override
  State<QIncomingOrderCard> createState() => _QIncomingOrderCardState();
}

class _QIncomingOrderCardState extends State<QIncomingOrderCard> {
  /// الافتراضي ١٥ دقيقة زي التصميم.
  int _prep = 15;
  bool _accepting = false;
  bool _rejecting = false;

  Future<void> _accept() async {
    setState(() => _accepting = true);
    try {
      await widget.onAccept(_prep);
    } finally {
      if (mounted) setState(() => _accepting = false);
    }
  }

  Future<void> _reject() async {
    setState(() => _rejecting = true);
    try {
      await widget.onReject();
    } finally {
      if (mounted) setState(() => _rejecting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final order = widget.order;
    final busy = _accepting || _rejecting;

    return QCard(
      highlighted: true,
      glow: true,
      radius: QRadius.xl,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          'طلب جديد ',
                          style: TextStyle(
                            fontFamily: 'Cairo',
                            fontSize: 16,
                            fontWeight: FontWeight.w900,
                            color: QColors.ink,
                          ),
                        ),
                        // رقم الطلب لاتيني — لازم عزل bidi وإلا «#A-1010» بيتقلب.
                        QLtr(
                          child: Text(
                            '#${order.number}',
                            style: QText.num(size: 16, weight: FontWeight.w800),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(
                      '${order.customerName} · ${order.channel.ar} · ${order.paymentLabel}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: QText.tiny.copyWith(fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              QCountdownRing(placedAt: order.placedAt),
            ],
          ),
          const SizedBox(height: 13),
          _ItemsBlock(order: order),
          const SizedBox(height: 13),
          QPrepTimeChips(
            value: _prep,
            onChanged: (minutes) => setState(() => _prep = minutes),
          ),
          const SizedBox(height: 13),
          Row(
            children: [
              Expanded(
                flex: 10,
                child: QButton(
                  label: 'رفض — بسبب إلزامي ▾',
                  style: QButtonStyle.outline,
                  enabled: !busy,
                  loading: _rejecting,
                  onPressed: _reject,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                flex: 22,
                child: QButton(
                  label: 'قبول — $_prep دقيقة ✓',
                  enabled: !busy,
                  loading: _accepting,
                  onPressed: _accept,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// بلوك الأصناف الرمادي جوّه الكارت + ملاحظة العميل بالأحمر.
class _ItemsBlock extends StatelessWidget {
  const _ItemsBlock({required this.order});

  final MerchantOrder order;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: QColors.canvas,
        borderRadius: BorderRadius.circular(13),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < order.items.length; i++) ...[
            if (i != 0) const SizedBox(height: 8),
            _ItemRow(item: order.items[i]),
          ],
          if (order.hasNotes) ...[
            const SizedBox(height: 10),
            Text(
              '📝 ${order.customerNotes!.trim()}',
              style: TextStyle(
                fontFamily: 'Cairo',
                fontSize: 12,
                fontWeight: FontWeight.w700,
                color: QColors.danger,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _ItemRow extends StatelessWidget {
  const _ItemRow({required this.item});

  final MerchantOrderItem item;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text.rich(
            TextSpan(
              children: [
                // الكمية Outfit وذهبي — أول حاجة العين بتشوفها في المطبخ.
                TextSpan(
                  text: fmt.ltr('${item.quantity}×'),
                  style: QText.num(size: 14, weight: FontWeight.w800, color: QColors.gold),
                ),
                TextSpan(
                  text: ' ${item.nameAr}${item.hasOptions ? ' — ${item.optionsLabel}' : ''}',
                  style: QText.body.copyWith(fontSize: 14),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(width: 10),
        QLtr(child: Text(fmt.money(item.lineTotal), style: QText.num(size: 14))),
      ],
    );
  }
}

// ─────────────────────── كارت الطلب الجاري ───────────────────────

/// كارت المطبخ — شارة وقت + شريط تقدّم + زر «جاهز».
/// بيعيد الحساب كل ٣٠ ثانية عشان الدقايق الفاضلة تفضل صح من غير ما نعيد الجلب.
class QActiveOrderCard extends StatefulWidget {
  const QActiveOrderCard({
    super.key,
    required this.order,
    required this.onStartPreparing,
    required this.onMarkReady,
    required this.onOpenDelivery,
  });

  final MerchantOrder order;
  final Future<void> Function() onStartPreparing;
  final Future<void> Function() onMarkReady;
  final VoidCallback onOpenDelivery;

  @override
  State<QActiveOrderCard> createState() => _QActiveOrderCardState();
}

class _QActiveOrderCardState extends State<QActiveOrderCard> {
  Timer? _ticker;
  bool _busyReady = false;
  bool _busyPreparing = false;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 30), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action, {required bool ready}) async {
    setState(() => ready ? _busyReady = true : _busyPreparing = true);
    try {
      await action();
    } finally {
      if (mounted) setState(() => ready ? _busyReady = false : _busyPreparing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final order = widget.order;
    final isReady =
        order.status == OrderStatus.ready || order.status == OrderStatus.captainAssigned;
    final busy = _busyReady || _busyPreparing;

    return QCard(
      radius: QRadius.xl,
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Row(
                  children: [
                    QLtr(
                      child: Text(
                        '#${order.number}',
                        style: QText.num(size: 15, weight: FontWeight.w800),
                      ),
                    ),
                    Flexible(
                      child: Text(
                        ' · ${order.customerName}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 15,
                          fontWeight: FontWeight.w900,
                          color: QColors.ink,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              QPrepTimerChip(
                remainingMinutes: order.remainingMinutes,
                isLate: order.isLate,
                isReady: isReady,
              ),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(QRadius.pill),
            child: LinearProgressIndicator(
              value: order.progress,
              minHeight: 7,
              backgroundColor: QColors.chip,
              color: order.isLate ? QColors.danger : QColors.brand,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            _meta(order),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: QText.tiny.copyWith(fontSize: 12.5, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 12),
          if (isReady)
            QButton(
              label: 'تفاصيل التسليم',
              style: QButtonStyle.dark,
              onPressed: widget.onOpenDelivery,
            )
          else ...[
            if (order.status == OrderStatus.accepted) ...[
              QButton(
                label: 'بدء التحضير',
                style: QButtonStyle.outline,
                enabled: !busy,
                loading: _busyPreparing,
                onPressed: () => _run(widget.onStartPreparing, ready: false),
              ),
              const SizedBox(height: 10),
            ],
            QButton(
              label: 'جاهز ✓',
              style: QButtonStyle.dark,
              enabled: !busy,
              loading: _busyReady,
              onPressed: () => _run(widget.onMarkReady, ready: true),
            ),
          ],
        ],
      ),
    );
  }

  /// «٣ صنف · الكابتن سعد في الطريق للفرع» أو «٣ صنف · توصيل».
  String _meta(MerchantOrder order) {
    final captain = order.captain;
    final tail = captain != null
        ? 'الكابتن ${captain.name}'
            '${order.status == OrderStatus.captainAssigned ? ' في الطريق للفرع' : ''}'
        : order.channel.ar;
    return '${fmt.ltr('${order.itemCount}')} صنف · $tail';
  }
}

// ─────────────────────── صف السجل ───────────────────────

/// صف في «سجل الطلبات» — المرفوض/الملغي بيبهت والمبلغ بيبقى 0.00 أحمر.
class QHistoryOrderRow extends StatelessWidget {
  const QHistoryOrderRow({super.key, required this.order});

  final MerchantOrder order;

  @override
  Widget build(BuildContext context) {
    final isCancelled =
        order.status == OrderStatus.rejected || order.status == OrderStatus.cancelled;

    final meta = StringBuffer('${qClock(order.placedAt)} · ${order.itemCount} صنف');
    if (isCancelled && (order.rejectReason?.trim().isNotEmpty ?? false)) {
      meta.write(' · ${order.rejectReason!.trim()}');
    }

    final row = QCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    QLtr(
                      child: Text(
                        '#${order.number}',
                        style: QText.num(size: 14, weight: FontWeight.w800),
                      ),
                    ),
                    Flexible(
                      child: Text(
                        ' · ${order.customerName} · ${order.channel.ar}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          color: QColors.ink,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                // الوقت والعدد أرقام لاتينية — بنعزلهم كوحدة واحدة.
                Text(
                  fmt.ltr(meta.toString()),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  textDirection: TextDirection.rtl,
                  style: QText.tiny.copyWith(fontSize: 11.5, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              QLtr(
                child: Text(
                  isCancelled ? '0.00' : fmt.money(order.total),
                  style: QText.num(
                    size: 15,
                    weight: FontWeight.w800,
                    color: isCancelled ? QColors.danger : QColors.ink,
                  ),
                ),
              ),
              const SizedBox(height: 3),
              Text(
                isCancelled ? '✕ ملغي' : '✓ مكتمل',
                style: TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 11.5,
                  fontWeight: FontWeight.w800,
                  color: isCancelled ? QColors.danger : QColors.success,
                ),
              ),
            ],
          ),
        ],
      ),
    );

    return isCancelled ? Opacity(opacity: 0.6, child: row) : row;
  }
}
