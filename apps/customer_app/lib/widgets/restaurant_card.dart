// كارت المطعم — كارت كبير (الرئيسية/القائمة) وصف صغير (نتايج البحث).
import 'package:flutter/material.dart';

import '../core/format.dart' as fmt;
import '../core/theme.dart';
import '../models/restaurant.dart';
import 'common.dart';

/// الكارت الكبير: صورة 130-140 + شارة + اسم + وصف + تقييم.
class RestaurantCard extends StatelessWidget {
  const RestaurantCard({
    super.key,
    required this.restaurant,
    this.onTap,
    this.imageHeight = 130,
    this.subtitle,
    this.isFavorite,
    this.onFavoriteTap,
  });

  final Restaurant restaurant;
  final VoidCallback? onTap;
  final double imageHeight;

  /// سطر بديل تحت الاسم (لو null بنبني السطر الافتراضي).
  final String? subtitle;
  final bool? isFavorite;
  final VoidCallback? onFavoriteTap;

  @override
  Widget build(BuildContext context) {
    final r = restaurant;
    final closed = !r.isOpen;

    return Opacity(
      opacity: closed ? 0.55 : 1,
      child: Material(
        color: QColors.surface,
        borderRadius: BorderRadius.circular(QRadius.xl),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox(
                height: imageHeight,
                width: double.infinity,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    ColorFiltered(
                      colorFilter: closed
                          ? const ColorFilter.matrix(<double>[
                              0.33, 0.59, 0.11, 0, 0, //
                              0.33, 0.59, 0.11, 0, 0, //
                              0.33, 0.59, 0.11, 0, 0, //
                              0, 0, 0, 1, 0,
                            ])
                          : const ColorFilter.mode(Colors.transparent, BlendMode.dst),
                      child: QImage(url: r.coverUrl),
                    ),
                    if (closed)
                      Container(
                        color: Colors.black.withValues(alpha: 0.35),
                        alignment: Alignment.center,
                        child: Text(
                          'مغلق — ${r.opensAtLabel ?? ''}',
                          style: const TextStyle(
                            fontFamily: 'Cairo',
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    if (!closed && r.badge != null)
                      Positioned(
                        top: 10,
                        right: 10,
                        child: QBadge(label: r.badge!),
                      ),
                    if (!closed && r.discountPercent != null && r.badge == null)
                      Positioned(
                        top: 10,
                        right: 10,
                        child: QBadge(
                          label: '-${r.discountPercent}%',
                          color: QColors.danger,
                          textColor: Colors.white,
                        ),
                      ),
                    if (isFavorite != null)
                      Positioned(
                        top: 10,
                        left: 10,
                        child: InkWell(
                          onTap: onFavoriteTap,
                          customBorder: const CircleBorder(),
                          child: Container(
                            width: 34,
                            height: 34,
                            decoration:
                                BoxDecoration(color: QColors.surface, shape: BoxShape.circle),
                            child: Icon(
                              isFavorite! ? Icons.favorite : Icons.favorite_border,
                              size: 17,
                              color: QColors.danger,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(r.name, style: QText.cardTitle),
                          const SizedBox(height: 2),
                          Text(subtitle ?? _defaultSubtitle(r), style: QText.caption),
                        ],
                      ),
                    ),
                    QRatingPill(rating: r.rating),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static String _defaultSubtitle(Restaurant r) {
    if (!r.isOpen) return fmt.distance(r.distanceKm);
    final fee = r.isFreeDelivery ? 'توصيل مجاني' : 'توصيل ${fmt.money(r.deliveryFee)} ر.س';
    return '${r.cuisine} · ${r.etaLabel} دقيقة · $fee';
  }
}

/// كارت صغير في شبكة 2×2 (نسخة B من الرئيسية ومنيو الشبكة).
class RestaurantGridCard extends StatelessWidget {
  const RestaurantGridCard({super.key, required this.restaurant, this.onTap});

  final Restaurant restaurant;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final r = restaurant;
    return Material(
      color: QColors.surface,
      borderRadius: BorderRadius.circular(QRadius.xl),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              height: 96,
              width: double.infinity,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  QImage(url: r.coverUrl),
                  if (r.discountPercent != null)
                    Positioned(
                      top: 8,
                      right: 8,
                      child: QBadge(
                        label: '-${r.discountPercent}%',
                        color: QColors.danger,
                        textColor: Colors.white,
                      ),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    r.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: QText.cardTitle.copyWith(fontSize: 14),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${fmt.rating(r.rating)}★ · ${r.etaMinMinutes} دقيقة',
                    style: QText.tiny.copyWith(fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// صف أفقي في نتايج البحث: صورة 84 + اسم + سطر معلومات.
class RestaurantRow extends StatelessWidget {
  const RestaurantRow({super.key, required this.restaurant, this.onTap});

  final Restaurant restaurant;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final r = restaurant;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(QRadius.lg),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: const Color(0xFFFAF9F5),
          borderRadius: BorderRadius.circular(QRadius.lg),
        ),
        child: Row(
          children: [
            QImage(url: r.coverUrl, width: 84, height: 84, radius: QRadius.sm),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(r.name, style: QText.cardTitle.copyWith(fontSize: 15)),
                  const SizedBox(height: 3),
                  Text(r.cuisine, style: QText.tiny.copyWith(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 3),
                  Text.rich(
                    TextSpan(
                      style: QText.num(size: 12, weight: FontWeight.w700),
                      children: [
                        TextSpan(text: '${fmt.rating(r.rating)}★ · ${r.etaMinMinutes} min'),
                        if (r.isFreeDelivery)
                          TextSpan(
                            text: ' · مجاني',
                            style: QText.num(size: 12, color: QColors.success)
                                .copyWith(fontFamily: 'Cairo', fontWeight: FontWeight.w700),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
