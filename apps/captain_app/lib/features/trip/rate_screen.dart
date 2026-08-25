// شاشة ١٣: تقييم بعد التسليم.
//
// ══════════════════════════════════════════════════════════════════════════
//                    إيه الحقيقي وإيه اللي مالوش مصدر هنا
// ══════════════════════════════════════════════════════════════════════════
//  ✅ **مستحق الرحلة حقيقي** — `order.captainPayout`، والسيرفر بيحسبه ويكتبه في
//     markDelivered()، فهو بيبقى جاهز في GET /orders/:id بعد التسليم على طول.
//  ❌ **تقييم الكابتن للعميل مالوش أي وجود** — مافيش عمود ولا جدول ولا endpoint.
//     (اللي موجود هو تقييم العميل للكابتن `captains.rating` وهو بيتكتب من ناحية
//     العميل بس.) فالنجوم معروضة موقوفة زي التصميم ومابتبعتش حاجة.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../providers/active_trip_provider.dart';
import '../../widgets/common.dart';

/// أخضر غامق لنص «تم تسليم الطلب!» — اللون الوحيد اللي مش في نظام التصميم،
/// جاي من ملف التصميم مباشرة (نص فوق successTint محتاج تباين أعلى من success).
const _kSuccessText = Color(0xFF0B7A45);

class RateScreen extends ConsumerWidget {
  const RateScreen({super.key, required this.orderId});

  final String orderId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tripAsync = ref.watch(tripProvider(orderId));

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: const QHeader(title: 'تقييم العميل', showBack: false),
      body: tripAsync.when(
        loading: () => const QLoading(),
        error: (error, _) => QErrorView(
          message: error is ApiException ? error.message : 'مش قادرين نجيب بيانات الرحلة',
          onRetry: () => ref.invalidate(tripProvider(orderId)),
        ),
        data: (trip) => ListView(
          padding: const EdgeInsets.all(QSpace.screenH),
          children: [
            _SuccessBlock(payout: trip.payout),
            const SizedBox(height: 16),
            const _DisabledStars(),
          ],
        ),
      ),
      bottomNavigationBar: QBottomBar(
        child: SizedBox(
          width: double.infinity,
          child: QButton(
            label: 'رجوع للرئيسية',
            onPressed: () => context.go(QRoutes.home),
          ),
        ),
      ),
    );
  }
}

class _SuccessBlock extends StatelessWidget {
  const _SuccessBlock({required this.payout});

  final double payout;

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
            decoration: const BoxDecoration(color: QColors.success, shape: BoxShape.circle),
            child: const Icon(Icons.check, size: 34, color: Colors.white),
          ),
          const SizedBox(height: 14),
          Text(
            'تم تسليم الطلب!',
            style: QText.section.copyWith(fontSize: 18, color: _kSuccessText),
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text('كسبت', style: QText.body.copyWith(fontSize: 14, color: _kSuccessText)),
              const SizedBox(width: 6),
              QPrice(value: payout, size: 20, color: _kSuccessText),
            ],
          ),
        ],
      ),
    );
  }
}

/// نجوم معروضة موقوفة — مافيش endpoint لتقييم الكابتن للعميل.
class _DisabledStars extends StatelessWidget {
  const _DisabledStars();

  @override
  Widget build(BuildContext context) {
    return QCard(
      child: Column(
        children: [
          Text('كيف كانت تجربتك مع العميل؟', style: QText.body.copyWith(fontSize: 14)),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var i = 0; i < 5; i++)
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 4),
                  child: Icon(Icons.star_rounded, size: 34, color: QColors.border),
                ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            'تقييم العميل مش مدعوم في الـ API',
            textAlign: TextAlign.center,
            style: QText.tiny.copyWith(color: QColors.faint, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}
