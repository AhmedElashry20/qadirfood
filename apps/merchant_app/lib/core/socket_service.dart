// socket_io_client — الاشتراك في غرفة branch:{id} واستقبال order:new.
// السيرفر بيضم المستخدم تلقائياً لغرفة فرعه حسب التوكن، فمافيش join يدوي.
import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import 'api_client.dart';
import 'env.dart';

/// طلب جديد وصل للفرع (order:new).
class NewOrderEvent {
  const NewOrderEvent({
    required this.orderId,
    required this.orderNumber,
    required this.total,
    required this.itemCount,
    this.customerNotes,
  });

  final String orderId;
  final String orderNumber;
  final double total;
  final int itemCount;
  final String? customerNotes;
}

/// حالة طلب اتغيّرت (order:status_changed) — بتوصل لما الكابتن يستلم مثلاً.
class OrderStatusEvent {
  const OrderStatusEvent({required this.orderId, required this.status, this.captainName});

  final String orderId;
  final String status;
  final String? captainName;
}

/// اتعيّن كابتن للطلب (order:captain_assigned).
class CaptainAssignedEvent {
  const CaptainAssignedEvent({
    required this.orderId,
    required this.captainName,
    this.plateNumber,
    this.rating,
  });

  final String orderId;
  final String captainName;
  final String? plateNumber;
  final double? rating;
}

class SocketService {
  SocketService(this._tokens);

  final TokenStore _tokens;
  io.Socket? _socket;

  final _newOrders = StreamController<NewOrderEvent>.broadcast();
  final _statusChanges = StreamController<OrderStatusEvent>.broadcast();
  final _captainAssigned = StreamController<CaptainAssignedEvent>.broadcast();

  Stream<NewOrderEvent> get newOrders => _newOrders.stream;
  Stream<OrderStatusEvent> get statusChanges => _statusChanges.stream;
  Stream<CaptainAssignedEvent> get captainAssigned => _captainAssigned.stream;

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

    _socket!.on('order:new', (data) {
      final map = Map<String, dynamic>.from(data as Map);
      _newOrders.add(
        NewOrderEvent(
          orderId: map['orderId'] as String,
          orderNumber: (map['orderNumber'] as String?) ?? '',
          total: (map['total'] as num?)?.toDouble() ?? 0,
          itemCount: (map['itemCount'] as num?)?.toInt() ?? 0,
          customerNotes: map['customerNotes'] as String?,
        ),
      );
    });

    _socket!.on('order:status_changed', (data) {
      final map = Map<String, dynamic>.from(data as Map);
      final captain = map['captain'] as Map?;
      _statusChanges.add(
        OrderStatusEvent(
          orderId: map['orderId'] as String,
          status: map['status'] as String,
          captainName: captain?['name'] as String?,
        ),
      );
    });

    _socket!.on('order:captain_assigned', (data) {
      final map = Map<String, dynamic>.from(data as Map);
      final captain = Map<String, dynamic>.from(map['captain'] as Map);
      _captainAssigned.add(
        CaptainAssignedEvent(
          orderId: map['orderId'] as String,
          captainName: (captain['name'] as String?) ?? '',
          plateNumber: captain['plateNumber'] as String?,
          rating: (captain['rating'] as num?)?.toDouble(),
        ),
      );
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
