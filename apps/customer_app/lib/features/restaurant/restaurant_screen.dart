// شاشة ١٤: صفحة المطعم — المنيو بالتصنيفات، التقييم، وقت التوصيل، حالة المطعم
// الفرع ومنيوه بييجوا من الـ API في نداء واحد (restaurantProvider).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../models/menu_item.dart';
import '../../models/restaurant.dart';
import '../../providers/cart_provider.dart';
import '../../providers/restaurants_provider.dart';
import '../../widgets/cart_summary.dart';
import '../../widgets/common.dart';
import '../../widgets/menu_item_tile.dart';

class RestaurantScreen extends ConsumerStatefulWidget {
  const RestaurantScreen({super.key, required this.restaurantId});

  final String restaurantId;

  @override
  ConsumerState<RestaurantScreen> createState() => _RestaurantScreenState();
}

class _RestaurantScreenState extends ConsumerState<RestaurantScreen> {
  int _tab = 0;

  void _addToCart(Restaurant r, MenuItem item) {
    // الخيارات الإجبارية لازم تتحدد من صفحة الصنف.
    if (item.optionGroups.any((g) => g.isRequired)) {
      context.push(QRoutes.item(r.id, item.id));
      return;
    }

    ref.read(cartProvider.notifier).add(r, item);
    _snack('أضفنا ${item.name} للسلة');
  }

  /// المفضلة بتتحدّث على السيرفر — لو النداء فشل بنرجّع القلب ونعرض رسالة السيرفر.
  Future<void> _toggleFavorite(Restaurant r) async {
    try {
      await ref.read(favoritesProvider.notifier).toggle(r.id);
    } on ApiException catch (e) {
      if (!context.mounted) return;
      _snack(e.message);
    }
  }

  void _snack(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(
            message,
            style: const TextStyle(
              fontFamily: 'Cairo',
              fontSize: 13.5,
              fontWeight: FontWeight.w800,
              color: QColors.brand,
            ),
          ),
          behavior: SnackBarBehavior.floating,
          backgroundColor: QColors.ink,
          duration: const Duration(seconds: 2),
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    return ref.watch(restaurantProvider(widget.restaurantId)).when(
          loading: () => const Scaffold(
            backgroundColor: QColors.surface,
            body: Center(child: CircularProgressIndicator(color: QColors.brand)),
          ),
          error: (error, _) => Scaffold(
            backgroundColor: QColors.surface,
            body: _ErrorView(
              message: error is ApiException ? error.message : 'حصل خطأ',
              onRetry: () => ref.invalidate(restaurantProvider(widget.restaurantId)),
            ),
          ),
          data: _loaded,
        );
  }

  /// الشاشة نفسها بعد ما بيانات الفرع توصل — نفس التصميم بالظبط.
  Widget _loaded(Restaurant r) {
    final cart = ref.watch(cartProvider);
    final isFavorite = ref.watch(isFavoriteProvider(r.id));

    final sections = r.sections;
    final tab = sections.isEmpty ? 0 : _tab.clamp(0, sections.length - 1);
    final items = sections.isEmpty ? const <MenuItem>[] : sections[tab].items;

    final showCartBar = cart.lines.isNotEmpty && cart.restaurantId == r.id;

    return Scaffold(
      backgroundColor: QColors.surface,
      body: ListView(
        padding: EdgeInsets.zero,
        children: [
          _Cover(
            coverUrl: r.coverUrl,
            isFavorite: isFavorite,
            onToggleFavorite: () => _toggleFavorite(r),
          ),
          Container(
            transform: Matrix4.translationValues(0, -24, 0),
            decoration: const BoxDecoration(
              color: QColors.surface,
              borderRadius: BorderRadius.vertical(top: Radius.circular(QRadius.sheet)),
            ),
            padding: const EdgeInsets.fromLTRB(QSpace.screenH, 18, QSpace.screenH, 18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            r.name,
                            style: const TextStyle(
                              fontFamily: 'Cairo',
                              fontSize: 21,
                              fontWeight: FontWeight.w900,
                              color: QColors.ink,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text.rich(
                            TextSpan(
                              children: [
                                TextSpan(text: '${r.cuisine} · الحد الأدنى '),
                                TextSpan(
                                  text: money(r.minOrder),
                                  style: QText.num(
                                    size: 12.5,
                                    weight: FontWeight.w700,
                                    color: QColors.textMuted,
                                  ),
                                ),
                                const TextSpan(text: ' ر.س'),
                              ],
                            ),
                            style: QText.caption,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    QRatingPill(rating: r.rating),
                  ],
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    _StatBox(
                      value: QLtr(child: Text('${r.etaLabel} min', style: QText.num(size: 14))),
                      label: 'وقت التوصيل',
                    ),
                    const SizedBox(width: 10),
                    _StatBox(
                      value: r.isFreeDelivery
                          ? const Text(
                              'مجاني',
                              style: TextStyle(
                                fontFamily: 'Cairo',
                                fontSize: 14,
                                fontWeight: FontWeight.w800,
                                color: QColors.ink,
                              ),
                            )
                          : QLtr(
                              child: Text(
                                '${money(r.deliveryFee)} SAR',
                                style: QText.num(size: 14),
                              ),
                            ),
                      label: 'رسوم التوصيل',
                    ),
                    const SizedBox(width: 10),
                    _StatBox(
                      value: QLtr(child: Text(distance(r.distanceKm), style: QText.num(size: 14))),
                      label: 'المسافة',
                    ),
                  ],
                ),
                if (!r.isOpen) ...[
                  const SizedBox(height: 14),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      color: QColors.tint,
                      borderRadius: BorderRadius.circular(QRadius.md),
                    ),
                    child: Text(
                      'المطعم مغلق حالياً — ${r.opensAtLabel ?? ''}'.trim(),
                      style: const TextStyle(
                        fontFamily: 'Cairo',
                        fontSize: 13.5,
                        fontWeight: FontWeight.w800,
                        color: QColors.goldDeep,
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 18),
                Container(
                  decoration: const BoxDecoration(
                    border: Border(bottom: BorderSide(color: QColors.line, width: 1.5)),
                  ),
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        for (var i = 0; i < sections.length; i++)
                          _Tab(
                            label: sections[i].name,
                            active: i == tab,
                            onTap: () => setState(() => _tab = i),
                          ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                for (final item in items) ...[
                  MenuItemTile(
                    item: item,
                    onTap: () => context.push(QRoutes.item(r.id, item.id)),
                    onAdd: r.isOpen ? () => _addToCart(r, item) : null,
                  ),
                  const SizedBox(height: 12),
                ],
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: showCartBar
          ? QBottomBar(
              color: QColors.surface,
              child: CartBar(
                itemCount: cart.itemCount,
                total: cart.subtotal,
                dark: true,
                onTap: () => context.push(QRoutes.cart),
              ),
            )
          : null,
    );
  }
}

/// فشل تحميل الفرع — رسالة السيرفر + إعادة المحاولة (مع زر رجوع عشان الشاشة ماتبقاش طريق مسدود).
class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Center(
          child: Padding(
            padding: const EdgeInsets.all(QSpace.screenH),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('😕', style: TextStyle(fontSize: 56)),
                const SizedBox(height: 14),
                Text(message, textAlign: TextAlign.center, style: QText.section),
                const SizedBox(height: 20),
                SizedBox(
                  width: 200,
                  child: QButton(label: 'إعادة المحاولة', onPressed: onRetry),
                ),
              ],
            ),
          ),
        ),
        const SafeArea(
          child: Padding(
            padding: EdgeInsets.fromLTRB(QSpace.screenH, 12, QSpace.screenH, 0),
            child: Align(
              alignment: AlignmentDirectional.topStart,
              child: QBackButton(),
            ),
          ),
        ),
      ],
    );
  }
}

/// صورة الغلاف + زر الرجوع وأزرار المشاركة والمفضلة.
class _Cover extends StatelessWidget {
  const _Cover({
    required this.coverUrl,
    required this.isFavorite,
    required this.onToggleFavorite,
  });

  final String coverUrl;
  final bool isFavorite;
  final VoidCallback onToggleFavorite;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 210,
      width: double.infinity,
      child: Stack(
        fit: StackFit.expand,
        children: [
          QImage(url: coverUrl),
          SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(QSpace.screenH, 12, QSpace.screenH, 0),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const QBackButton(light: true),
                  const Spacer(),
                  _CoverButton(icon: Icons.ios_share, onTap: () {}),
                  const SizedBox(width: 8),
                  _CoverButton(
                    icon: isFavorite ? Icons.favorite : Icons.favorite_border,
                    color: isFavorite ? QColors.danger : QColors.ink,
                    onTap: onToggleFavorite,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CoverButton extends StatelessWidget {
  const _CoverButton({required this.icon, required this.onTap, this.color = QColors.ink});

  final IconData icon;
  final VoidCallback onTap;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(QRadius.sm),
      child: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.92),
          borderRadius: BorderRadius.circular(QRadius.sm),
          boxShadow: kCardShadow,
        ),
        child: Icon(icon, size: 19, color: color),
      ),
    );
  }
}

/// مربع إحصائية صغير (وقت التوصيل / الرسوم / المسافة).
class _StatBox extends StatelessWidget {
  const _StatBox({required this.value, required this.label});

  final Widget value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: QColors.tint,
          borderRadius: BorderRadius.circular(QRadius.sm),
        ),
        child: Column(
          children: [
            value,
            const SizedBox(height: 2),
            Text(
              label,
              style: const TextStyle(
                fontFamily: 'Cairo',
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: Color(0xFF8A8368),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// تبويب قسم في المنيو — المفعّل تحته خط أصفر.
class _Tab extends StatelessWidget {
  const _Tab({required this.label, required this.active, required this.onTap});

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsetsDirectional.only(end: 20),
        padding: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(
              color: active ? QColors.brand : Colors.transparent,
              width: 3,
            ),
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontFamily: 'Cairo',
            fontSize: 14,
            fontWeight: active ? FontWeight.w900 : FontWeight.w700,
            color: active ? QColors.ink : const Color(0xFFA9A695),
          ),
        ),
      ),
    );
  }
}
