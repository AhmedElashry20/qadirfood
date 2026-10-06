// محادثة تذكرة الدعم — ثريد لحظي: رسائل العميل والدعم والنظام، مع محرّر رد.
// بيتحدّث لحظياً من ticketThreadProvider (ticket:message + ticket:updated).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../core/router.dart';
import '../../core/theme.dart';
import '../../models/support_ticket.dart';
import '../../providers/support_provider.dart';
import '../../widgets/common.dart';
import 'support_screen.dart' show TicketStatusPill;

class TicketDetailScreen extends ConsumerStatefulWidget {
  const TicketDetailScreen({super.key, required this.ticketId});

  final String ticketId;

  @override
  ConsumerState<TicketDetailScreen> createState() => _TicketDetailScreenState();
}

class _TicketDetailScreenState extends ConsumerState<TicketDetailScreen> {
  final _reply = TextEditingController();
  final _scroll = ScrollController();

  bool _sending = false;
  bool _initialScrollDone = false;

  @override
  void dispose() {
    _reply.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _jumpToBottom() {
    if (!_scroll.hasClients) return;
    _scroll.jumpTo(_scroll.position.maxScrollExtent);
  }

  void _scrollToBottomSoon() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scroll.hasClients) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 240),
        curve: Curves.easeOut,
      );
    });
  }

  Future<void> _send() async {
    if (_sending) return;

    final text = _reply.text.trim();
    if (text.isEmpty) return;

    setState(() => _sending = true);
    try {
      await ref.read(ticketThreadProvider(widget.ticketId).notifier).reply(text);
      _reply.clear();
      _scrollToBottomSoon();
    } on ApiException catch (e) {
      if (mounted) _snack(context, e.message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = ticketThreadProvider(widget.ticketId);
    final async = ref.watch(provider);

    // وصلت رسالة جديدة (رد الدعم أو صدى ردك) → انزل لآخر المحادثة.
    ref.listen(provider, (prev, next) {
      final prevCount = prev?.value?.messages.length ?? 0;
      final nextCount = next.value?.messages.length ?? 0;
      if (nextCount != prevCount) _scrollToBottomSoon();
    });

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: const QHeader(title: 'تذكرة الدعم'),
      body: async.when(
        loading: () => Center(child: CircularProgressIndicator(color: QColors.brand)),
        error: (e, _) => _ErrorView(
          message: e is ApiException ? e.message : 'تعذّر تحميل التذكرة',
          onRetry: () => ref.invalidate(provider),
        ),
        data: _loaded,
      ),
    );
  }

  Widget _loaded(SupportTicket ticket) {
    if (!_initialScrollDone) {
      _initialScrollDone = true;
      WidgetsBinding.instance.addPostFrameCallback((_) => _jumpToBottom());
    }

    final messages = ticket.messages;

    return Column(
      children: [
        _HeaderCard(ticket: ticket),
        Expanded(
          child: messages.isEmpty
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(QSpace.screenH),
                    child: Text('لا توجد رسائل بعد', style: QText.bodyMuted),
                  ),
                )
              : ListView.builder(
                  controller: _scroll,
                  padding: const EdgeInsets.all(QSpace.screenH),
                  itemCount: messages.length,
                  itemBuilder: (_, i) => _MessageBubble(message: messages[i]),
                ),
        ),
        ticket.status.isClosed ? const _ClosedBar() : _Composer(sending: _sending, onSend: _send),
      ],
    );
  }
}

/// هيدر التذكرة: الموضوع + الحالة + رقمها والتصنيف والطلب المرتبط.
class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.ticket});

  final SupportTicket ticket;

  @override
  Widget build(BuildContext context) {
    final orderNumber = ticket.orderNumber;

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: QColors.surface,
        border: Border(bottom: BorderSide(color: QColors.line)),
      ),
      padding: const EdgeInsets.fromLTRB(QSpace.screenH, 14, QSpace.screenH, 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  ticket.subject,
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 15.5,
                    fontWeight: FontWeight.w900,
                    color: QColors.ink,
                    height: 1.35,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              TicketStatusPill(status: ticket.status),
            ],
          ),
          const SizedBox(height: 6),
          Text.rich(
            TextSpan(
              style: TextStyle(
                fontFamily: 'Cairo',
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: QColors.textMuted,
              ),
              children: [
                TextSpan(
                  text: ltr(ticket.number),
                  style: QText.num(size: 12, weight: FontWeight.w700, color: QColors.textMuted),
                ),
                TextSpan(text: ' · ${ticket.category.label}'),
                if (orderNumber != null && orderNumber.isNotEmpty) ...[
                  const TextSpan(text: ' · طلب '),
                  TextSpan(
                    text: ltr('#$orderNumber'),
                    style: QText.num(size: 12, weight: FontWeight.w700, color: QColors.textMuted),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// فقاعة رسالة: العميل (يسار/أصفر) · الدعم (يمين/أبيض) · النظام (وسط/خافت).
class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.message});

  final TicketMessage message;

  @override
  Widget build(BuildContext context) {
    if (message.sender.isSystem) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Center(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: QColors.chip,
              borderRadius: BorderRadius.circular(QRadius.pill),
            ),
            child: Text(
              message.body,
              textAlign: TextAlign.center,
              style: QText.tiny,
            ),
          ),
        ),
      );
    }

    final isCustomer = message.sender.isCustomer;
    final bubbleColor = isCustomer ? QColors.brand : QColors.surface;
    final timeColor = isCustomer ? QColors.goldOnBrand : QColors.textMuted;
    final maxWidth = MediaQuery.of(context).size.width * 0.76;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        mainAxisAlignment: isCustomer ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          ConstrainedBox(
            constraints: BoxConstraints(maxWidth: maxWidth),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              decoration: BoxDecoration(
                color: bubbleColor,
                borderRadius: BorderRadiusDirectional.only(
                  topStart: const Radius.circular(16),
                  topEnd: const Radius.circular(16),
                  bottomStart: Radius.circular(isCustomer ? 16 : 4),
                  bottomEnd: Radius.circular(isCustomer ? 4 : 16),
                ),
                border: isCustomer ? null : Border.all(color: QColors.line),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    message.body,
                    style: TextStyle(
                      fontFamily: 'Cairo',
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                      color: QColors.ink,
                      height: 1.4,
                    ),
                  ),
                  if (message.timeLabel.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Align(
                      alignment: AlignmentDirectional.centerEnd,
                      child: Text(
                        ltr(message.timeLabel),
                        style: QText.num(size: 10.5, weight: FontWeight.w600, color: timeColor),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// محرّر الرد — حقل + زر إرسال دائري.
class _Composer extends StatelessWidget {
  const _Composer({required this.sending, required this.onSend});

  final bool sending;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: QColors.surface,
        border: Border(top: BorderSide(color: QColors.line)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(QSpace.screenH, 10, QSpace.screenH, 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: TextField(
                  minLines: 1,
                  maxLines: 4,
                  textInputAction: TextInputAction.newline,
                  onSubmitted: (_) => onSend(),
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: QColors.ink,
                  ),
                  decoration: const InputDecoration(hintText: 'اكتب ردك…'),
                ),
              ),
              const SizedBox(width: 10),
              _SendButton(enabled: !sending, onTap: onSend),
            ],
          ),
        ),
      ),
    );
  }
}

/// زر الإرسال الدائري الأصفر.
class _SendButton extends StatelessWidget {
  const _SendButton({required this.enabled, required this.onTap});

  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: enabled ? 1 : 0.5,
      child: Material(
        color: QColors.brand,
        shape: const CircleBorder(),
        child: InkWell(
          onTap: enabled ? onTap : null,
          customBorder: const CircleBorder(),
          child: SizedBox(
            width: 46,
            height: 46,
            child: Icon(Icons.send_rounded, size: 20, color: QColors.ink),
          ),
        ),
      ),
    );
  }
}

/// شريط بديل للمحرّر لما تكون التذكرة مغلقة.
class _ClosedBar extends StatelessWidget {
  const _ClosedBar();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: QColors.surface,
        border: Border(top: BorderSide(color: QColors.line)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(QSpace.screenH, 14, QSpace.screenH, 14),
          child: Column(
            children: [
              Text(
                'التذكرة مغلقة',
                style: TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 13.5,
                  fontWeight: FontWeight.w800,
                  color: QColors.textMuted,
                ),
              ),
              const SizedBox(height: 10),
              QButton(
                style: QButtonStyle.outline,
                label: 'افتح تذكرة جديدة',
                onPressed: () => context.pushReplacement(QRoutes.raiseTicket),
              ),
            ],
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
