// شاشة ١٠: الرئيسية — بانرات، تصنيفات، مطاعم قريبة (من الـ API)
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../models/order.dart';
import '../../models/restaurant.dart';
import '../../providers/auth_provider.dart';
import '../../providers/location_provider.dart';
import '../../providers/orders_provider.dart';
import '../../providers/restaurants_provider.dart';
import '../../widgets/common.dart';
import '../../widgets/restaurant_card.dart';

/// الرئيسية — نسخة A (هيدر أصفر). جوّه الشل السفلي: من غير زر رجوع.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // العنوان ممكن يكون null (العناوين لسه بتحمّل أو المستخدم مالوش عناوين).
    final address = ref.watch(selectedAddressProvider);
    final profile = ref.watch(profileProvider).value;
    final activeOrder = ref.watch(activeOrderProvider);
    final categories = ref.watch(categoriesProvider);
    final restaurants = ref.watch(restaurantsProvider);

    final name = profile?.fullName.trim() ?? '';
    final initial = name.isEmpty ? 'ق' : name.substring(0, 1).toUpperCase();

    return Scaffold(
      backgroundColor: QColors.canvas,
      body: Column(
        children: [
          _YellowHeader(
            addressTitle: address?.title ?? 'اختر عنوان التوصيل',
            initial: initial,
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(vertical: 18),
              children: [
                if (activeOrder != null) ...[
                  _ActiveOrderCard(order: activeOrder),
                  const SizedBox(height: 18),
                ],
                const _PromoBanner(),
                const SizedBox(height: 18),
                _CategoriesStrip(categories: categories),
                const SizedBox(height: 18),
                const _SectionHeader(title: 'الأقرب لك'),
                const SizedBox(height: 18),
                restaurants.when(
                  data: (list) => _NearbyList(restaurants: list),
                  loading: () => const _Loading(),
                  error: (error, _) => _ErrorView(
                    error: error,
                    onRetry: () => ref.invalidate(restaurantsProvider),
                  ),
                ),
                const SizedBox(height: 18),
                const _PlusBanner(),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// رسالة سودا بنص أصفر.
void _snack(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        backgroundColor: QColors.ink,
        behavior: SnackBarBehavior.floating,
        content: Text(
          message,
          style: const TextStyle(
            fontFamily: 'Cairo',
            fontSize: 13.5,
            fontWeight: FontWeight.w700,
            color: QColors.brand,
          ),
        ),
      ),
    );
}

/// تحميل قائمة المطاعم.
class _Loading extends StatelessWidget {
  const _Loading();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 48),
      child: Center(child: CircularProgressIndicator(color: QColors.brand)),
    );
  }
}

/// خطأ من السيرفر + زر إعادة المحاولة.
class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.error, required this.onRetry});

  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final err = error;
    final message = err is ApiException ? err.message : 'حصل خطأ';

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: QSpace.screenH, vertical: 24),
      child: Column(
        children: [
          const Text('😕', style: TextStyle(fontSize: 34)),
          const SizedBox(height: 10),
          Text(message, textAlign: TextAlign.center, style: QText.bodyMuted),
          const SizedBox(height: 16),
          SizedBox(
            width: 200,
            child: QButton(label: 'إعادة المحاولة', onPressed: onRetry),
          ),
        ],
      ),
    );
  }
}

/// الهيدر الأصفر: عنوان التوصيل + الأڤاتار + شريط البحث.
class _YellowHeader extends StatelessWidget {
  const _YellowHeader({required this.addressTitle, required this.initial});

  final String addressTitle;
  final String initial;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: QColors.brand,
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(QSpace.screenH, 12, QSpace.screenH, 18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: InkWell(
                      onTap: () => context.push(QRoutes.addresses),
                      borderRadius: BorderRadius.circular(QRadius.sm),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Text(
                            'التوصيل إلى ⌄',
                            style: TextStyle(
                              fontFamily: 'Cairo',
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF7A6800),
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            addressTitle,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontFamily: 'Cairo',
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: QColors.ink,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  InkWell(
                    onTap: () => context.go(QRoutes.account),
                    customBorder: const CircleBorder(),
                    child: Container(
                      width: 42,
                      height: 42,
                      alignment: Alignment.center,
                      decoration: const BoxDecoration(color: QColors.ink, shape: BoxShape.circle),
                      child: Text(
                        initial,
                        style: QText.num(size: 17, weight: FontWeight.w800, color: QColors.brand),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              InkWell(
                onTap: () => context.go(QRoutes.search),
                borderRadius: BorderRadius.circular(QRadius.md),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
                  decoration: BoxDecoration(
                    color: QColors.surface,
                    borderRadius: BorderRadius.circular(QRadius.md),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.search, size: 20, color: QColors.hint),
                      SizedBox(width: 10),
                      Text(
                        'ابحث عن مطعم أو طبق…',
                        style: TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 14.5,
                          fontWeight: FontWeight.w600,
                          color: QColors.hint,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// كارت «طلبك في الطريق» الأسود.
class _ActiveOrderCard extends StatelessWidget {
  const _ActiveOrderCard({required this.order});

  final Order order;

  @override
  Widget build(BuildContext context) {
    final eta = order.etaLabel;
    final subtitle = eta == null ? order.restaurantName : '${order.restaurantName} · يوصل $eta';

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: QSpace.screenH),
      child: Material(
        color: QColors.ink,
        borderRadius: BorderRadius.circular(QRadius.xl),
        child: InkWell(
          onTap: () => context.push(QRoutes.track(order.id)),
          borderRadius: BorderRadius.circular(QRadius.xl),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(
              children: [
                const Text('🛵', style: TextStyle(fontSize: 22)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'طلبك في الطريق',
                        style: TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontFamily: 'Cairo',
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: QColors.darkSub,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                  decoration: BoxDecoration(
                    color: QColors.brand,
                    borderRadius: BorderRadius.circular(QRadius.pill),
                  ),
                  child: const Text(
                    'تتبع',
                    style: TextStyle(
                      fontFamily: 'Cairo',
                      fontSize: 12.5,
                      fontWeight: FontWeight.w800,
                      color: QColors.ink,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// بانر العروض.
class _PromoBanner extends StatelessWidget {
  const _PromoBanner();

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: QSpace.screenH),
      height: 120,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(QRadius.xl)),
      child: const Stack(
        fit: StackFit.expand,
        children: [
          QImage(
            url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=70',
          ),
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.bottomCenter,
                end: Alignment.topCenter,
                colors: [Colors.black54, Colors.transparent],
              ),
            ),
          ),
          Align(
            alignment: AlignmentDirectional.bottomStart,
            child: Padding(
              padding: EdgeInsets.all(12),
              child: Text(
                'خصم 50% على البرجر 🔥',
                style: TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  color: QColors.brand,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// شريط التصنيفات الأفقي.
class _CategoriesStrip extends StatelessWidget {
  const _CategoriesStrip({required this.categories});

  final List<FoodCategory> categories;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 92,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: QSpace.screenH),
        itemCount: categories.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final c = categories[i];
          return InkWell(
            onTap: () => context.push(QRoutes.category(c.id)),
            borderRadius: BorderRadius.circular(20),
            child: SizedBox(
              width: 64,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  QImage(url: c.imageUrl, width: 64, height: 64, radius: 20),
                  const SizedBox(height: 6),
                  Text(
                    c.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontFamily: 'Cairo',
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: QColors.ink,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

/// «الأقرب لك» + «عرض الكل».
class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: QSpace.screenH),
      child: Row(
        children: [
          Expanded(child: Text(title, style: QText.section)),
          InkWell(
            onTap: () => context.go(QRoutes.search),
            borderRadius: BorderRadius.circular(QRadius.sm),
            child: const Padding(
              padding: EdgeInsets.symmetric(horizontal: 4, vertical: 2),
              child: Text(
                'عرض الكل',
                style: TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: QColors.gold,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// «الأقرب لك» — كروت المطاعم.
class _NearbyList extends StatelessWidget {
  const _NearbyList({required this.restaurants});

  final List<Restaurant> restaurants;

  @override
  Widget build(BuildContext context) {
    if (restaurants.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(horizontal: QSpace.screenH),
        child: QEmpty(message: 'مافي مطاعم مطابقة للفلاتر', emoji: '🍽️'),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: QSpace.screenH),
      child: Column(
        children: [
          for (var i = 0; i < restaurants.length; i++) ...[
            RestaurantCard(
              restaurant: restaurants[i],
              imageHeight: 130,
              onTap: () => context.push(QRoutes.restaurant(restaurants[i].id)),
            ),
            if (i != restaurants.length - 1) const SizedBox(height: 14),
          ],
        ],
      ),
    );
  }
}

/// بانر «جرّب Qadir Plus».
class _PlusBanner extends StatelessWidget {
  const _PlusBanner();

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(QSpace.screenH, 4, QSpace.screenH, 0),
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
      decoration: BoxDecoration(
        color: QColors.brand,
        borderRadius: BorderRadius.circular(QRadius.xl),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'جرّب Qadir Plus',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 15,
                    fontWeight: FontWeight.w900,
                    color: QColors.ink,
                  ),
                ),
                const SizedBox(height: 3),
                Text.rich(
                  TextSpan(
                    style: const TextStyle(
                      fontFamily: 'Cairo',
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: QColors.goldOnBrand,
                    ),
                    children: [
                      const TextSpan(text: 'توصيل مجاني غير محدود بـ '),
                      TextSpan(
                        text: '19',
                        style: QText.num(
                          size: 12,
                          weight: FontWeight.w800,
                          color: QColors.goldOnBrand,
                        ),
                      ),
                      const TextSpan(text: ' ر.س/شهر'),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Material(
            color: QColors.ink,
            borderRadius: BorderRadius.circular(QRadius.sm),
            child: InkWell(
              // الاشتراك مش موجود في الـ API لسه.
              onTap: () => _snack(context, 'قريباً'),
              borderRadius: BorderRadius.circular(QRadius.sm),
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: Text(
                  'اشترك',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: QColors.brand,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
