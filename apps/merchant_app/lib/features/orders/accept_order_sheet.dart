// شاشة ٣: قبول الطلب — اختيار وقت التحضير ١٠/١٥/٢٠/٣٠ (بيحدد توقيت إرسال الكابتن).
//
// في الموبايل الشرائح موجودة جوّه كارت الطلب الوارد نفسه، والشيت ده للتابلت
// (الكارت هناك أضيق) — الاتنين بينادوا نفس `IncomingOrdersNotifier.accept`.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/theme.dart';
import '../../models/order.dart';
import '../../providers/orders_provider.dart';
import '../../widgets/common.dart';
import '../../widgets/order_card.dart';

/// بيفتح شيت القبول ويرجّع true لو الطلب اتقبل فعلاً.
Future<bool> showAcceptOrderSheet(
  BuildContext context,
  WidgetRef ref,
  MerchantOrder order,
) async {
  final done = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: QColors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
    ),
    builder: (_) => _AcceptOrderSheet(order: order),
  );
  return done ?? false;
}

class _AcceptOrderSheet extends ConsumerStatefulWidget {
  const _AcceptOrderSheet({required this.order});

  final MerchantOrder order;

  @override
  ConsumerState<_AcceptOrderSheet> createState() => _AcceptOrderSheetState();
}

class _AcceptOrderSheetState extends ConsumerState<_AcceptOrderSheet> {
  /// الافتراضي ١٥ دقيقة زي التصميم.
  int _prep = 15;
  bool _sending = false;

  Future<void> _confirm() async {
    setState(() => _sending = true);
    try {
      await ref.read(incomingOrdersProvider.notifier).accept(widget.order.id, _prep);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _sending = false);
      showQSnack(context, e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _sending = false);
      showQSnack(context, 'حدث خطأ، حاول مرة أخرى');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(22, 12, 22, 34),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 44,
              height: 5,
              decoration: BoxDecoration(
                color: QColors.border,
                borderRadius: BorderRadius.circular(QRadius.pill),
              ),
            ),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Text(
                'قبول الطلب ',
                style: TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                  color: QColors.ink,
                ),
              ),
              QLtr(
                child: Text(
                  '#${widget.order.number}',
                  style: QText.num(size: 18, weight: FontWeight.w800),
                ),
              ),
            ],
          ),
          const SizedBox(height: 5),
          Text(
            'اختار وقت التحضير — الكابتن هيتبعت على أساسه',
            style: QText.caption.copyWith(fontSize: 13.5),
          ),
          const SizedBox(height: 18),
          QPrepTimeChips(
            value: _prep,
            onChanged: _sending ? (_) {} : (minutes) => setState(() => _prep = minutes),
          ),
          const SizedBox(height: 20),
          QButton(
            label: 'قبول — $_prep دقيقة ✓',
            enabled: !_sending,
            loading: _sending,
            onPressed: _confirm,
          ),
        ],
      ),
    );
  }
}
