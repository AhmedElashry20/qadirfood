// تذاكر الدعم — القائمة + التفاصيل + الرسائل. مطابق لـ /support module في السيرفر.
import 'package:flutter/material.dart';

import '../core/theme.dart';

/// حالة التذكرة — نفس نصوص الـ enum في السيرفر.
enum TicketStatus {
  open('OPEN', 'مفتوحة'),
  pending('PENDING', 'بانتظار الرد'),
  escalated('ESCALATED', 'قيد المعالجة'),
  closed('CLOSED', 'مغلقة');

  const TicketStatus(this.wire, this.label);

  /// القيمة المتبادلة مع الـ API.
  final String wire;

  /// الاسم المعروض للعميل.
  final String label;

  static TicketStatus fromWire(String value) =>
      TicketStatus.values.firstWhere((s) => s.wire == value, orElse: () => TicketStatus.open);

  /// مغلقة = ما ينفعش رد جديد.
  bool get isClosed => this == TicketStatus.closed;

  /// لون البادچ (ذهبي مفتوحة/بانتظار · أحمر قيد المعالجة · رمادي مغلقة).
  Color get color => switch (this) {
        TicketStatus.open => QColors.gold,
        TicketStatus.pending => QColors.goldDeep,
        TicketStatus.escalated => QColors.danger,
        TicketStatus.closed => QColors.textMuted,
      };
}

/// تصنيف التذكرة.
enum TicketCategory {
  order('ORDER', 'الطلب'),
  payment('PAYMENT', 'الدفع'),
  delivery('DELIVERY', 'التوصيل'),
  captain('CAPTAIN', 'الكابتن'),
  app('APP', 'التطبيق'),
  other('OTHER', 'أخرى');

  const TicketCategory(this.wire, this.label);

  final String wire;
  final String label;

  static TicketCategory fromWire(String value) =>
      TicketCategory.values.firstWhere((c) => c.wire == value, orElse: () => TicketCategory.other);
}

/// مُرسِل الرسالة — العميل يشوف رسائل الدعم والنظام بس (مافيش داخلي).
enum TicketSender {
  customer('CUSTOMER'),
  agent('AGENT'),
  system('SYSTEM');

  const TicketSender(this.wire);

  final String wire;

  static TicketSender fromWire(String value) =>
      TicketSender.values.firstWhere((s) => s.wire == value, orElse: () => TicketSender.system);

  bool get isCustomer => this == TicketSender.customer;
  bool get isSystem => this == TicketSender.system;
}

/// رسالة واحدة في محادثة التذكرة.
class TicketMessage {
  const TicketMessage({
    required this.id,
    required this.sender,
    required this.body,
    required this.internal,
    this.createdAt,
  });

  final String id;
  final TicketSender sender;
  final String body;

  /// ملاحظة داخلية للدعم — العميل ما بيستقبلهاش أصلاً، ونتجاهلها احتياطاً.
  final bool internal;
  final DateTime? createdAt;

  factory TicketMessage.fromJson(Map<String, dynamic> json) => TicketMessage(
        id: (json['id'] as String?) ?? '',
        sender: TicketSender.fromWire((json['senderRole'] as String?) ?? 'SYSTEM'),
        body: (json['body'] as String?) ?? '',
        internal: json['internal'] as bool? ?? false,
        createdAt: _parseDate(json['createdAt']),
      );

  /// «9:12 PM» — وقت الرسالة (يتعزل للـ bidi وقت العرض).
  String get timeLabel => createdAt == null ? '' : _timeLabel(createdAt!);
}

/// التذكرة — نفس الموديل للقائمة والتفاصيل (الرسائل بتيجي مع التفاصيل بس).
class SupportTicket {
  const SupportTicket({
    required this.id,
    required this.ticketNumber,
    required this.subject,
    required this.category,
    required this.status,
    this.priority,
    this.orderNumber,
    this.orderTotal,
    this.customerName,
    this.customerPhone,
    this.assignedTo,
    this.createdAt,
    this.lastMessageAt,
    this.resolvedAt,
    this.messages = const [],
  });

  final String id;

  /// رقم التذكرة الخام من الـ API («TK-1024»).
  final String ticketNumber;
  final String subject;
  final TicketCategory category;
  final TicketStatus status;
  final String? priority;

  /// رقم الطلب المرتبط («A-1010») أو null.
  final String? orderNumber;
  final double? orderTotal;
  final String? customerName;
  final String? customerPhone;
  final String? assignedTo;
  final DateTime? createdAt;
  final DateTime? lastMessageAt;
  final DateTime? resolvedAt;

  /// رسائل غير داخلية بس (اللي العميل يشوفها).
  final List<TicketMessage> messages;

  /// «#TK-1024» — للعرض (بيتعزل للـ bidi).
  String get number => ticketNumber.isEmpty ? '' : '#$ticketNumber';

  /// «الآن» / «منذ 5 دقائق» / «أمس» — آخر نشاط في التذكرة.
  String get lastActivityLabel => _relativeLabel(lastMessageAt ?? createdAt);

  factory SupportTicket.fromJson(Map<String, dynamic> json) {
    final order = json['order'] as Map<String, dynamic>?;
    final customer = json['customer'] as Map<String, dynamic>?;

    return SupportTicket(
      id: (json['id'] as String?) ?? '',
      ticketNumber: (json['ticketNumber'] as String?) ?? '',
      subject: (json['subject'] as String?) ?? '',
      category: TicketCategory.fromWire((json['category'] as String?) ?? 'OTHER'),
      status: TicketStatus.fromWire((json['status'] as String?) ?? 'OPEN'),
      priority: json['priority'] as String?,
      orderNumber: (order?['orderNumber'] as String?) ?? (json['orderNumber'] as String?),
      orderTotal: (order?['total'] as num?)?.toDouble(),
      customerName: customer?['name'] as String?,
      customerPhone: customer?['phone'] as String?,
      assignedTo: _assignedName(json['assignedTo']),
      createdAt: _parseDate(json['createdAt']),
      lastMessageAt: _parseDate(json['lastMessageAt']),
      resolvedAt: _parseDate(json['resolvedAt']),
      messages: [
        for (final raw in (json['messages'] as List<dynamic>? ?? const []))
          if ((raw as Map<String, dynamic>)['internal'] != true)
            TicketMessage.fromJson(raw),
      ],
    );
  }

  SupportTicket copyWith({
    TicketStatus? status,
    List<TicketMessage>? messages,
    DateTime? lastMessageAt,
  }) =>
      SupportTicket(
        id: id,
        ticketNumber: ticketNumber,
        subject: subject,
        category: category,
        status: status ?? this.status,
        priority: priority,
        orderNumber: orderNumber,
        orderTotal: orderTotal,
        customerName: customerName,
        customerPhone: customerPhone,
        assignedTo: assignedTo,
        createdAt: createdAt,
        lastMessageAt: lastMessageAt ?? this.lastMessageAt,
        resolvedAt: resolvedAt,
        messages: messages ?? this.messages,
      );

  /// `assignedTo` ممكن يكون اسم مباشر أو كائن فيه name.
  static String? _assignedName(dynamic value) => switch (value) {
        final String name => name,
        final Map<String, dynamic> map => map['name'] as String?,
        _ => null,
      };
}

// ── تنسيق التواريخ (عربي مختصر، من غير locale data) ──

DateTime? _parseDate(dynamic value) {
  if (value is! String || value.isEmpty) return null;
  return DateTime.tryParse(value)?.toLocal();
}

/// «9:12 PM»
String _timeLabel(DateTime dt) {
  final hour12 = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
  final minute = dt.minute.toString().padLeft(2, '0');
  return '$hour12:$minute ${dt.hour < 12 ? 'AM' : 'PM'}';
}

/// «الآن» / «منذ 5 دقائق» / «منذ 3 ساعات» / «أمس» / «منذ 4 أيام» / «3/7»
String _relativeLabel(DateTime? dt) {
  if (dt == null) return '';

  final diff = DateTime.now().difference(dt);
  if (diff.inMinutes < 1) return 'الآن';
  if (diff.inMinutes < 60) {
    final m = diff.inMinutes;
    return 'منذ $m ${_arUnit(m, 'دقيقة', 'دقيقتين', 'دقائق')}';
  }
  if (diff.inHours < 24) {
    final h = diff.inHours;
    return 'منذ $h ${_arUnit(h, 'ساعة', 'ساعتين', 'ساعات')}';
  }
  if (diff.inDays == 1) return 'أمس';
  if (diff.inDays < 7) return 'منذ ${diff.inDays} أيام';
  return '${dt.day}/${dt.month}';
}

/// جمع عربي مبسّط: 1 مفرد · 2 مثنّى · 3-10 جمع · 11+ مفرد.
String _arUnit(int n, String one, String two, String few) {
  if (n == 1) return one;
  if (n == 2) return two;
  if (n >= 3 && n <= 10) return few;
  return one;
}
