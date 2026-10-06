// شاشة ٢٢: المفضلة — GET /customer/favorites (والقلب بيعمل POST/DELETE للفرع).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../providers/restaurants_provider.dart';
import '../../widgets/common.dart';
import '../../widgets/restaurant_card.dart';

class FavoritesScreen extends ConsumerWidget {
  const FavoritesScreen({super.key});

  Future<void> _toggle(BuildContext context, WidgetRef ref, String branchId) async {
    try {
      await ref.read(favoritesProvider.notifier).toggle(branchId);
    } on ApiException catch (e) {
      if (!context.mounted) return;
      _snack(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final favorites = ref.watch(favoriteRestaurantsProvider);

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: const QHeader(title: 'المفضلة ♥'),
      body: favorites.when(
        loading: () => Center(child: CircularProgressIndicator(color: QColors.brand)),
        error: (e, _) => _ErrorView(
          message: e is ApiException ? e.message : 'تعذّر تحميل المفضلة',
          onRetry: () => ref.invalidate(favoriteRestaurantsProvider),
        ),
        data: (list) => list.isEmpty
            ? const Padding(
                padding: EdgeInsets.all(QSpace.screenH),
                child: QEmpty(
                  message: 'لا توجد مطاعم في المفضلة — اضغط ♥ على أي مطعم',
                  emoji: '🤍',
                ),
              )
            : ListView(
                padding: const EdgeInsets.all(QSpace.screenH),
                children: [
                  for (final r in list) ...[
                    RestaurantCard(
                      restaurant: r,
                      imageHeight: 130,
                      isFavorite: true,
                      onFavoriteTap: () => _toggle(context, ref, r.id),
                      onTap: () => context.push(QRoutes.restaurant(r.id)),
                    ),
                    const SizedBox(height: 14),
                  ],
                  const QEmpty(
                    message: 'أصناف مفضلة؟ اضغط ♥ على أي طبق ليظهر هنا',
                    emoji: '🤍',
                  ),
                ],
              ),
      ),
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
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(QSpace.screenH),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(message, textAlign: TextAlign.center, style: QText.body),
            const SizedBox(height: QSpace.gapLg),
            QButton(label: 'إعادة المحاولة', onPressed: onRetry),
          ],
        ),
      ),
    );
  }
}

void _snack(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        content: Text(message, style: QText.body.copyWith(color: QColors.brand)),
        behavior: SnackBarBehavior.floating,
        backgroundColor: QColors.inkSurface,
        duration: const Duration(seconds: 3),
      ),
    );
}
