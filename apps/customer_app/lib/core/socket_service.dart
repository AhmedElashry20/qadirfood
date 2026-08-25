// socket_io_client — الاشتراك في غرفة order:{id} أثناء التتبع.
// السيرفر بيضم العميل تلقائياً لغرفة customer:{id}، فحالة الطلب بتوصل من غير join.
// لكن موقع الكابتن بيتبعت لغرفة order:{id} بس — لازم join صريح.
import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import 'api_client.dart';
import 'env.dart';

/// حالة طلب اتغيّرت (order:status_changed).
class OrderStatusEvent {
  const OrderStatusEvent({required this.orderId, required this.status, this.captainName});

  final String orderId;
  final String status;
  final String? captainName;
}

/// موقع كابتن (captain:location).
class CaptainLocationEvent {
  const CaptainLocationEvent({
    required this.orderId,
    required this.lat,
    required this.lng,
  });

  final String orderId;
  final double lat;
  final double lng;
}

/// رسالة تذكرة دعم جديدة (ticket:message) — رد الدعم أو صدى رسالة العميل أو رسالة نظام.
class TicketMessageEvent {
  const TicketMessageEvent({
    required this.ticketId,
    required this.senderRole,
    required this.body,
    required this.internal,
    this.at,
  });

  final String ticketId;
  final String senderRole;
  final String body;
  final bool internal;
  final DateTime? at;
}

/// حالة تذكرة اتغيّرت (ticket:updated).
class TicketUpdatedEvent {
  const TicketUpdatedEvent({required this.ticketId, required this.status});

  final String ticketId;
  final String status;
}

class SocketService {
  SocketService(this._tokens);

  final TokenStore _tokens;
  io.Socket? _socket;

  /// الطلب اللي انضممنا لغرفته — بنعيد الانضمام بعد أي reconnect.
  String? _joinedOrderId;

  final _status = StreamController<OrderStatusEvent>.broadcast();
  final _location = StreamController<CaptainLocationEvent>.broadcast();
  final _ticketMessage = StreamController<TicketMessageEvent>.broadcast();
  final _ticketUpdated = StreamController<TicketUpdatedEvent>.broadcast();

  Stream<OrderStatusEvent> get statusChanges => _status.stream;
  Stream<CaptainLocationEvent> get captainLocations => _location.stream;

  /// رسائل التذاكر — بتوصل كلها على غرفة العميل (customer:{id}) من غير join.
  Stream<TicketMessageEvent> get ticketMessages => _ticketMessage.stream;
  Stream<TicketUpdatedEvent> get ticketUpdates => _ticketUpdated.stream;

  bool get isConnected => _socket?.connected ?? false;

  void connect() {
    final token = _tokens.accessToken;
    if (token == null || _socket != null) return;

    _socket = io.io(
      Env.socket,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': token})
          .enableReconnection()
          .build(),
    );

    _socket!.on('connect', (_) {
      final orderId = _joinedOrderId;
      if (orderId != null) {
        _socket?.emit('join', {
          'rooms': ['order:$orderId'],
        });
      }
    });

    _socket!.on('order:status_changed', (data) {
      final map = Map<String, dynamic>.from(data as Map);
      final captain = map['captain'] as Map?;
      _status.add(
        OrderStatusEvent(
          orderId: map['orderId'] as String,
          status: map['status'] as String,
          captainName: captain?['name'] as String?,
        ),
      );
    });

    _socket!.on('captain:location', (data) {
      final map = Map<String, dynamic>.from(data as Map);
      final loc = Map<String, dynamic>.from(map['location'] as Map);
      _location.add(
        CaptainLocationEvent(
          orderId: map['orderId'] as String? ?? '',
          lat: (loc['lat'] as num).toDouble(),
          lng: (loc['lng'] as num).toDouble(),
        ),
      );
    });

    _socket!.on('ticket:message', (data) {
      final map = Map<String, dynamic>.from(data as Map);
      _ticketMessage.add(
        TicketMessageEvent(
          ticketId: map['ticketId'] as String? ?? '',
          senderRole: map['senderRole'] as String? ?? 'SYSTEM',
          body: map['body'] as String? ?? '',
          internal: map['internal'] as bool? ?? false,
          at: _parseAt(map['at']),
        ),
      );
    });

    _socket!.on('ticket:updated', (data) {
      final map = Map<String, dynamic>.from(data as Map);
      _ticketUpdated.add(
        TicketUpdatedEvent(
          ticketId: map['id'] as String? ?? '',
          status: map['status'] as String? ?? '',
        ),
      );
    });
  }

  static DateTime? _parseAt(dynamic value) {
    if (value is! String || value.isEmpty) return null;
    return DateTime.tryParse(value)?.toLocal();
  }

  /// الاشتراك في غرفة الطلب — بدونها موقع الكابتن ما يوصلش.
  void joinOrder(String orderId) {
    connect();
    _joinedOrderId = orderId;
    _socket?.emit('join', {
      'rooms': ['order:$orderId'],
    });
  }

  void leaveOrder(String orderId) {
    if (_joinedOrderId == orderId) _joinedOrderId = null;
    _socket?.emit('leave', {
      'rooms': ['order:$orderId'],
    });
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
  }
}

final socketServiceProvider = Provider<SocketService>((ref) {
  final service = SocketService(ref.watch(tokenStoreProvider));
  ref.onDispose(service.disconnect);
  return service;
});
