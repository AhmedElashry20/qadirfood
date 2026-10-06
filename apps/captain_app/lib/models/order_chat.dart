// محادثة الطلب مع العميل — موديلات العرض.
// نفس شكل الرد في تطبيق العميل؛ `mine` بيتحسب على السيرفر حسب دور المستخدم.

class OrderChatMessage {
  const OrderChatMessage({
    required this.id,
    required this.senderRole,
    required this.body,
    required this.mine,
    this.createdAt,
    this.readAt,
  });

  final String id;

  /// CUSTOMER · CAPTAIN · SYSTEM
  final String senderRole;
  final String body;

  /// رسالتي — بتحدّد جهة الفقاعة ولونها.
  final bool mine;
  final DateTime? createdAt;
  final DateTime? readAt;

  bool get isSystem => senderRole == 'SYSTEM';

  factory OrderChatMessage.fromJson(Map<String, dynamic> json) => OrderChatMessage(
        id: (json['id'] as String?) ?? '',
        senderRole: (json['senderRole'] as String?) ?? 'SYSTEM',
        body: (json['body'] as String?) ?? '',
        mine: json['mine'] as bool? ?? false,
        createdAt: DateTime.tryParse((json['createdAt'] as String?) ?? '')?.toLocal(),
        readAt: DateTime.tryParse((json['readAt'] as String?) ?? '')?.toLocal(),
      );
}

/// حالة المحادثة + رسايلها.
class OrderChat {
  const OrderChat({
    required this.open,
    required this.hasCaptain,
    required this.messages,
  });

  /// مفتوحة للكتابة — من إسناد المندوب لحد التسليم.
  final bool open;

  /// فيه مندوب مسند على الطلب.
  final bool hasCaptain;
  final List<OrderChatMessage> messages;

  factory OrderChat.fromJson(Map<String, dynamic> json) => OrderChat(
        open: json['open'] as bool? ?? false,
        hasCaptain: json['hasCaptain'] as bool? ?? false,
        messages: [
          for (final raw in (json['messages'] as List<dynamic>? ?? const []))
            OrderChatMessage.fromJson(raw as Map<String, dynamic>),
        ],
      );

  static const empty = OrderChat(open: false, hasCaptain: false, messages: []);
}
