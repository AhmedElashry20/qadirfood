// فتح تذكرة دعم جديدة — POST /support/tickets ثم فتح محادثة التذكرة.
// الموضوع والتفاصيل إلزاميين، والتصنيف من الستة الثابتة، والربط بطلب اختياري.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../data/api_repository.dart';
import '../../models/order.dart';
import '../../models/support_ticket.dart';
import '../../providers/orders_provider.dart';
import '../../providers/support_provider.dart';
import '../../widgets/common.dart';

class RaiseTicketScreen extends ConsumerStatefulWidget {
  const RaiseTicketScreen({super.key});

  @override
  ConsumerState<RaiseTicketScreen> createState() => _RaiseTicketScreenState();
}

class _RaiseTicketScreenState extends ConsumerState<RaiseTicketScreen> {
  final _subject = TextEditingController();
  final _body = TextEditingController();

  TicketCategory _category = TicketCategory.order;
  String? _orderId;
  bool _sending = false;

  @override
  void dispose() {
    _subject.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_sending) return;

    final subject = _subject.text.trim();
    final body = _body.text.trim();
    if (subject.isEmpty || body.isEmpty) {
      _snack(context, 'اكتب موضوع التذكرة وتفاصيل المشكلة');
      return;
    }

    setState(() => _sending = true);
    try {
      final created = await ref.read(supportRepositoryProvider).raiseTicket(
            subject: subject,
            category: _category,
            body: body,
            orderId: _orderId,
          );
      ref.invalidate(myTicketsProvider);

      if (!mounted) return;
      // pushReplacement عشان الرجوع من التذكرة يوديك للدعم مش لنموذج فاضي.
      context.pushReplacement(QRoutes.ticket(created.id));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _sending = false);
      _snack(context, e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    // أحدث الطلبات للربط الاختياري (بترجع من نفس بروڤايدر طلباتي).
    final orders = ref.watch(ordersProvider).value ?? const <Order>[];
    final recent = orders.take(6).toList();

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: const QHeader(title: 'تذكرة جديدة'),
      body: ListView(
        padding: const EdgeInsets.all(QSpace.screenH),
        children: [
          QField(
            label: 'الموضوع',
            hint: 'اكتب موضوع مختصر…',
            controller: _subject,
          ),
          const SizedBox(height: 18),

          const _Label('التصنيف'),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final category in TicketCategory.values)
                QChip(
                  label: category.label,
                  selected: category == _category,
                  onTap: () => setState(() => _category = category),
                ),
            ],
          ),
          const SizedBox(height: 18),

          if (recent.isNotEmpty) ...[
            const _Label('اربطها بطلب (اختياري)'),
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                QChip(
                  label: 'بدون طلب',
                  selected: _orderId == null,
                  onTap: () => setState(() => _orderId = null),
                ),
                for (final order in recent)
                  QChip(
                    label: ltr(order.number.isEmpty ? order.restaurantName : order.number),
                    selected: _orderId == order.id,
                    onTap: () => setState(() => _orderId = order.id),
                  ),
              ],
            ),
            const SizedBox(height: 18),
          ],

          const _Label('تفاصيل المشكلة'),
          const SizedBox(height: 10),
          QField(
            hint: 'اشرح مشكلتك بالتفصيل…',
            controller: _body,
            maxLines: 6,
          ),
        ],
      ),
      bottomNavigationBar: QBottomBar(
        child: QButton(
          label: _sending ? 'جاري الإرسال…' : 'افتح التذكرة',
          enabled: !_sending,
          onPressed: _submit,
        ),
      ),
    );
  }
}

/// عنوان حقل صغير فوق كل قسم.
class _Label extends StatelessWidget {
  const _Label(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Text(text, style: QText.fieldLabel);
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
