// كارت عرض المهمة — محتوى الشيت الأبيض في شاشة «طلب وارد».
//
// اتفصل عن الشاشة عشان الشاشة تبقى مسؤولة عن السوكيت والصوت والتنقّل بس،
// والكارت مسؤول عن الشكل بس (مافيش فيه أي نداء شبكة).
//
// ⚠️ حقول ناقصة من السيرفر — الكارت بيخفيها بدل ما يعرض أصفار:
//   • `itemCount` — DispatchService مابيبعتش عدد الأصناف خالص، فبيوصل صفر.
//     سطر «· {n} صنف» بيختفي تماماً وقتها.
//   • `pickupDistanceKm` (الكابتن → المطعم) — مابتتبعتش أبداً. السيرفر بيبعت
//     مسافة واحدة بس (`distanceKm` = المطعم → العميل) وبتتحط على رجل التسليم.
//   • `paymentMethod` — مابيتبعتش، فمافيش «نقدي/مدى» على الكارت.
import 'package:flutter/material.dart';

import '../core/format.dart' as fmt;
import '../core/theme.dart';
import '../models/trip_offer.dart';
import 'countdown_timer.dart';

class QTripOfferCard extends StatelessWidget {
  const QTripOfferCard({
    super.key,
    required this.offer,
    this.onAccept,
    this.onReject,
    this.onExpired,
    this.accepting = false,
  });

  final TripOffer offer;
  final VoidCallback? onAccept;
  final VoidCallback? onReject;

  /// العدّاد وصل صفر.
  final VoidCallback? onExpired;

  /// بنستنى نتيجة السباق من السيرفر — الأزرار بتتقفل.
  final bool accepting;

  /// «3.2» — رقم عشري واحد يكفي للمسافات.
  static String _km(double value) => value.toStringAsFixed(1);

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // ── الشارة + العدّاد ──
        Row(
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: QColors.tintStrong,
                borderRadius: BorderRadius.circular(QRadius.pill),
              ),
              child: const Text(
                'طلب جديد 🔔',
                style: TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 12.5,
                  fontWeight: FontWeight.w900,
                  color: QColors.goldDeep,
                ),
              ),
            ),
            const Spacer(),
            QCountdownRing(
              totalSeconds: offer.expiresInSeconds,
              startedAt: offer.receivedAt,
              onExpired: onExpired,
            ),
          ],
        ),
        const SizedBox(height: 16),

        // ── العنوان + المستحق ──
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${offer.restaurantName} → ${offer.dropoffLabel}',
                    style: const TextStyle(
                      fontFamily: 'Cairo',
                      fontSize: 19,
                      fontWeight: FontWeight.w900,
                      color: QColors.ink,
                    ),
                  ),
                  const SizedBox(height: 4),
                  _SubLine(offer: offer),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  fmt.money(offer.payout),
                  style: QText.num(size: 22, weight: FontWeight.w800, color: QColors.success),
                ),
                const SizedBox(height: 2),
                const Text(
                  'ر.س أرباحك',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: QColors.textMuted,
                  ),
                ),
              ],
            ),
          ],
        ),
        const SizedBox(height: 16),

        // ── مسار الرحلة ──
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: QColors.canvas,
            borderRadius: BorderRadius.circular(QRadius.lg),
          ),
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const _RouteRail(),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      _RouteLeg(
                        title: offer.restaurantName,
                        // المسافة دي مابتوصلش من السيرفر — فالسطر بيبقى «استلام» بس.
                        label: 'استلام',
                        distanceKm: offer.pickupDistanceKm,
                      ),
                      const SizedBox(height: 14),
                      _RouteLeg(
                        title: offer.dropoffLabel,
                        label: 'تسليم',
                        distanceKm: offer.dropoffDistanceKm,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 18),

        // ── الرفض والقبول ──
        Row(
          children: [
            Expanded(
              flex: 10,
              child: _OfferButton(
                label: 'رفض',
                background: QColors.chip,
                foreground: QColors.textMuted,
                onTap: accepting ? null : onReject,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              flex: 22,
              child: _OfferButton(
                label: 'قبول الطلب ✓',
                background: QColors.brand,
                foreground: QColors.ink,
                glow: true,
                loading: accepting,
                onTap: accepting ? null : onAccept,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// «طلب A-1010 · ٣ صنف» — عدد الأصناف بيختفي لما السيرفر مايبعتوش (وده الحال دايماً).
class _SubLine extends StatelessWidget {
  const _SubLine({required this.offer});

  final TripOffer offer;

  @override
  Widget build(BuildContext context) {
    const style = TextStyle(
      fontFamily: 'Cairo',
      fontSize: 12.5,
      fontWeight: FontWeight.w700,
      color: QColors.textMuted,
    );

    return Text.rich(
      TextSpan(
        style: style,
        children: [
          const TextSpan(text: 'طلب '),
          // الأرقام واللاتيني بيتعزلوا عشان الـ bidi مايقلبش ترتيبهم.
          TextSpan(
            text: fmt.ltr(offer.orderNumber),
            style: QText.num(size: 12.5, weight: FontWeight.w700, color: QColors.textMuted),
          ),
          if (offer.itemCount > 0) ...[
            const TextSpan(text: ' · '),
            TextSpan(
              text: fmt.ltr('${offer.itemCount}'),
              style: QText.num(size: 12.5, weight: FontWeight.w700, color: QColors.textMuted),
            ),
            const TextSpan(text: ' صنف'),
          ],
        ],
      ),
    );
  }
}

/// عمود المسار على الشمال: دايرة صفرا → خط → مربع أسود.
class _RouteRail extends StatelessWidget {
  const _RouteRail();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: 11,
          height: 11,
          decoration: BoxDecoration(
            color: QColors.brand,
            shape: BoxShape.circle,
            border: Border.all(color: QColors.ink, width: 2.5),
          ),
        ),
        // الخط بيتمدد على طول الكارت، وأقل ارتفاع ٢٦ زي التصميم.
        Expanded(
          child: Container(
            width: 2,
            constraints: const BoxConstraints(minHeight: 26),
            color: QColors.border,
          ),
        ),
        Container(
          width: 11,
          height: 11,
          decoration: BoxDecoration(
            color: QColors.ink,
            borderRadius: BorderRadius.circular(3),
          ),
        ),
      ],
    );
  }
}

/// رجل واحدة من المسار — العنوان وتحته «استلام · ٣.٢ km».
class _RouteLeg extends StatelessWidget {
  const _RouteLeg({required this.title, required this.label, this.distanceKm});

  final String title;
  final String label;

  /// null = السيرفر مابعتهاش، فمابنعرضش رقم مخترع.
  final double? distanceKm;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            fontFamily: 'Cairo',
            fontSize: 13.5,
            fontWeight: FontWeight.w800,
            color: QColors.ink,
          ),
        ),
        const SizedBox(height: 2),
        Text.rich(
          TextSpan(
            style: const TextStyle(
              fontFamily: 'Cairo',
              fontSize: 11.5,
              fontWeight: FontWeight.w600,
              color: QColors.textMuted,
            ),
            children: [
              TextSpan(text: label),
              if (distanceKm != null) ...[
                const TextSpan(text: ' · '),
                TextSpan(
                  text: fmt.ltr('${QTripOfferCard._km(distanceKm!)} km'),
                  style: QText.num(size: 11.5, weight: FontWeight.w700, color: QColors.textMuted),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// زرار العرض — QButton مابيدعمش الهالة الصفرا ولا خلفية chip، فده نسخة محلية
/// بنفس الارتفاع الأدنى (QSpace.tapTarget).
class _OfferButton extends StatelessWidget {
  const _OfferButton({
    required this.label,
    required this.background,
    required this.foreground,
    this.onTap,
    this.glow = false,
    this.loading = false,
  });

  final String label;
  final Color background;
  final Color foreground;
  final VoidCallback? onTap;
  final bool glow;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(QRadius.lg),
        boxShadow: glow
            ? const [
                BoxShadow(color: Color(0x66FFD200), blurRadius: 20, offset: Offset(0, 8)),
              ]
            : null,
      ),
      child: Material(
        color: background,
        borderRadius: BorderRadius.circular(QRadius.lg),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(QRadius.lg),
          child: Container(
            constraints: const BoxConstraints(minHeight: QSpace.tapTarget),
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
            child: loading
                ? SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2.4, color: foreground),
                  )
                : Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: QText.button.copyWith(color: foreground),
                  ),
          ),
        ),
      ),
    );
  }
}
