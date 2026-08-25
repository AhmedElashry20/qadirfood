// طبقة رقيقة فوق ApiClient — بترجّع موديلات التطبيق جاهزة للبروڤايدرز.
// كل الأخطاء بتطلع منها كـ ApiException برسالتها العربية من السيرفر.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api_client.dart';
import '../core/enums.dart';
import '../models/address.dart';
import '../models/cart.dart';
import '../models/menu_item.dart';
import '../models/order.dart';
import '../models/restaurant.dart';
import '../models/support_ticket.dart';

// ─────────────────────────── أنواع مساعدة ───────────────────────────

/// نتيجة طلب رمز التحقق — `devCode` بيرجع في بيئة التطوير بس.
typedef OtpChallenge = ({int expiresInSeconds, String? devCode});

/// الجلسة بعد التحقق من الرمز.
class AuthSession {
  const AuthSession({
    required this.accessToken,
    required this.refreshToken,
    required this.userId,
    required this.fullName,
    required this.phone,
    this.email,
    this.avatarUrl,
  });

  final String accessToken;
  final String refreshToken;
  final String userId;
  final String fullName;
  final String phone;
  final String? email;
  final String? avatarUrl;

  factory AuthSession.fromJson(Map<String, dynamic> json) {
    final user = (json['user'] as Map<String, dynamic>?) ?? const {};
    return AuthSession(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
      userId: (user['id'] as String?) ?? '',
      fullName: (user['fullName'] as String?) ?? '',
      phone: (user['phone'] as String?) ?? '',
      email: user['email'] as String?,
      avatarUrl: user['avatarUrl'] as String?,
    );
  }
}

/// بيانات العميل في شاشة الحساب.
class CustomerProfile {
  const CustomerProfile({
    required this.id,
    required this.fullName,
    required this.phone,
    this.email,
    this.avatarUrl,
    this.walletBalance = 0,
    this.ordersCount = 0,
    this.favoritesCount = 0,
  });

  final String id;
  final String fullName;
  final String phone;
  final String? email;
  final String? avatarUrl;
  final double walletBalance;
  final int ordersCount;
  final int favoritesCount;

  factory CustomerProfile.fromJson(Map<String, dynamic> json) => CustomerProfile(
        id: (json['id'] as String?) ?? '',
        fullName: (json['fullName'] as String?) ?? '',
        phone: (json['phone'] as String?) ?? '',
        email: json['email'] as String?,
        avatarUrl: json['avatarUrl'] as String?,
        walletBalance: (json['walletBalance'] as num?)?.toDouble() ?? 0,
        ordersCount: (json['ordersCount'] as num?)?.toInt() ?? 0,
        favoritesCount: (json['favoritesCount'] as num?)?.toInt() ?? 0,
      );
}

/// نتيجة التحقق من كوبون.
class CouponValidation {
  const CouponValidation({required this.code, required this.discount, this.descriptionAr});

  final String code;
  final double discount;
  final String? descriptionAr;

  factory CouponValidation.fromJson(Map<String, dynamic> json) => CouponValidation(
        code: (json['code'] as String?) ?? '',
        discount: (json['discount'] as num?)?.toDouble() ?? 0,
        descriptionAr: json['descriptionAr'] as String?,
      );
}

/// صنف في جسم POST /orders.
class OrderItemInput {
  const OrderItemInput({
    required this.menuItemId,
    required this.quantity,
    this.notes,
    this.optionIds = const [],
  });

  final String menuItemId;
  final int quantity;
  final String? notes;
  final List<String> optionIds;

  factory OrderItemInput.fromCartLine(CartLine line) => OrderItemInput(
        menuItemId: line.item.id,
        quantity: line.quantity,
        notes: line.notes,
        optionIds: line.optionIds,
      );

  Map<String, dynamic> toJson() => {
        'menuItemId': menuItemId,
        'quantity': quantity,
        if (notes != null && notes!.isNotEmpty) 'notes': notes,
        'optionIds': optionIds,
      };
}

/// صفحة من الطلبات (GET /orders).
class OrdersPage {
  const OrdersPage({
    required this.orders,
    required this.total,
    required this.page,
    required this.pageSize,
  });

  final List<Order> orders;
  final int total;
  final int page;
  final int pageSize;

  bool get hasMore => page * pageSize < total;
}

/// نتيجة «اطلب تاني» — أصناف الطلب القديم مع علامة المتوفر منها.
class ReorderDraft {
  const ReorderDraft({required this.branchId, required this.items});

  final String branchId;
  final List<ReorderItem> items;

  /// الأصناف اللي لسه متوفرة بس.
  List<ReorderItem> get availableItems => [
        for (final i in items)
          if (!i.unavailable) i
      ];
  bool get hasUnavailable => items.any((i) => i.unavailable);

  factory ReorderDraft.fromJson(Map<String, dynamic> json) => ReorderDraft(
        branchId: (json['branchId'] as String?) ?? '',
        items: [
          for (final raw in (json['items'] as List<dynamic>? ?? const []))
            ReorderItem.fromJson(raw as Map<String, dynamic>),
        ],
      );
}

class ReorderItem {
  const ReorderItem({
    required this.menuItemId,
    required this.quantity,
    this.notes,
    this.optionIds = const [],
    this.unavailable = false,
  });

  final String menuItemId;
  final int quantity;
  final String? notes;
  final List<String> optionIds;
  final bool unavailable;

  factory ReorderItem.fromJson(Map<String, dynamic> json) => ReorderItem(
        menuItemId: (json['menuItemId'] as String?) ?? '',
        quantity: (json['quantity'] as num?)?.toInt() ?? 1,
        notes: json['notes'] as String?,
        optionIds: [
          for (final id in (json['optionIds'] as List<dynamic>? ?? const [])) id as String,
        ],
        unavailable: json['unavailable'] as bool? ?? false,
      );

  OrderItemInput toInput() => OrderItemInput(
        menuItemId: menuItemId,
        quantity: quantity,
        notes: notes,
        optionIds: optionIds,
      );
}

/// ترتيب نتائج المطاعم.
enum BranchSort {
  nearest('nearest'),
  fastest('fastest'),
  topRated('top_rated');

  const BranchSort(this.wire);
  final String wire;
}

// ─────────────────────────── الدخول ───────────────────────────

class AuthRepository {
  AuthRepository(this._api);

  final ApiClient _api;

  /// POST /auth/otp/request
  Future<OtpChallenge> requestOtp(String phone) async {
    final res = await _api.post<Map<String, dynamic>>(
      '/auth/otp/request',
      body: {'phone': phone},
    );
    return (
      expiresInSeconds: (res['expiresInSeconds'] as num?)?.toInt() ?? 300,
      devCode: res['devCode'] as String?,
    );
  }

  /// POST /auth/otp/verify — [fullName] إلزامي أول مرة الرقم بيدخل.
  /// التوكن بيتحفظ في TokenStore هنا علطول.
  Future<AuthSession> verifyOtp({
    required String phone,
    required String code,
    String? fullName,
  }) async {
    final res = await _api.post<Map<String, dynamic>>(
      '/auth/otp/verify',
      body: {
        'phone': phone,
        'code': code,
        'role': 'CUSTOMER',
        if (fullName != null && fullName.isNotEmpty) 'fullName': fullName,
      },
    );
    final session = AuthSession.fromJson(res);
    await _api.tokens.save(access: session.accessToken, refresh: session.refreshToken);
    return session;
  }

  bool get isLoggedIn => _api.tokens.isLoggedIn;

  Future<void> logout() => _api.tokens.clear();
}

// ─────────────────────────── العميل ───────────────────────────

class CustomerRepository {
  CustomerRepository(this._api);

  final ApiClient _api;

  // ── الحساب ──

  /// GET /customer/me
  Future<CustomerProfile> me() async =>
      CustomerProfile.fromJson(await _api.get<Map<String, dynamic>>('/customer/me'));

  /// PATCH /customer/me
  Future<CustomerProfile> updateMe({String? fullName, String? email}) async =>
      CustomerProfile.fromJson(
        await _api.patch<Map<String, dynamic>>(
          '/customer/me',
          body: {
            if (fullName != null) 'fullName': fullName,
            if (email != null) 'email': email,
          },
        ),
      );

  // ── العناوين ──

  /// GET /customer/addresses
  Future<List<Address>> addresses() async {
    final res = await _api.get<List<dynamic>>('/customer/addresses');
    return [for (final raw in res) Address.fromJson(raw as Map<String, dynamic>)];
  }

  /// POST /customer/addresses
  Future<Address> createAddress({
    required String label,
    required String city,
    required double lat,
    required double lng,
    String? district,
    String? street,
    String? building,
    String? notes,
    bool isDefault = false,
  }) async =>
      Address.fromJson(
        await _api.post<Map<String, dynamic>>(
          '/customer/addresses',
          body: {
            'label': label,
            'city': city,
            if (district != null) 'district': district,
            if (street != null) 'street': street,
            if (building != null) 'building': building,
            if (notes != null) 'notes': notes,
            'lat': lat,
            'lng': lng,
            'isDefault': isDefault,
          },
        ),
      );

  /// نفس [createAddress] بس من موديل جاهز (شاشة إضافة عنوان).
  Future<Address> createAddressFrom(Address address) async => Address.fromJson(
        await _api.post<Map<String, dynamic>>(
          '/customer/addresses',
          body: address.toJson(),
        ),
      );

  /// PATCH /customer/addresses/:id
  Future<Address> updateAddress(
    String id, {
    String? label,
    String? city,
    String? district,
    String? street,
    String? building,
    String? notes,
    double? lat,
    double? lng,
    bool? isDefault,
  }) async =>
      Address.fromJson(
        await _api.patch<Map<String, dynamic>>(
          '/customer/addresses/$id',
          body: {
            if (label != null) 'label': label,
            if (city != null) 'city': city,
            if (district != null) 'district': district,
            if (street != null) 'street': street,
            if (building != null) 'building': building,
            if (notes != null) 'notes': notes,
            if (lat != null) 'lat': lat,
            if (lng != null) 'lng': lng,
            if (isDefault != null) 'isDefault': isDefault,
          },
        ),
      );

  /// نفس [updateAddress] بس من موديل جاهز (شاشة تعديل عنوان).
  Future<Address> updateAddressFrom(Address address) async => Address.fromJson(
        await _api.patch<Map<String, dynamic>>(
          '/customer/addresses/${address.id}',
          body: address.toJson(),
        ),
      );

  /// DELETE /customer/addresses/:id
  Future<void> deleteAddress(String id) => _api.delete<dynamic>('/customer/addresses/$id');

  /// PATCH /customer/addresses/:id/default
  Future<void> setDefaultAddress(String id) =>
      _api.patch<dynamic>('/customer/addresses/$id/default');

  // ── المطاعم (الفروع) ──

  /// GET /customer/branches — الترتيب الافتراضي: الأقرب.
  Future<List<Restaurant>> branches({
    double? lat,
    double? lng,
    double? radiusKm,
    String? q,
    BranchSort? sort,
  }) async {
    final res = await _api.get<List<dynamic>>(
      '/customer/branches',
      query: {
        if (lat != null) 'lat': lat,
        if (lng != null) 'lng': lng,
        if (radiusKm != null) 'radiusKm': radiusKm,
        if (q != null && q.isNotEmpty) 'q': q,
        if (sort != null) 'sort': sort.wire,
      },
    );
    return [for (final raw in res) Restaurant.fromJson(raw as Map<String, dynamic>)];
  }

  /// GET /customer/branches/:id — تفاصيل الفرع (بدون المنيو).
  Future<Restaurant> branch(String branchId) async =>
      Restaurant.fromJson(await _api.get<Map<String, dynamic>>('/customer/branches/$branchId'));

  /// GET /customer/branches/:id/menu
  Future<List<MenuSection>> menu(String branchId) async {
    final res = await _api.get<List<dynamic>>('/customer/branches/$branchId/menu');
    return [
      for (final raw in res)
        MenuSection.fromJson(raw as Map<String, dynamic>, restaurantId: branchId),
    ];
  }

  /// تفاصيل الفرع + المنيو في موديل واحد (اللي شاشة المطعم محتاجاه).
  Future<Restaurant> branchWithMenu(String branchId) async {
    final results = await Future.wait([branch(branchId), menu(branchId)]);
    final details = results[0] as Restaurant;
    final sections = results[1] as List<MenuSection>;
    return details.copyWith(sections: sections);
  }

  // ── المفضلة ──

  /// GET /customer/favorites
  Future<List<Restaurant>> favorites({double? lat, double? lng}) async {
    final res = await _api.get<List<dynamic>>(
      '/customer/favorites',
      query: {
        if (lat != null) 'lat': lat,
        if (lng != null) 'lng': lng,
      },
    );
    return [for (final raw in res) Restaurant.fromJson(raw as Map<String, dynamic>)];
  }

  /// POST/DELETE /customer/favorites/:branchId
  Future<void> toggleFavorite(String branchId, bool isFavorite) => isFavorite
      ? _api.post<dynamic>('/customer/favorites/$branchId')
      : _api.delete<dynamic>('/customer/favorites/$branchId');

  // ── الكوبونات ──

  /// GET /customer/coupons
  Future<List<Coupon>> coupons() async {
    final res = await _api.get<List<dynamic>>('/customer/coupons');
    return [for (final raw in res) Coupon.fromJson(raw as Map<String, dynamic>)];
  }

  /// POST /customer/coupons/validate — بيرمي ApiException برسالة عربية لو الكوبون مش صالح.
  Future<CouponValidation> validateCoupon(String code, double subtotal) async =>
      CouponValidation.fromJson(
        await _api.post<Map<String, dynamic>>(
          '/customer/coupons/validate',
          body: {'code': code, 'subtotal': subtotal},
        ),
      );
}

// ─────────────────────────── الطلبات ───────────────────────────

class OrdersRepository {
  OrdersRepository(this._api);

  final ApiClient _api;

  /// POST /orders — [restaurantName]/[restaurantImageUrl] بيتحطوا في الموديل الراجع
  /// لأن الـ API مابيرجعش صور مع الطلب.
  Future<Order> create({
    required String branchId,
    required String addressId,
    required String paymentMethod,
    required List<OrderItemInput> items,
    String? couponCode,
    String? customerNotes,
    String? restaurantName,
    String? restaurantImageUrl,
  }) async {
    final res = await _api.post<Map<String, dynamic>>(
      '/orders',
      body: {
        'branchId': branchId,
        'addressId': addressId,
        'paymentMethod': paymentMethod,
        if (couponCode != null && couponCode.isNotEmpty) 'couponCode': couponCode,
        if (customerNotes != null && customerNotes.isNotEmpty) 'customerNotes': customerNotes,
        'items': [for (final item in items) item.toJson()],
      },
    );
    return Order.fromJson(
      res,
      restaurantName: restaurantName,
      restaurantImageUrl: restaurantImageUrl,
    );
  }

  /// GET /orders — التوكن بيحصرها على طلبات العميل نفسه.
  Future<OrdersPage> list({
    int page = 1,
    int pageSize = 20,
    List<OrderStatus> statuses = const [],
  }) async {
    final res = await _api.get<Map<String, dynamic>>(
      '/orders',
      query: {
        'page': page,
        'pageSize': pageSize,
        // الـ API بيقبل مصفوفة بس: status[]=PENDING&status[]=...
        if (statuses.isNotEmpty) 'status[]': [for (final s in statuses) s.wire],
      },
    );
    return OrdersPage(
      orders: [
        for (final raw in (res['data'] as List<dynamic>? ?? const []))
          Order.fromJson(raw as Map<String, dynamic>),
      ],
      total: (res['total'] as num?)?.toInt() ?? 0,
      page: (res['page'] as num?)?.toInt() ?? page,
      pageSize: (res['pageSize'] as num?)?.toInt() ?? pageSize,
    );
  }

  /// GET /orders/:id
  Future<Order> byId(String id, {String? restaurantName, String? restaurantImageUrl}) async =>
      Order.fromJson(
        await _api.get<Map<String, dynamic>>('/orders/$id'),
        restaurantName: restaurantName,
        restaurantImageUrl: restaurantImageUrl,
      );

  /// PATCH /orders/:id/cancel — مسموح وهو PENDING بس.
  Future<Order> cancel(String id, {String? reason}) async => Order.fromJson(
        await _api.patch<Map<String, dynamic>>(
          '/orders/$id/cancel',
          body: {if (reason != null && reason.isNotEmpty) 'reason': reason},
        ),
      );

  /// POST /orders/:id/review
  Future<void> review(
    String id, {
    required int stars,
    int? captainStars,
    String? comment,
  }) =>
      _api.post<dynamic>(
        '/orders/$id/review',
        body: {
          'restaurantStars': stars,
          if (captainStars != null) 'captainStars': captainStars,
          if (comment != null && comment.isNotEmpty) 'comment': comment,
        },
      );

  /// GET /orders/:id/reorder
  Future<ReorderDraft> reorder(String id) async =>
      ReorderDraft.fromJson(await _api.get<Map<String, dynamic>>('/orders/$id/reorder'));
}

// ─────────────────────────── الدعم (التذاكر) ───────────────────────────

class SupportRepository {
  SupportRepository(this._api);

  final ApiClient _api;

  /// GET /support/tickets/mine — التوكن بيحصرها على تذاكر العميل نفسه.
  Future<List<SupportTicket>> myTickets() async {
    final res = await _api.get<List<dynamic>>('/support/tickets/mine');
    return [for (final raw in res) SupportTicket.fromJson(raw as Map<String, dynamic>)];
  }

  /// GET /support/tickets/:id — التفاصيل + الرسائل (غير الداخلية بس).
  Future<SupportTicket> ticketDetail(String id) async =>
      SupportTicket.fromJson(await _api.get<Map<String, dynamic>>('/support/tickets/$id'));

  /// POST /support/tickets — فتح تذكرة جديدة (بترجّع تفاصيلها).
  Future<SupportTicket> raiseTicket({
    required String subject,
    required TicketCategory category,
    required String body,
    String? orderId,
  }) async =>
      SupportTicket.fromJson(
        await _api.post<Map<String, dynamic>>(
          '/support/tickets',
          body: {
            'subject': subject,
            'category': category.wire,
            'body': body,
            if (orderId != null && orderId.isNotEmpty) 'orderId': orderId,
          },
        ),
      );

  /// POST /support/tickets/:id/messages — رد العميل (بيرجّع الحالة لـ OPEN).
  Future<SupportTicket> replyTicket(String id, String body) async =>
      SupportTicket.fromJson(
        await _api.post<Map<String, dynamic>>(
          '/support/tickets/$id/messages',
          body: {'body': body},
        ),
      );
}

// ─────────────────────────── البروڤايدرز ───────────────────────────

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(ref.watch(apiClientProvider)),
);

final customerRepositoryProvider = Provider<CustomerRepository>(
  (ref) => CustomerRepository(ref.watch(apiClientProvider)),
);

final ordersRepositoryProvider = Provider<OrdersRepository>(
  (ref) => OrdersRepository(ref.watch(apiClientProvider)),
);

final supportRepositoryProvider = Provider<SupportRepository>(
  (ref) => SupportRepository(ref.watch(apiClientProvider)),
);
