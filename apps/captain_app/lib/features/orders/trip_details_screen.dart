// شاشة ١٥: تفاصيل رحلة.
//
// ══════════════════════════════════════════════════════════════════════════
//                    إيه الحقيقي وإيه اللي مالوش مصدر هنا
// ══════════════════════════════════════════════════════════════════════════
//  ✅ كل بيانات الطلب — GET /orders/:id (الفرع، العميل، العنوان، الأصناف،
//     الإجمالي، `captainPayout`، طريقة الدفع، وقت التسليم).
//  ❌ **تفصيل الفاتورة (مجموع الأصناف / التوصيل / الضريبة)** — التصميم بيطلبه، بس
//     [CaptainTrip] فيه `total` و`captainPayout` بس. mapOrder() بيرجّع الحقول دي
//     للعميل مش في الشكل اللي الموديل بيقراه، والموديل مش بتاعنا نعدّله — فبنعرض
//     الإجمالي والمستحق بس ومابنوزّعش الفاتورة بأرقام مخترعة.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/format.dart' as fmt;
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../models/order.dart';
import '../../providers/active_trip_provider.dart';
import '../../widgets/common.dart';

class TripDetailsScreen extends ConsumerWidget {
  const TripDetailsScreen({super.key, required this.orderId});

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tripAsync = ref.watch(tripProvider(orderId));
    final loaded = tripAsync.valueOrNull;

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: QHeader(
        title: loaded == null ? 'تفاصيل الطلب' : 'طلب ${fmt.ltr(loaded.number)}',
      ),
      body: tripAsync.when(
        loading: () => const QLoading(),
        error: (error, _) => QErrorView(
          message: error is ApiException ? error.message : 'تعذّر تحميل تفاصيل الطلب',
          onRetry: () => ref.invalidate(tripProvider(orderId)),
        ),
        data: (trip) => ListView(
          padding: const EdgeInsets.all(QSpace.screenH),
          children: [
            _RestaurantCard(trip: trip),
            const SizedBox(height: 14),
            _BillCard(trip: trip),
            const SizedBox(height: 14),
            _MetaCard(trip: trip),
            // الخريطة بترجع بس لو الرحلة لسه شغالة — الطلب المسلّم مالوش ملاحة.
            if (trip.isActive) ...[
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: QButton(
                  label: 'إعادة فتح الخريطة',
                  style: QButtonStyle.outline,
                  onPressed: () => context.push(QRoutes.trip(trip.id)),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _RestaurantCard extends StatelessWidget {
  const _RestaurantCard({required this.trip});

  final CaptainTrip trip;

  @override
  Widget build(BuildContext context) {
    return QCard(
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: QColors.tint,
              borderRadius: BorderRadius.circular(QRadius.md),
            ),
            child: const Text('🍽️', style: TextStyle(fontSize: 21)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  trip.restaurantName.isEmpty ? 'المطعم' : trip.restaurantName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: QText.cardTitle.copyWith(fontSize: 15),
                ),
                if (trip.restaurantAddress.trim().isNotEmpty) ...[
                  const SizedBox(height: 3),
                  Text(
                    trip.restaurantAddress,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: QText.tiny.copyWith(fontWeight: FontWeight.w600),
                  ),
                ],
              ],
            ),
          ),
          QBadge(label: trip.stepLabel, color: QColors.chip, textColor: trip.status.color),
        ],
      ),
    );
  }
}

/// الأصناف + الفاتورة. تفصيل الفاتورة مش متاح في الموديل — بنقول كده صراحة.
class _BillCard extends StatelessWidget {
  const _BillCard({required this.trip});

  final CaptainTrip trip;

  @override
  Widget build(BuildContext context) {
    return QCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('الأصناف والفاتورة', style: QText.section.copyWith(fontSize: 14)),
          const SizedBox(height: 10),
          if (trip.items.isEmpty)
            Text('لا توجد أصناف في الطلب', style: QText.tiny.copyWith(color: QColors.faint))
          else
            for (final item in trip.items)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 5),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    QLtr(
                      child: Text(
                        '${item.quantity}×',
                        style: QText.num(size: 13.5, weight: FontWeight.w800, color: QColors.gold),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(item.nameAr, style: QText.body.copyWith(fontSize: 13.5)),
                          if (item.hasOptions)
                            Text(
                              item.optionsLabel,
                              style: QText.tiny.copyWith(fontWeight: FontWeight.w600),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
          Divider(color: QColors.line, height: 20),
          _BillRow(label: 'إجمالي الطلب', value: trip.total),
          const SizedBox(height: 6),
          _BillRow(label: 'مستحقك', value: trip.payout, color: QColors.success, bold: true),
          const SizedBox(height: 8),
          Text(
            'تفصيل الفاتورة (الأصناف / التوصيل / الضريبة) غير متاح في موديل الرحلة — '
            'يأتي الرد بالإجمالي والمستحق فقط',
            style: QText.tiny.copyWith(color: QColors.faint, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

class _BillRow extends StatelessWidget {
  const _BillRow({
    required this.label,
    required this.value,
    this.color,
    this.bold = false,
  });

  final String label;
  final double value;
  final Color? color;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: QText.body.copyWith(
            fontSize: 14,
            color: color,
            fontWeight: bold ? FontWeight.w900 : FontWeight.w700,
          ),
        ),
        QPrice(value: value, size: bold ? 17 : 15, color: color),
      ],
    );
  }
}

/// العميل والعنوان والدفع ووقت التسليم.
class _MetaCard extends StatelessWidget {
  const _MetaCard({required this.trip});

  final CaptainTrip trip;

  static String _dateTime(DateTime value) {
    final date = fmt.ltr(
      '${value.year}/${value.month.toString().padLeft(2, '0')}/'
      '${value.day.toString().padLeft(2, '0')}',
    );
    final time = fmt.ltr(
      '${value.hour.toString().padLeft(2, '0')}:${value.minute.toString().padLeft(2, '0')}',
    );
    return '$date · $time';
  }

  @override
  Widget build(BuildContext context) {
    final delivered = trip.deliveredAt;
    final address = [trip.addressLabel, trip.addressDetails]
        .where((part) => part.trim().isNotEmpty)
        .join(' · ');

    return QCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _MetaRow(label: 'العميل', value: trip.customerName.isEmpty ? '—' : trip.customerName),
          Divider(color: QColors.line, height: 18),
          _MetaRow(label: 'العنوان', value: address.isEmpty ? '—' : address),
          Divider(color: QColors.line, height: 18),
          _MetaRow(
            label: 'الدفع',
            value: trip.isPrepaid
                ? '${trip.paymentLabel} — مدفوع مسبقاً'
                : '${trip.paymentLabel} — تحصيل كاش',
          ),
          Divider(color: QColors.line, height: 18),
          _MetaRow(
            label: 'وقت التسليم',
            value: delivered == null ? '—' : _dateTime(delivered),
          ),
        ],
      ),
    );
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 92,
          child: Text(label, style: QText.tiny.copyWith(fontWeight: FontWeight.w700)),
        ),
        Expanded(
          child: Text(
            value,
            style: QText.body.copyWith(fontSize: 13.5),
            textAlign: TextAlign.end,
          ),
        ),
      ],
    );
  }
}
