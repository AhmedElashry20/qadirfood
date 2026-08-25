// شاشة ٢٠: نجاح الطلب — بيانات الطلب الحقيقي من GET /orders/:id
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../models/order.dart';
import '../../providers/orders_provider.dart';
import '../../widgets/common.dart';

class OrderSuccessScreen extends ConsumerWidget {
  const OrderSuccessScreen({super.key, required this.orderId});

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final order = ref.watch(orderProvider(orderId));

    return Scaffold(
      backgroundColor: QColors.brand,
      body: SafeArea(
        child: order.when(
          loading: () => const Center(
            child: CircularProgressIndicator(color: QColors.ink),
          ),
          error: (error, _) => _Error(
            message: error is ApiException ? error.message : 'ما قدرناش نجيب تفاصيل الطلب',
            onRetry: () => ref.invalidate(orderProvider(orderId)),
          ),
          data: (order) => _Success(order: order),
        ),
      ),
    );
  }
}

/// الطلب اتبعت فعلاً — التفاصيل من السيرفر (رقم الطلب + كود الاستلام).
class _Success extends StatelessWidget {
  const _Success({required this.order});

  final Order order;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 110,
                    height: 110,
                    decoration: const BoxDecoration(
                      color: QColors.ink,
                      shape: BoxShape.circle,
                      boxShadow: kFloatShadow,
                    ),
                    child: const Icon(Icons.check, size: 52, color: QColors.brand),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'تم استلام طلبك! 🎉',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontFamily: 'Cairo',
                      fontSize: 26,
                      fontWeight: FontWeight.w900,
                      color: QColors.ink,
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text.rich(
                    TextSpan(
                      style: const TextStyle(
                        fontFamily: 'Cairo',
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: QColors.goldOnBrand,
                        height: 1.6,
                      ),
                      children: [
                        const TextSpan(text: 'المطعم بدأ يجهّز طلبك — الوصول المتوقع '),
                        // TextSpan مش widget فما ينفعش QLtr — بنعزل النص نفسه
                        // وإلا «9:15 PM» بتتقلب لـ «PM 9:15» جوّه الجملة العربية.
                        TextSpan(
                          text: ltr(order.etaLabel ?? ''),
                          style: QText.num(size: 15, weight: FontWeight.w700),
                        ),
                      ],
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 16),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                    decoration: BoxDecoration(
                      color: QColors.surface,
                      borderRadius: BorderRadius.circular(QRadius.xl),
                      boxShadow: kFloatShadow,
                    ),
                    child: Column(
                      children: [
                        _InfoRow(
                          label: 'رقم الطلب',
                          value: Text(
                            ltr(order.number),
                            style: QText.num(size: 13.5, weight: FontWeight.w800),
                          ),
                        ),
                        // السيرفر بيصدر كود استلام لكل طلب — العميل بيقوله للكابتن.
                        if (order.pickupCode != null) ...[
                          const SizedBox(height: 10),
                          _InfoRow(
                            label: 'كود الاستلام',
                            value: Text(
                              ltr(order.pickupCode!),
                              style: QText.num(size: 13.5, weight: FontWeight.w800),
                            ),
                          ),
                        ],
                        const SizedBox(height: 10),
                        _InfoRow(
                          label: 'المطعم',
                          value: Text(
                            order.restaurantName,
                            style: const TextStyle(
                              fontFamily: 'Cairo',
                              fontSize: 13.5,
                              fontWeight: FontWeight.w800,
                              color: QColors.ink,
                            ),
                          ),
                        ),
                        const SizedBox(height: 10),
                        _InfoRow(
                          label: 'المبلغ',
                          value: QPrice(value: order.total, size: 13.5),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(28, 0, 28, 40),
          child: Column(
            children: [
              QButton(
                style: QButtonStyle.dark,
                label: 'تتبع الطلب 🛵',
                onPressed: () => context.go(QRoutes.track(order.id)),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () => context.go(QRoutes.home),
                child: const Text(
                  'الرجوع للرئيسية',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: QColors.ink,
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// الطلب اتسجّل بس ماقدرناش نجيب تفاصيله (شبكة) — مابندّعيش نجاح ولا نخفي الخطأ.
class _Error extends StatelessWidget {
  const _Error({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(28, 24, 28, 40),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Text('😕', style: TextStyle(fontSize: 42)),
          const SizedBox(height: 12),
          Text(
            message,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontFamily: 'Cairo',
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: QColors.ink,
              height: 1.6,
            ),
          ),
          const SizedBox(height: 20),
          QButton(style: QButtonStyle.dark, label: 'إعادة المحاولة', onPressed: onRetry),
          const SizedBox(height: 8),
          TextButton(
            onPressed: () => context.go(QRoutes.myOrders),
            child: const Text(
              'الذهاب لطلباتي',
              style: TextStyle(
                fontFamily: 'Cairo',
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: QColors.ink,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// صف في كارت ملخص الطلب: عنوان رمادي + قيمة.
class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final Widget value;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontFamily: 'Cairo',
            fontSize: 13.5,
            fontWeight: FontWeight.w600,
            color: QColors.label,
          ),
        ),
        Flexible(child: value),
      ],
    );
  }
}
