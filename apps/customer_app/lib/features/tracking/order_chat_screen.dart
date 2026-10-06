// محادثة الطلب مع المندوب.
// الرسايل من GET /orders/:id/messages، والجديد بيوصل لحظياً على order:message.
// المحادثة بتتقفل بعد التسليم — بنعرض السبب بدل ما حقل الكتابة يبان معطّل بلا تفسير.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api_client.dart';
import '../../core/format.dart';
import '../../core/socket_service.dart';
import '../../core/theme.dart';
import '../../data/api_repository.dart';
import '../../models/order_chat.dart';
import '../../widgets/common.dart';

/// محادثة طلب — بتتحدّث لحظياً من السوكيت.
final orderChatProvider =
    FutureProvider.family<OrderChat, String>((ref, orderId) async {
  return ref.read(ordersRepositoryProvider).chat(orderId);
});

class OrderChatScreen extends ConsumerStatefulWidget {
  const OrderChatScreen({super.key, required this.orderId});

  final String orderId;

  @override
  ConsumerState<OrderChatScreen> createState() => _OrderChatScreenState();
}

class _OrderChatScreenState extends ConsumerState<OrderChatScreen> {
  final _controller = TextEditingController();
  final _scroll = ScrollController();
  StreamSubscription<OrderMessageEvent>? _sub;
  bool _sending = false;
  String? _error;

  @override
  void initState() {
    super.initState();

    // الاشتراك في غرفة الطلب: من غيره الرسالة بتوصل بعد إعادة تحميل الشاشة بس.
    ref.read(socketServiceProvider).joinOrder(widget.orderId);
    _sub = ref.read(socketServiceProvider).orderMessages.listen((event) {
      if (event.orderId != widget.orderId) return;
      // بنعيد التحميل من السيرفر بدل ما نلزق الرسالة محلياً: الرد بيحدّد `mine`
      // و`readAt`، ولزقها محلياً كان بيخلّي فقاعة العميل تبان بجهة غلط.
      ref.invalidate(orderChatProvider(widget.orderId));
    });

    // فتح الشاشة = قراءة. الفشل مش مهم — مؤشّر قراءة مش سبب لرسالة خطأ.
    Future.microtask(() async {
      try {
        await ref.read(ordersRepositoryProvider).markChatRead(widget.orderId);
      } on ApiException {
        // نتجاهل: المحادثة ممكن تكون مقفولة أو الشبكة وقعت.
      }
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    _controller.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _sending) return;

    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref.read(ordersRepositoryProvider).sendMessage(widget.orderId, text);
      _controller.clear();
      ref.invalidate(orderChatProvider(widget.orderId));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final chat = ref.watch(orderChatProvider(widget.orderId));

    return Scaffold(
      backgroundColor: QColors.canvas,
      appBar: const QHeader(title: 'المحادثة مع المندوب'),
      body: chat.when(
        loading: () => Center(child: CircularProgressIndicator(color: QColors.brand)),
        error: (e, _) => QEmpty(message: '$e', emoji: '⚠️'),
        data: (data) => Column(
          children: [
            Expanded(
              child: data.messages.isEmpty
                  ? QEmpty(
                      message: data.hasCaptain
                          ? 'ابدأ المحادثة — سيرى المندوب رسالتك فوراً'
                          : 'المحادثة تُفتح بعد إسناد مندوب لطلبك',
                      emoji: '💬',
                    )
                  : ListView.builder(
                      controller: _scroll,
                      reverse: true,
                      padding: const EdgeInsets.all(QSpace.screenH),
                      itemCount: data.messages.length,
                      itemBuilder: (_, i) {
                        // `reverse` بيعرض من الآخر، فبنقلب الفهرس عشان الترتيب
                        // الزمني يفضل صح.
                        final message = data.messages[data.messages.length - 1 - i];
                        return _Bubble(message: message);
                      },
                    ),
            ),
            if (_error != null)
              Container(
                width: double.infinity,
                color: QColors.danger.withValues(alpha: 0.08),
                padding: const EdgeInsets.symmetric(horizontal: QSpace.screenH, vertical: 8),
                child: Text(
                  _error!,
                  style: TextStyle(
                    fontFamily: 'Cairo',
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: QColors.danger,
                  ),
                ),
              ),
            _Composer(
              controller: _controller,
              enabled: data.open && !_sending,
              sending: _sending,
              // السبب صريح: «مقفولة» من غير سبب بتخلّي العميل يفضل يحاول.
              disabledHint: data.hasCaptain
                  ? 'المحادثة تُقفل بعد انتهاء الطلب — تواصل مع الدعم'
                  : 'في انتظار إسناد مندوب',
              onSend: _send,
            ),
          ],
        ),
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message});

  final OrderChatMessage message;

  @override
  Widget build(BuildContext context) {
    if (message.isSystem) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Center(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            decoration: BoxDecoration(
              color: QColors.surface,
              borderRadius: BorderRadius.circular(QRadius.pill),
            ),
            child: Text(
              message.body,
              textAlign: TextAlign.center,
              style: TextStyle(
                fontFamily: 'Cairo',
                fontSize: 11.5,
                fontWeight: FontWeight.w600,
                color: QColors.label,
              ),
            ),
          ),
        ),
      );
    }

    final mine = message.mine;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        mainAxisAlignment: mine ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          Flexible(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 10),
              decoration: BoxDecoration(
                color: mine ? QColors.brand : QColors.surface,
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(QRadius.md),
                  topRight: const Radius.circular(QRadius.md),
                  bottomLeft: Radius.circular(mine ? QRadius.md : 4),
                  bottomRight: Radius.circular(mine ? 4 : QRadius.md),
                ),
                border: mine ? null : Border.all(color: QColors.border),
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
                      height: 1.5,
                      color: mine ? Colors.white : QColors.ink,
                    ),
                  ),
                  if (message.createdAt != null) ...[
                    const SizedBox(height: 4),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          _time(message.createdAt!),
                          style: TextStyle(
                            fontFamily: 'Cairo',
                            fontSize: 10.5,
                            fontWeight: FontWeight.w600,
                            color: mine ? Colors.white70 : QColors.label,
                          ),
                        ),
                        if (mine && message.readAt != null) ...[
                          const SizedBox(width: 4),
                          const Icon(Icons.done_all, size: 13, color: Colors.white70),
                        ],
                      ],
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

  static String _time(DateTime at) {
    final hour12 = at.hour % 12 == 0 ? 12 : at.hour % 12;
    final minute = at.minute.toString().padLeft(2, '0');
    return '${ltr('$hour12:$minute')} ${at.hour < 12 ? 'ص' : 'م'}';
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.enabled,
    required this.sending,
    required this.disabledHint,
    required this.onSend,
  });

  final TextEditingController controller;
  final bool enabled;
  final bool sending;
  final String disabledHint;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    if (!enabled && !sending) {
      return QBottomBar(
        child: Text(
          disabledHint,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontFamily: 'Cairo',
            fontSize: 12.5,
            fontWeight: FontWeight.w700,
            color: QColors.label,
          ),
        ),
      );
    }

    return QBottomBar(
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: controller,
              maxLines: 4,
              minLines: 1,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => onSend(),
              style: TextStyle(
                fontFamily: 'Cairo',
                fontSize: 13.5,
                fontWeight: FontWeight.w600,
                color: QColors.ink,
              ),
              decoration: InputDecoration(
                hintText: 'اكتب رسالتك…',
                hintStyle: TextStyle(
                  fontFamily: 'Cairo',
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: QColors.label,
                ),
                filled: true,
                fillColor: QColors.surface,
                contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(QRadius.pill),
                  borderSide: BorderSide(color: QColors.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(QRadius.pill),
                  borderSide: BorderSide(color: QColors.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(QRadius.pill),
                  borderSide: BorderSide(color: QColors.brand, width: 1.6),
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          InkWell(
            onTap: sending ? null : onSend,
            borderRadius: BorderRadius.circular(QRadius.pill),
            child: Container(
              width: 46,
              height: 46,
              decoration: BoxDecoration(color: QColors.brand, shape: BoxShape.circle),
              child: Center(
                child: sending
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                      )
                    : const Icon(Icons.send_rounded, size: 20, color: Colors.white),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
