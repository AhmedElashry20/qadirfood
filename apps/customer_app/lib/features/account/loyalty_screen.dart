// نقاط الولاء — الرصيد وقيمته بالريال وكشف الحركات.
// كل الأرقام من GET /customer/loyalty. البرنامج لو مطفي من اللوحة بنقول كده
// صراحةً بدل ما نعرض «٠ نقطة» اللي العميل يفهمها إنه مش بياخد نقاط.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/format.dart';
import '../../core/theme.dart';
import '../../models/loyalty.dart';
import '../../providers/loyalty_provider.dart';
import '../../widgets/common.dart';

class LoyaltyScreen extends ConsumerWidget {
  const LoyaltyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final loyalty = ref.watch(loyaltyProvider);

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: const QHeader(title: 'نقاطي'),
      body: loyalty.when(
        loading: () => Center(child: CircularProgressIndicator(color: QColors.brand)),
        error: (e, _) => QEmpty(message: '$e', emoji: '⚠️'),
        data: (data) => !data.enabled
            ? const QEmpty(
                message: 'برنامج النقاط غير مفعّل حالياً',
                emoji: '⭐',
              )
            : RefreshIndicator(
                color: QColors.brand,
                onRefresh: () async => ref.invalidate(loyaltyProvider),
                child: ListView(
                  padding: const EdgeInsets.all(QSpace.screenH),
                  children: [
                    _BalanceCard(data: data),
                    const SizedBox(height: 14),
                    Text(
                      'سجل النقاط',
                      style: TextStyle(
                        fontFamily: 'Cairo',
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: QColors.ink,
                      ),
                    ),
                    const SizedBox(height: 10),
                    if (data.entries.isEmpty)
                      const QEmpty(
                        message: 'لا توجد حركات بعد — اطلب واكسب نقاطاً',
                        emoji: '⭐',
                      )
                    else
                      for (final entry in data.entries) ...[
                        _EntryTile(entry: entry),
                        const SizedBox(height: 8),
                      ],
                  ],
                ),
              ),
      ),
    );
  }
}

class _BalanceCard extends StatelessWidget {
  const _BalanceCard({required this.data});

  final LoyaltySummary data;

  @override
  Widget build(BuildContext context) {
    return QCard(
      child: Column(
        children: [
          Text(
            'رصيد نقاطك',
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: QColors.label,
            ),
          ),
          const SizedBox(height: 6),
          Text('${data.points}', style: QText.num(size: 34, color: QColors.brand)),
          const SizedBox(height: 4),
          Text(
            'تعادل ${ltr(money(data.valueSar))} ر.س',
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: QColors.ink,
            ),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Divider(color: QColors.line, height: 1),
          ),
          // الشرح بالأرقام الفعلية من السيرفر، مش نص ثابت — الإعدادات بتتغيّر
          // من اللوحة، ونص ثابت هيكدب بعد أول تغيير.
          Text(
            'تكسب ${_rate(data.pointsPerSar)} على كل ريال · '
            'أقل استبدال ${data.minRedeemPoints} نقطة',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: QColors.label,
              height: 1.6,
            ),
          ),
          if (data.canRedeem) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: QColors.tintSoft,
                borderRadius: BorderRadius.circular(QRadius.sm),
              ),
              child: Text(
                'تقدر تستبدل نقاطك كخصم في صفحة إتمام الطلب',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  color: QColors.brand,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  /// «نقطة» / «نقطتين» / «٣ نقاط» — الصيغة العربية الصحيحة للمعدّل.
  static String _rate(double perSar) {
    if (perSar == 1) return 'نقطة';
    if (perSar == 2) return 'نقطتين';
    final asInt = perSar == perSar.roundToDouble() ? perSar.toInt().toString() : money(perSar);
    return '${ltr(asInt)} نقاط';
  }
}

class _EntryTile extends StatelessWidget {
  const _EntryTile({required this.entry});

  final LoyaltyEntry entry;

  @override
  Widget build(BuildContext context) {
    final color = entry.isCredit ? QColors.success : QColors.ink;
    return QCard(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  entry.descriptionAr,
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 13.5,
                    fontWeight: FontWeight.w700,
                    color: QColors.ink,
                  ),
                ),
                if (entry.createdAt != null) ...[
                  const SizedBox(height: 3),
                  Text(
                    _stamp(entry.createdAt!),
                    style: TextStyle(
                      fontFamily: 'Cairo',
                      fontSize: 11.5,
                      fontWeight: FontWeight.w600,
                      color: QColors.label,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 10),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              // الإشارة صريحة: «+٥٠» / «−٢٠٠» أوضح من لون لوحده.
              Text(
                ltr('${entry.isCredit ? '+' : '−'}${entry.points.abs()}'),
                style: QText.num(size: 15, color: color),
              ),
              Text(
                'الرصيد ${ltr('${entry.balanceAfter}')}',
                style: TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: QColors.label,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  static String _stamp(DateTime at) {
    final hour12 = at.hour % 12 == 0 ? 12 : at.hour % 12;
    final minute = at.minute.toString().padLeft(2, '0');
    final period = at.hour < 12 ? 'ص' : 'م';
    return '${ltr('${at.day}/${at.month}')} · ${ltr('$hour12:$minute')} $period';
  }
}
