// ملخص العربة — كارت الفاتورة + شريط السلة العايم في صفحة المطعم.
import 'package:flutter/material.dart';

import '../core/theme.dart';
import 'common.dart';

/// كارت الفاتورة: المجموع الفرعي / التوصيل / الضريبة / الخصم / الإجمالي.
class BillSummary extends StatelessWidget {
  const BillSummary({
    super.key,
    required this.subtotal,
    required this.deliveryFee,
    required this.vat,
    this.discount = 0,
    this.couponCode,
  });

  final double subtotal;
  final double deliveryFee;
  final double vat;
  final double discount;
  final String? couponCode;

  @override
  Widget build(BuildContext context) {
    final total = subtotal + deliveryFee + vat - discount;

    return QCard(
      child: Column(
        children: [
          _Row(label: 'المجموع الفرعي', value: subtotal),
          const SizedBox(height: 10),
          _Row(
            label: 'رسوم التوصيل',
            value: deliveryFee,
            valueOverride: deliveryFee == 0 ? 'مجاني' : null,
          ),
          const SizedBox(height: 10),
          _Row(label: 'ضريبة القيمة المضافة 15%', value: vat),
          if (discount > 0) ...[
            const SizedBox(height: 10),
            _Row(
              label: couponCode == null ? 'خصم الكوبون' : 'خصم $couponCode',
              value: -discount,
              color: QColors.success,
            ),
          ],
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 10),
            child: Divider(color: QColors.line, height: 1),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'الإجمالي',
                style: TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 15.5,
                  fontWeight: FontWeight.w900,
                  color: QColors.ink,
                ),
              ),
              QPrice(value: total, size: 15.5),
            ],
          ),
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.label,
    required this.value,
    this.color,
    this.valueOverride,
  });

  final String label;
  final double value;
  final Color? color;
  final String? valueOverride;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: QText.bodyMuted.copyWith(color: color ?? QColors.label)),
        if (valueOverride != null)
          Text(
            valueOverride!,
            style: QText.body.copyWith(color: color ?? QColors.success, fontSize: 13.5),
          )
        else
          QPrice(
            value: value.abs(),
            size: 13.5,
            color: color ?? QColors.ink,
            showCurrency: false,
          ),
      ],
    );
  }
}

/// شريط السلة العايم أسفل صفحة المطعم: عدد + «عرض السلة» + الإجمالي.
class CartBar extends StatelessWidget {
  const CartBar({
    super.key,
    required this.itemCount,
    required this.total,
    required this.onTap,
    this.dark = false,
  });

  final int itemCount;
  final double total;
  final VoidCallback onTap;

  /// نسخة سودا (زي نسخة A في التصميم).
  final bool dark;

  @override
  Widget build(BuildContext context) {
    final bg = dark ? QColors.ink : QColors.brand;
    final fg = dark ? Colors.white : QColors.ink;
    final counterBg = dark ? QColors.brand : QColors.ink;
    final counterFg = dark ? QColors.ink : QColors.brand;

    return Material(
      color: bg,
      borderRadius: BorderRadius.circular(QRadius.lg),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(QRadius.lg),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(QRadius.lg),
            boxShadow: dark ? null : kFloatShadow,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                width: 26,
                height: 26,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: counterBg, borderRadius: BorderRadius.circular(9)),
                child: Text('$itemCount', style: QText.num(size: 14, color: counterFg)),
              ),
              Text(
                'عرض السلة',
                style: TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 15.5,
                  fontWeight: FontWeight.w900,
                  color: fg,
                ),
              ),
              QPrice(value: total, size: 15.5, color: dark ? QColors.brand : QColors.ink),
            ],
          ),
        ),
      ),
    );
  }
}
