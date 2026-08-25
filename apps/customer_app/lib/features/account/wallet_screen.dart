// شاشة ٢٧: المحفظة والكوبونات — الكوبونات من GET /customer/coupons، والرصيد من GET /customer/me.
// مافيش API لشحن الرصيد ولا لسجل العمليات لسه — الأزرار دي بتقول «قريباً».
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/format.dart' as fmt;
import '../../core/theme.dart';
import '../../data/api_repository.dart';
import '../../models/order.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/common.dart';

/// GET /customer/coupons — الكوبونات الصالحة للعميل.
final couponsProvider = FutureProvider<List<Coupon>>(
  (ref) => ref.watch(customerRepositoryProvider).coupons(),
);

class WalletScreen extends ConsumerWidget {
  const WalletScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final coupons = ref.watch(couponsProvider);
    final balance = ref.watch(profileProvider.select((p) => p.value?.walletBalance));

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: const QHeader(title: 'الكوبونات والمحفظة'),
      body: ListView(
        padding: const EdgeInsets.all(QSpace.screenH),
        children: [
          _BalanceCard(balance: balance),
          const SizedBox(height: 14),
          Row(
            children: [
              const Text(
                'كوبوناتي',
                style: TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: QColors.ink,
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 2),
                decoration: BoxDecoration(
                  color: QColors.brand,
                  borderRadius: BorderRadius.circular(QRadius.pill),
                ),
                child: Text(
                  '${coupons.value?.length ?? 0}',
                  style: QText.num(size: 12),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          coupons.when(
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: CircularProgressIndicator(color: QColors.brand)),
            ),
            error: (e, _) => _ErrorView(
              message: e is ApiException ? e.message : 'تعذّر تحميل الكوبونات',
              onRetry: () => ref.invalidate(couponsProvider),
            ),
            data: (list) => list.isEmpty
                ? const QEmpty(message: 'مافي كوبونات متاحة دلوقتي', emoji: '🎁')
                : Column(
                    children: [
                      for (var i = 0; i < list.length; i++) ...[
                        _CouponCard(coupon: list[i]),
                        if (i != list.length - 1) const SizedBox(height: 14),
                      ],
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

/// كارت الرصيد الأسود — الرصيد الحقيقي من الملف الشخصي.
class _BalanceCard extends StatelessWidget {
  const _BalanceCard({required this.balance});

  /// null = الملف الشخصي لسه بيحمّل.
  final double? balance;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: QColors.ink,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text(
                'رصيد محفظة قادر',
                style: TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: QColors.darkSub,
                ),
              ),
              const Spacer(),
              Container(
                width: 30,
                height: 30,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: QColors.brand,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text('Q', style: QText.num(size: 15, weight: FontWeight.w900)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text.rich(
            TextSpan(
              text: balance == null ? '—' : fmt.money(balance!),
              style: QText.num(size: 34, color: QColors.brand),
              children: const [
                TextSpan(
                  text: ' ر.س',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: QColors.brand,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: _BalanceAction(
                  label: '+ شحن الرصيد',
                  background: QColors.brand,
                  foreground: QColors.ink,
                  onTap: () => _soon(context),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _BalanceAction(
                  label: 'السجل',
                  background: QColors.inkSoft,
                  foreground: Colors.white,
                  onTap: () => _soon(context),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _BalanceAction extends StatelessWidget {
  const _BalanceAction({
    required this.label,
    required this.background,
    required this.foreground,
    required this.onTap,
  });

  final String label;
  final Color background;
  final Color foreground;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: background,
      borderRadius: BorderRadius.circular(QRadius.sm),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(QRadius.sm),
        child: Container(
          padding: const EdgeInsets.all(10),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: foreground,
            ),
          ),
        ),
      ),
    );
  }
}

/// كارت الكوبون: شريط جانبي ملوّن + العنوان والوصف.
class _CouponCard extends StatelessWidget {
  const _CouponCard({required this.coupon});

  final Coupon coupon;

  @override
  Widget build(BuildContext context) {
    final c = coupon;

    final stripColor = c.isUsed
        ? QColors.border
        : c.percent != null
            ? QColors.brand
            : c.freeDelivery
                ? QColors.ink
                : QColors.chip;

    final card = Container(
      decoration: BoxDecoration(
        color: QColors.surface,
        borderRadius: BorderRadius.circular(QRadius.lg),
        boxShadow: kCardShadow,
      ),
      clipBehavior: Clip.antiAlias,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: c.isUsed ? null : () => _soon(context),
          child: SizedBox(
            height: 86,
            child: Row(
              children: [
                Container(
                  width: 78,
                  height: double.infinity,
                  color: stripColor,
                  alignment: Alignment.center,
                  child: _StripContent(coupon: c),
                ),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          c.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontFamily: 'Cairo',
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                            color: c.isUsed ? QColors.textMuted : QColors.ink,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          c.subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontFamily: 'Cairo',
                            fontSize: 11.5,
                            fontWeight: FontWeight.w600,
                            color: QColors.textMuted,
                          ),
                        ),
                        if (!c.isUsed) ...[
                          const SizedBox(height: 6),
                          const Text(
                            'استخدم الآن ›',
                            style: TextStyle(
                              fontFamily: 'Cairo',
                              fontSize: 12,
                              fontWeight: FontWeight.w800,
                              color: QColors.gold,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );

    return c.isUsed ? Opacity(opacity: 0.55, child: card) : card;
  }
}

class _StripContent extends StatelessWidget {
  const _StripContent({required this.coupon});

  final Coupon coupon;

  @override
  Widget build(BuildContext context) {
    final c = coupon;

    if (c.isUsed) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(c.badge, style: QText.num(size: 19, color: QColors.textMuted)),
          const Text(
            'ر.س',
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 10,
              fontWeight: FontWeight.w800,
              color: QColors.textMuted,
            ),
          ),
        ],
      );
    }

    if (c.percent != null) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('${c.percent}%', style: QText.num(size: 19, color: QColors.ink)),
          const Text(
            'خصم',
            style: TextStyle(
              fontFamily: 'Cairo',
              fontSize: 10,
              fontWeight: FontWeight.w800,
              color: QColors.goldOnBrand,
            ),
          ),
        ],
      );
    }

    // توصيل مجاني — شريط أسود.
    return const Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text('🎁', style: TextStyle(fontSize: 18)),
        SizedBox(height: 2),
        Text(
          'توصيل مجاني',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontFamily: 'Cairo',
            fontSize: 10,
            fontWeight: FontWeight.w800,
            color: QColors.brand,
          ),
        ),
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
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Column(
        children: [
          Text(message, textAlign: TextAlign.center, style: QText.body),
          const SizedBox(height: QSpace.gapLg),
          QButton(label: 'إعادة المحاولة', onPressed: onRetry),
        ],
      ),
    );
  }
}

void _soon(BuildContext context) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text('قريباً', style: QText.body.copyWith(color: QColors.brand)),
        behavior: SnackBarBehavior.floating,
        backgroundColor: QColors.ink,
        duration: const Duration(seconds: 2),
      ),
    );
}
