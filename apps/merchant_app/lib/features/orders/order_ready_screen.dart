// شاشة ٥: جاهز للاستلام — كود الاستلام كبير للمطابقة + بيانات الكابتن
// + تشيك ليست التعبئة + حالة الدفع.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/enums.dart';
import '../../core/format.dart' as fmt;
import '../../core/theme.dart';
import '../../models/order.dart';
import '../../providers/orders_provider.dart';
import '../../widgets/common.dart';
import '../../widgets/order_card.dart';

/// أخضر غامق لعنوان بلوك النجاح — نغمة أغمق من QColors.success مش موجودة في التوكنز.
const _successInk = Color(0xFF0B7A45);

/// أخضر مطفي للسطر التاني في بلوك النجاح.
const _successMuted = Color(0xFF4A8A68);

class OrderReadyScreen extends ConsumerStatefulWidget {
  const OrderReadyScreen({super.key, required this.orderId});

  final String orderId;

  @override
  ConsumerState<OrderReadyScreen> createState() => _OrderReadyScreenState();
}

class _OrderReadyScreenState extends ConsumerState<OrderReadyScreen> {
  /// الأصناف اللي الموظف علّم عليها إنها اتعبّت — حالة محلية بس (مافيش endpoint ليها).
  final _packed = <String>{};

  @override
  Widget build(BuildContext context) {
    ref.watch(socketRefreshProvider);
    final async = ref.watch(orderProvider(widget.orderId));
    final order = async.value;

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: QHeader(
        // رقم الطلب لاتيني — بنعزله بـ U+2066…U+2069 وإلا الـ bidi بيرميه لأول السطر.
        title: order == null ? 'الطلب' : 'طلب ${fmt.ltr('#${order.number}')}',
      ),
      body: async.when(
        loading: () => const QLoading(),
        error: (e, _) => QErrorView(
          message: e is ApiException ? e.message : 'حدث خطأ',
          onRetry: () => ref.invalidate(orderProvider(widget.orderId)),
        ),
        data: (order) => ListView(
          padding: const EdgeInsets.fromLTRB(QSpace.screenH, 18, QSpace.screenH, 24),
          children: [
            _PickupBlock(code: order.pickupCode),
            const SizedBox(height: 14),
            _CaptainCard(order: order),
            const SizedBox(height: 14),
            _PackingList(
              order: order,
              packed: _packed,
              onToggle: (id) => setState(() {
                _packed.contains(id) ? _packed.remove(id) : _packed.add(id);
              }),
            ),
            const SizedBox(height: 14),
            _PaymentStrip(order: order),
          ],
        ),
      ),
      bottomNavigationBar: order == null ? null : _Actions(order: order),
    );
  }
}

// ────────────────────── بلوك كود الاستلام ──────────────────────

class _PickupBlock extends StatelessWidget {
  const _PickupBlock({required this.code});

  final String code;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: QColors.successTint,
        borderRadius: BorderRadius.circular(QRadius.xl),
        border: Border.all(color: QColors.success, width: 2),
      ),
      child: Column(
        children: [
          Container(
            width: 64,
            height: 64,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: QColors.success, shape: BoxShape.circle),
            child: const Icon(Icons.check, size: 28, color: Colors.white),
          ),
          const SizedBox(height: 12),
          const Text(
            'الطلب جاهز للاستلام',
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 18,
              fontWeight: FontWeight.w900,
              color: _successInk,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'سلّمه للكابتن برقم الاستلام',
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: _successMuted,
            ),
          ),
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 10),
            decoration: BoxDecoration(
              color: QColors.surface,
              borderRadius: BorderRadius.circular(QRadius.md),
            ),
            child: QLtr(
              child: Text(
                code,
                style: QText.num(size: 30, weight: FontWeight.w800).copyWith(letterSpacing: 2),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────── كارت الكابتن ───────────────────────

class _CaptainCard extends StatelessWidget {
  const _CaptainCard({required this.order});

  final MerchantOrder order;

  @override
  Widget build(BuildContext context) {
    final captain = order.captain;

    // لسه مافيش كابتن — شريط أصفر بدل الكارت.
    if (captain == null) {
      return Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        decoration: BoxDecoration(
          color: QColors.tint,
          borderRadius: BorderRadius.circular(QRadius.lg),
          border: Border.all(color: QColors.tintBorder),
        ),
        child: Text(
          '⏳ جاري تعيين كابتن…',
          style: TextStyle(
            fontFamily: 'Cairo',
            fontSize: 14,
            fontWeight: FontWeight.w800,
            color: QColors.goldDeep,
          ),
        ),
      );
    }

    final headline = switch (order.status) {
      OrderStatus.captainAssigned => 'في الطريق للفرع',
      OrderStatus.pickedUp || OrderStatus.onTheWay => 'استلم الطلب',
      _ => 'وصل الفرع',
    };

    final letter = captain.name.trim().isEmpty ? '؟' : captain.name.trim().characters.first;

    return QCard(
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            alignment: Alignment.center,
            decoration: BoxDecoration(color: QColors.inkSurface, shape: BoxShape.circle),
            child: Text(
              letter,
              style: TextStyle(
                fontFamily: 'Cairo',
                fontSize: 20,
                fontWeight: FontWeight.w900,
                color: QColors.brand,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'الكابتن ${captain.name} $headline',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 14.5,
                    fontWeight: FontWeight.w800,
                    color: QColors.ink,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  fmt.ltr('${captain.vehicleType ?? 'دراجة'} · ${fmt.rating(captain.rating)}★'),
                  textDirection: TextDirection.rtl,
                  style: QText.tiny.copyWith(fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          InkWell(
            // الاتصال لسه مش موصّل بالتليفون — بنعرض تأكيد بصري بس.
            onTap: () => showQSnack(context, 'جاري الاتصال…'),
            customBorder: const CircleBorder(),
            child: Container(
              width: 42,
              height: 42,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: QColors.brand, shape: BoxShape.circle),
              child: const Text('📞', style: TextStyle(fontSize: 18)),
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────── تشيك ليست التعبئة ───────────────────────

class _PackingList extends StatelessWidget {
  const _PackingList({required this.order, required this.packed, required this.onToggle});

  final MerchantOrder order;
  final Set<String> packed;
  final ValueChanged<String> onToggle;

  @override
  Widget build(BuildContext context) {
    return QCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'محتويات الطلب',
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: QColors.ink,
            ),
          ),
          const SizedBox(height: 10),
          for (final item in order.items) ...[
            _PackRow(
              item: item,
              checked: packed.contains(item.id),
              onTap: () => onToggle(item.id),
            ),
            const SizedBox(height: 6),
          ],
          if (order.hasNotes) ...[
            const SizedBox(height: 4),
            Text(
              '📝 ${order.customerNotes!.trim()} — تم التنبيه للمطبخ',
              style: TextStyle(
                fontFamily: 'Cairo',
                fontSize: 12.5,
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

class _PackRow extends StatelessWidget {
  const _PackRow({required this.item, required this.checked, required this.onTap});

  final MerchantOrderItem item;
  final bool checked;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          children: [
            QCheckBox(checked: checked, onTap: onTap),
            const SizedBox(width: 11),
            Expanded(
              child: Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: fmt.ltr('${item.quantity}×'),
                      style: QText.num(size: 14, weight: FontWeight.w800, color: QColors.gold),
                    ),
                    TextSpan(
                      text: ' ${item.nameAr}'
                          '${item.hasOptions ? ' — ${item.optionsLabel}' : ''}',
                      style: QText.body.copyWith(fontSize: 14),
                    ),
                  ],
                ),
              ),
            ),
            // «✓ مُعبأ» بتظهر بعد ما الموظف يعلّم بس.
            if (checked) ...[
              const SizedBox(width: 8),
              Text(
                '✓ مُعبأ',
                style: TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: QColors.success,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ─────────────────────── شريط الدفع ───────────────────────

class _PaymentStrip extends StatelessWidget {
  const _PaymentStrip({required this.order});

  final MerchantOrder order;

  @override
  Widget build(BuildContext context) {
    final prepaid = order.isPrepaid;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: prepaid ? QColors.successTint : QColors.tint,
        borderRadius: BorderRadius.circular(QRadius.lg),
        border: Border.all(color: prepaid ? QColors.successTint : QColors.tintBorder),
      ),
      child: prepaid
          ? Text(
              '💵 الطلب مدفوع إلكترونياً — لا تحصّل كاش',
              style: TextStyle(
                fontFamily: 'Cairo',
                fontSize: 13.5,
                fontWeight: FontWeight.w800,
                color: QColors.success,
              ),
            )
          : Row(
              children: [
                Text(
                  '💵 تحصيل كاش: ',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 13.5,
                    fontWeight: FontWeight.w800,
                    color: QColors.goldDeep,
                  ),
                ),
                QPrice(value: order.total, size: 14.5, color: QColors.goldDeep),
              ],
            ),
    );
  }
}

// ─────────────────────── الشريط السفلي ───────────────────────

class _Actions extends StatelessWidget {
  const _Actions({required this.order});

  final MerchantOrder order;

  @override
  Widget build(BuildContext context) {
    return QBottomBar(
      child: Row(
        children: [
          Expanded(
            flex: 10,
            child: QButton(
              label: '🖨 طباعة الفاتورة',
              style: QButtonStyle.outline,
              onPressed: () => showQSnack(context, 'الطباعة محتاجة ربط الطابعة'),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            flex: 16, // نسبة 1 : 1.6 (الزر الأول flex 10)
            child: QButton(
              label: 'تم التسليم للكابتن ✓',
              onPressed: () {
                // مافيش endpoint للتسليم من جهة المطعم: الكابتن هو اللي بيأكّد
                // الاستلام بكود الـ pickupCode من تطبيقه، والسيرفر بيغيّر الحالة
                // ويبعتها لنا على السوكيت. الزر ده تأكيد بصري للموظف بس.
                showQSnack(context, 'سلّمنا الطلب للكابتن');
                context.pop();
              },
            ),
          ),
        ],
      ),
    );
  }
}
