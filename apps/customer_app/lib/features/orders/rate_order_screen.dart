// شاشة ٢٥: تقييم الطلب والكابتن — POST /orders/:id/review
// السيرفر بيرفض تقييم طلب لسه ما اتسلّمش، وبيرفض التقييم مرتين — الرسالة بتظهر زي ما هي.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../../models/order.dart';
import '../../providers/orders_provider.dart';
import '../../widgets/common.dart';

const _sectionTitle = TextStyle(
  fontFamily: 'Cairo',
  fontSize: 14,
  fontWeight: FontWeight.w800,
  color: QColors.ink,
);

const _foodTags = ['الطعم', 'التغليف', 'الكمية', 'درجة الحرارة', 'السرعة'];
const _captainTags = ['وصل بسرعة', 'تعامل راقي', 'المحافظة على الأكل'];
const _tips = [2, 5, 10];

class RateOrderScreen extends ConsumerStatefulWidget {
  const RateOrderScreen({super.key, required this.orderId});

  final String orderId;

  @override
  ConsumerState<RateOrderScreen> createState() => _RateOrderScreenState();
}

class _RateOrderScreenState extends ConsumerState<RateOrderScreen> {
  final _comment = TextEditingController();

  int _rating = 4;
  int _captainRating = 5;
  final _likedTags = <String>{};
  final _likedCaptainTags = <String>{};
  bool _sending = false;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  /// النص تحت النجوم — بيتغيّر مع التقييم.
  String get _ratingLabel => switch (_rating) {
        5 => 'ممتاز! 🎉',
        4 => 'جيد جداً!',
        3 => 'كويس',
        _ => 'نحسّن إيه؟',
      };

  /// الـ API بياخد تعليق واحد — الوسوم المختارة بتتضاف له (مافيش endpoint للوسوم).
  String? get _fullComment {
    final parts = [
      ..._likedTags,
      ..._likedCaptainTags,
      if (_comment.text.trim().isNotEmpty) _comment.text.trim(),
    ];
    return parts.isEmpty ? null : parts.join(' · ');
  }

  Future<void> _submit({required bool hasCaptain}) async {
    if (_sending) return;
    setState(() => _sending = true);

    // بنمسك الـ messenger قبل الـ pop — بعد الخروج من الشاشة الـ context بيبقى ميت.
    final messenger = ScaffoldMessenger.of(context);

    try {
      await ref.read(ordersProvider.notifier).rate(
            widget.orderId,
            _rating,
            captainStars: hasCaptain ? _captainRating : null,
            comment: _fullComment,
          );

      if (!mounted) return;
      context.pop();
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(_snackBar('شكراً لتقييمك! 🎉'));
    } on ApiException catch (e) {
      // السيرفر بيرفض تقييم طلب مش متسلّم أو تقييم مكرر — نعرض رسالته.
      if (!mounted) return;
      setState(() => _sending = false);
      _snack(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final order = ref.watch(orderProvider(widget.orderId));

    return Scaffold(
      backgroundColor: QColors.surface,
      body: SafeArea(
        child: order.when(
          loading: () => const Center(child: CircularProgressIndicator(color: QColors.brand)),
          error: (e, _) => _ErrorView(
            message: e is ApiException ? e.message : 'تعذّر تحميل الطلب',
            onRetry: () => ref.invalidate(orderProvider(widget.orderId)),
          ),
          data: _form,
        ),
      ),
    );
  }

  Widget _form(Order order) {
    final captain = order.captain;

    return ListView(
      padding: const EdgeInsets.all(QSpace.screenH),
      children: [
        // ── تخطي ──
        Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            InkWell(
              onTap: () => context.pop(),
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                child: Text(
                  'تخطي',
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: QColors.faint,
                  ),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),

        // ── نجوم تقييم المطعم ──
        Column(
          children: [
            QImage(url: order.restaurantImageUrl, width: 84, height: 84, radius: 22),
            const SizedBox(height: 10),
            Text(
              'كيف كان طلبك من ${order.restaurantName}؟',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontFamily: 'Cairo',
                fontSize: 20,
                fontWeight: FontWeight.w900,
                color: QColors.ink,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 0; i < 5; i++)
                  InkWell(
                    onTap: () => setState(() => _rating = i + 1),
                    customBorder: const CircleBorder(),
                    child: Padding(
                      padding: const EdgeInsets.all(2),
                      child: Icon(
                        Icons.star_rounded,
                        size: 36,
                        color: i < _rating ? QColors.brand : QColors.border,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              _ratingLabel,
              style: const TextStyle(
                fontFamily: 'Cairo',
                fontSize: 14,
                fontWeight: FontWeight.w800,
                color: QColors.gold,
              ),
            ),
          ],
        ),
        const SizedBox(height: 20),

        // ── إيش عجبك؟ ──
        const Text('إيش عجبك؟', style: _sectionTitle),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final tag in _foodTags)
              QChip(
                label: tag,
                selected: _likedTags.contains(tag),
                onTap: () => setState(() {
                  if (!_likedTags.remove(tag)) _likedTags.add(tag);
                }),
              ),
          ],
        ),
        const SizedBox(height: 20),

        // ── تقييم الكابتن ──
        if (captain != null) ...[
          Row(
            children: [
              Expanded(
                child: Text(
                  'قيّم الكابتن ${captain.name}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: _sectionTitle,
                ),
              ),
              const SizedBox(width: 8),
              for (var i = 0; i < 5; i++)
                InkWell(
                  onTap: () => setState(() => _captainRating = i + 1),
                  customBorder: const CircleBorder(),
                  child: Icon(
                    Icons.star_rounded,
                    size: 20,
                    color: i < _captainRating ? QColors.brand : QColors.border,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final tag in _captainTags)
                QChip(
                  label: tag,
                  selected: _likedCaptainTags.contains(tag),
                  onTap: () => setState(() {
                    if (!_likedCaptainTags.remove(tag)) _likedCaptainTags.add(tag);
                  }),
                ),
            ],
          ),
          const SizedBox(height: 20),
        ],

        // ── تعليق ──
        QField(
          hint: 'اكتب تعليقك هنا (اختياري)…',
          controller: _comment,
          maxLines: 3,
        ),
        const SizedBox(height: 20),

        // ── إكرامية — مافيش API للإكرامية لسه، الأزرار بتقول «قريباً» ──
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
          decoration: BoxDecoration(
            color: QColors.tint,
            borderRadius: BorderRadius.circular(13),
          ),
          child: Row(
            children: [
              const Expanded(
                child: Text(
                  '🎁 أضف إكرامية للكابتن',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: QColors.goldDeep,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              for (final amount in _tips) ...[
                _TipPill(
                  amount: amount,
                  selected: false,
                  onTap: () => _snack(context, 'قريباً'),
                ),
                if (amount != _tips.last) const SizedBox(width: 6),
              ],
            ],
          ),
        ),
        const SizedBox(height: 20),

        QButton(
          label: _sending ? 'جاري الإرسال…' : 'إرسال التقييم',
          enabled: !_sending,
          onPressed: () => _submit(hasCaptain: captain != null),
        ),
      ],
    );
  }
}

class _TipPill extends StatelessWidget {
  const _TipPill({required this.amount, required this.selected, required this.onTap});

  final int amount;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(QRadius.pill),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? QColors.ink : QColors.surface,
          borderRadius: BorderRadius.circular(QRadius.pill),
          border: selected ? null : Border.all(color: QColors.tintBorder, width: 1.5),
        ),
        child: Text(
          '$amount',
          style: QText.num(
            size: 13,
            weight: FontWeight.w800,
            color: selected ? QColors.brand : QColors.ink,
          ),
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

SnackBar _snackBar(String message) => SnackBar(
      content: Text(message, style: QText.body.copyWith(color: QColors.brand)),
      behavior: SnackBarBehavior.floating,
      backgroundColor: QColors.ink,
      duration: const Duration(seconds: 3),
    );

void _snack(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(_snackBar(message));
}
