// رفض الطلب — السبب إلزامي (من REJECT_REASONS_AR أو سبب مخصص).
// بيرجّع true لو الرفض اتم فعلاً عشان الشاشة توقف صوت التنبيه.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/enums.dart';
import '../../core/theme.dart';
import '../../models/order.dart';
import '../../providers/orders_provider.dart';
import '../../widgets/common.dart';
import '../../widgets/order_card.dart';

/// آخر سبب في kRejectReasons هو «سبب آخر» — بيفتح حقل كتابة حر.
const _customReason = 'سبب آخر';

/// بيفتح شيت الرفض ويرجّع true لو الطلب اترفض.
Future<bool> showRejectOrderSheet(
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
    builder: (_) => _RejectOrderSheet(order: order),
  );
  return done ?? false;
}

class _RejectOrderSheet extends ConsumerStatefulWidget {
  const _RejectOrderSheet({required this.order});

  final MerchantOrder order;

  @override
  ConsumerState<_RejectOrderSheet> createState() => _RejectOrderSheetState();
}

class _RejectOrderSheetState extends ConsumerState<_RejectOrderSheet> {
  String? _selected;
  final _customCtrl = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _customCtrl.dispose();
    super.dispose();
  }

  bool get _isCustom => _selected == _customReason;

  /// السبب النهائي اللي هيتبعت للسيرفر — فاضي معناه الزر مقفول.
  String get _reason => _isCustom ? _customCtrl.text.trim() : (_selected ?? '');

  bool get _canConfirm => _selected != null && _reason.isNotEmpty && !_sending;

  Future<void> _confirm() async {
    setState(() => _sending = true);
    try {
      await ref.read(incomingOrdersProvider.notifier).reject(widget.order.id, _reason);
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _sending = false);
      showQSnack(context, e.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _sending = false);
      showQSnack(context, 'حصل خطأ، حاول تاني');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      // مساحة للكيبورد لما يتفتح حقل «سبب آخر».
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        child: Padding(
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
                  const Text(
                    'رفض الطلب ',
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
                  const Text(
                    '؟',
                    style: TextStyle(
                      fontFamily: 'Cairo',
                      fontSize: 18,
                      fontWeight: FontWeight.w900,
                      color: QColors.ink,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 5),
              Text(
                'السبب إلزامي وهيوصل للعميل',
                style: QText.caption.copyWith(fontSize: 13.5),
              ),
              const SizedBox(height: 16),
              for (final reason in kRejectReasons) ...[
                _ReasonTile(
                  label: reason,
                  selected: _selected == reason,
                  onTap: _sending ? null : () => setState(() => _selected = reason),
                ),
                const SizedBox(height: 9),
              ],
              if (_isCustom) ...[
                const SizedBox(height: 2),
                QField(
                  hint: 'اكتب السبب…',
                  controller: _customCtrl,
                  maxLines: 2,
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: 6),
              ],
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: QButton(
                      label: 'إلغاء',
                      style: QButtonStyle.outline,
                      enabled: !_sending,
                      onPressed: () => Navigator.of(context).pop(false),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    flex: 2,
                    child: QButton(
                      label: 'تأكيد الرفض',
                      style: QButtonStyle.dark,
                      enabled: _canConfirm,
                      loading: _sending,
                      onPressed: _confirm,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ReasonTile extends StatelessWidget {
  const _ReasonTile({required this.label, required this.selected, this.onTap});

  final String label;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(QRadius.md),
      child: Container(
        constraints: const BoxConstraints(minHeight: QSpace.tapTarget),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          color: selected ? QColors.tintSoft : QColors.surface,
          borderRadius: BorderRadius.circular(QRadius.md),
          border: Border.all(
            color: selected ? QColors.brand : QColors.border,
            width: selected ? 2 : 1.5,
          ),
        ),
        child: Row(
          children: [
            QRadioDot(selected: selected),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                label,
                style: QText.body.copyWith(
                  fontWeight: selected ? FontWeight.w800 : FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
