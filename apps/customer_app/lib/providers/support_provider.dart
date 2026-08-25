// تذاكر الدعم — قائمة تذاكري + محادثة تذكرة لحظية عبر Socket.IO (نفس نمط تتبع الطلب).
// * رسائل الدعم بتيجي من `ticket:message` (السيرفر بيضم العميل لغرفة customer:{id}).
// * تغيّر الحالة بييجي من `ticket:updated` — من غير join لأي غرفة تذكرة.
import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/socket_service.dart';
import '../data/api_repository.dart';
import '../models/support_ticket.dart';

/// قائمة «تذاكري» (GET /support/tickets/mine) مع سحب للتحديث.
class MyTicketsNotifier extends AsyncNotifier<List<SupportTicket>> {
  @override
  Future<List<SupportTicket>> build() => _fetch();

  Future<List<SupportTicket>> _fetch() => ref.read(supportRepositoryProvider).myTickets();

  /// سحب لأسفل للتحديث — بيحافظ على القائمة القديمة لحد ما الجديدة توصل.
  Future<void> refresh() async {
    state = await AsyncValue.guard(_fetch);
  }
}

final myTicketsProvider =
    AsyncNotifierProvider<MyTicketsNotifier, List<SupportTicket>>(MyTicketsNotifier.new);

/// محادثة تذكرة واحدة بالتفصيل — بتفضل لحظية طول ما شاشة التذكرة مفتوحة.
class TicketThreadNotifier extends AsyncNotifier<SupportTicket> {
  TicketThreadNotifier(this.ticketId);

  final String ticketId;

  StreamSubscription<TicketMessageEvent>? _messageSub;
  StreamSubscription<TicketUpdatedEvent>? _updatedSub;

  @override
  Future<SupportTicket> build() async {
    final ticket = await ref.read(supportRepositoryProvider).ticketDetail(ticketId);

    final socket = ref.read(socketServiceProvider);
    socket.connect();

    // العميل بياخد رسائله على غرفة customer:{id} تلقائياً — بنرشّح بالـ ticketId بس.
    _messageSub =
        socket.ticketMessages.where((e) => e.ticketId == ticketId).listen(_onMessage);
    _updatedSub =
        socket.ticketUpdates.where((e) => e.ticketId == ticketId).listen(_onUpdated);

    ref.onDispose(() {
      _messageSub?.cancel();
      _updatedSub?.cancel();
    });

    return ticket;
  }

  /// رسالة جديدة لحظياً — نضيفها لآخر المحادثة ونحدّث آخر نشاط في القائمة.
  void _onMessage(TicketMessageEvent event) {
    final current = state.value;
    if (current == null) return;
    if (event.internal) return; // العميل ما بيشوفش الملاحظات الداخلية.

    final incoming = TicketMessage(
      id: '',
      sender: TicketSender.fromWire(event.senderRole),
      body: event.body,
      internal: false,
      createdAt: event.at ?? DateTime.now(),
    );

    // تفادي تكرار صدى رسالة العميل اللي رجعت أصلاً من رد الـ POST.
    final messages = current.messages;
    if (messages.isNotEmpty) {
      final last = messages.last;
      if (last.sender == incoming.sender && last.body == incoming.body) return;
    }

    state = AsyncData(
      current.copyWith(
        messages: [...messages, incoming],
        lastMessageAt: incoming.createdAt,
      ),
    );
    ref.invalidate(myTicketsProvider);
  }

  /// الحالة اتغيّرت (اتقفلت / رجعت مفتوحة…) — نحدّث الهيدر والقائمة.
  void _onUpdated(TicketUpdatedEvent event) {
    final current = state.value;
    if (current == null || event.status.isEmpty) return;

    state = AsyncData(current.copyWith(status: TicketStatus.fromWire(event.status)));
    ref.invalidate(myTicketsProvider);
  }

  /// رد العميل (POST /support/tickets/:id/messages) — بيرجّع التفاصيل المحدّثة.
  Future<void> reply(String body) async {
    final updated = await ref.read(supportRepositoryProvider).replyTicket(ticketId, body);
    state = AsyncData(updated);
    ref.invalidate(myTicketsProvider);
  }
}

final ticketThreadProvider =
    AsyncNotifierProvider.family<TicketThreadNotifier, SupportTicket, String>(
  TicketThreadNotifier.new,
);
