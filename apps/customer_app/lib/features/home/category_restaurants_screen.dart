// شاشة ١٣: مطاعم تصنيف معيّن — بحث نصي على الـ API (مافيش endpoint للتصنيفات).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../providers/restaurants_provider.dart';
import '../../widgets/common.dart';
import '../../widgets/restaurant_card.dart';

/// قائمة مطاعم التصنيف (برجر، بيتزا…) مع شرائح الترتيب.
class CategoryRestaurantsScreen extends ConsumerWidget {
  const CategoryRestaurantsScreen({super.key, required this.categoryId});

  final String categoryId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // التصنيفات قائمة ثابتة في الـ provider (الـ API مافيهوش endpoint ليها).
    final categories = ref.watch(categoriesProvider);
    final matches = categories.where((c) => c.id == categoryId);
    final categoryName = matches.isEmpty ? categoryId : matches.first.name;

    final filters = ref.watch(filtersProvider);
    final notifier = ref.read(filtersProvider.notifier);
    final restaurants = ref.watch(categoryRestaurantsProvider(categoryId));

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: QHeader(
        title: 'مطاعم $categoryName',
        bottom: SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          clipBehavior: Clip.none,
          child: Row(
            children: [
              QChip(
                label: 'الترتيب: ${filters.sortBy.ar} ⌄',
                selected: true,
                onTap: () => context.push(QRoutes.filters),
              ),
              const SizedBox(width: 8),
              QChip(
                label: 'عروض',
                onTap: () => notifier.setSort(SortBy.offers),
              ),
              const SizedBox(width: 8),
              QChip(
                label: 'الأعلى تقييماً',
                onTap: () => notifier.setSort(SortBy.topRated),
              ),
            ],
          ),
        ),
      ),
      body: restaurants.when(
        loading: () => const Center(child: CircularProgressIndicator(color: QColors.brand)),
        error: (error, _) => _ErrorView(
          error: error,
          onRetry: () => ref.invalidate(categoryRestaurantsProvider(categoryId)),
        ),
        data: (list) => list.isEmpty
            ? const Padding(
                padding: EdgeInsets.fromLTRB(QSpace.screenH, 16, QSpace.screenH, QSpace.screenH),
                child: QEmpty(message: 'مافي مطاعم في التصنيف ده حالياً', emoji: '🍽️'),
              )
            : ListView.separated(
                padding: const EdgeInsets.fromLTRB(
                  QSpace.screenH,
                  16,
                  QSpace.screenH,
                  QSpace.screenH,
                ),
                itemCount: list.length,
                separatorBuilder: (_, __) => const SizedBox(height: 14),
                itemBuilder: (context, i) {
                  final r = list[i];
                  return RestaurantCard(
                    restaurant: r,
                    imageHeight: 140,
                    onTap: () => context.push(QRoutes.restaurant(r.id)),
                  );
                },
              ),
      ),
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
        mainAxisAlignment: MainAxisAlignment.center,
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
