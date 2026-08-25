// صف الصنف في المنيو — نص على اليمين وصورة 92 على الشمال مع زر «+».
import 'package:flutter/material.dart';

import '../core/theme.dart';
import '../models/menu_item.dart';
import 'common.dart';

class MenuItemTile extends StatelessWidget {
  const MenuItemTile({super.key, required this.item, this.onTap, this.onAdd});

  final MenuItem item;
  final VoidCallback? onTap;
  final VoidCallback? onAdd;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(QRadius.md),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.name, style: QText.cardTitle.copyWith(fontSize: 15)),
                  const SizedBox(height: 2),
                  Text(
                    item.description,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: QText.tiny.copyWith(fontWeight: FontWeight.w600, fontSize: 12),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    children: [
                      QPrice(
                        value: item.price,
                        color: item.hasDiscount ? QColors.danger : QColors.ink,
                      ),
                      if (item.hasDiscount) ...[
                        const SizedBox(width: 8),
                        QPrice(
                          value: item.oldPrice!,
                          size: 12.5,
                          color: QColors.hint,
                          showCurrency: false,
                          strikethrough: true,
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            SizedBox(
              width: 92,
              height: 92,
              child: Stack(
                children: [
                  QImage(url: item.imageUrl, width: 92, height: 92, radius: QRadius.md),
                  // المطعم مقفول (onAdd == null) → الزر يختفي بدل ما يفضل مفعّل شكلاً
                  // والضغطة تعدّي للكارت اللي وراه.
                  if (onAdd != null)
                    Positioned(
                      bottom: 6,
                      left: 6,
                      child: QAddButton(onTap: onAdd, size: 26),
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

/// كارت الصنف في شبكة (منيو الشبكة).
class MenuItemGridCard extends StatelessWidget {
  const MenuItemGridCard({super.key, required this.item, this.onTap, this.onAdd});

  final MenuItem item;
  final VoidCallback? onTap;
  final VoidCallback? onAdd;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: QColors.surface,
      borderRadius: BorderRadius.circular(QRadius.lg),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              height: 110,
              width: double.infinity,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  QImage(url: item.imageUrl),
                  if (item.discountPercent != null)
                    Positioned(
                      top: 8,
                      right: 8,
                      child: QBadge(
                        label: '-${item.discountPercent}%',
                        color: QColors.danger,
                        textColor: Colors.white,
                      ),
                    ),
                  Positioned(bottom: 8, left: 8, child: QAddButton(onTap: onAdd)),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: QText.cardTitle.copyWith(fontSize: 13.5),
                  ),
                  const SizedBox(height: 3),
                  QPrice(
                    value: item.price,
                    size: 14,
                    color: item.hasDiscount ? QColors.danger : QColors.ink,
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
