// شاشة ١٨: طريقة الدفع — مدى / Apple Pay / بطاقة / محفظة / كاش
// الـ API بيقبل الخمسة، بس **الكاش هو الوحيد اللي بيتسوّى فعلياً** (مافيش مفاتيح بوابة
// دفع لسه) — فأي طريقة تانية بتتسجّل والطلب بيتحسب «غير مدفوع». بنقول ده للعميل صراحة.
// ومافيش API لبطاقات محفوظة، فالقائمة ثابتة ومافيش «إضافة بطاقة».
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/enums.dart';
import '../../core/theme.dart';
import '../../providers/checkout_provider.dart';
import '../../widgets/common.dart';

class PaymentMethodScreen extends ConsumerWidget {
  const PaymentMethodScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final methods = ref.watch(paymentMethodsProvider);
    final selectedId = ref.watch(selectedPaymentIdProvider);

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: const QHeader(title: 'طرق الدفع'),
      body: ListView.separated(
        padding: const EdgeInsets.all(QSpace.screenH),
        itemCount: methods.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (context, i) {
          final m = methods[i];
          final isSelected = m.id == selectedId;

          return QCard(
            selected: isSelected,
            color: m.type == PaymentType.wallet ? QColors.tint : QColors.surface,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            onTap: () => ref.read(selectedPaymentIdProvider.notifier).select(m.id),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    QPaymentBadge(type: m.type),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            m.title,
                            style: TextStyle(
                              fontFamily: 'Cairo',
                              fontSize: 14.5,
                              fontWeight: FontWeight.w800,
                              color: QColors.ink,
                            ),
                          ),
                          // رصيد المحفظة الحقيقي — مافيش «•••• 4382» (مافيش بطاقات محفوظة).
                          if (m.subtitle != null) ...[
                            const SizedBox(height: 3),
                            Text(
                              m.subtitle!,
                              style: TextStyle(
                                fontFamily: 'Cairo',
                                fontSize: 12.5,
                                fontWeight: FontWeight.w700,
                                color: QColors.goldDeep,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(width: 10),
                    QRadioDot(selected: isSelected),
                  ],
                ),
                // الحقيقة زي ما هي: الكاش بس اللي بيتسوّى دلوقتي.
                if (m.type != PaymentType.cash) ...[
                  const SizedBox(height: 10),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                      color: QColors.tint,
                      borderRadius: BorderRadius.circular(QRadius.sm),
                      border: Border.all(color: QColors.tintBorder, width: 1.5),
                    ),
                    child: Text(
                      'الدفع الإلكتروني غير مفعَّل بعد — سيُسجَّل الطلب كغير مدفوع',
                      style: TextStyle(
                        fontFamily: 'Cairo',
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                        color: QColors.goldDeep,
                        height: 1.5,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          );
        },
      ),
      bottomNavigationBar: QBottomBar(
        child: QButton(
          label: '+ إضافة بطاقة جديدة',
          // مافيش API لحفظ البطاقات — الزر بيوضّح السبب بدل ما يفتح شاشة بتوهم بالحفظ.
          onPressed: () => _showGatewayNote(context),
        ),
      ),
    );
  }

  void _showGatewayNote(BuildContext context) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(
            'حفظ البطاقات محتاج ربط بوابة الدفع',
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 13.5,
              fontWeight: FontWeight.w800,
              color: QColors.brand,
            ),
          ),
          behavior: SnackBarBehavior.floating,
          backgroundColor: QColors.inkSurface,
          duration: const Duration(seconds: 3),
        ),
      );
  }
}

/// شارة طريقة الدفع (mada / VISA /  Pay / 💵 / محفظة) — مستخدمة هنا وفي إتمام الطلب.
class QPaymentBadge extends StatelessWidget {
  const QPaymentBadge({super.key, required this.type});

  final PaymentType type;

  @override
  Widget build(BuildContext context) {
    switch (type) {
      case PaymentType.mada:
        return _BadgeBox(bg: QColors.ink, label: 'mada', fg: Colors.white);
      case PaymentType.applePay:
        return _BadgeBox(bg: QColors.ink, label: ' Pay', fg: Colors.white);
      case PaymentType.card:
        return const _BadgeBox(bg: Color(0xFF2557A7), label: 'VISA', fg: Colors.white);
      case PaymentType.cash:
        return Container(
          width: 44,
          height: 36,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: const Color(0xFFE8F5EE),
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Text('💵', style: TextStyle(fontSize: 16)),
        );
      case PaymentType.wallet:
        return Container(
          width: 44,
          height: 36,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: QColors.brand,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text('Q', style: QText.num(size: 15, weight: FontWeight.w900)),
        );
    }
  }
}

class _BadgeBox extends StatelessWidget {
  const _BadgeBox({required this.bg, required this.label, required this.fg});

  final Color bg;
  final String label;
  final Color fg;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)),
      child: Text(
        label,
        style: QText.num(size: 11, weight: FontWeight.w700, color: fg),
      ),
    );
  }
}
