// طبقة رقيقة فوق ApiClient — بترجّع موديلات التطبيق جاهزة للبروڤايدرز.
// كل الأخطاء بتطلع منها كـ ApiException برسالتها العربية من السيرفر.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api_client.dart';
import '../core/enums.dart';
import '../core/format.dart';
import '../models/branch.dart';
import '../models/menu_item.dart';
import '../models/order.dart';
import '../models/report.dart';

// ─────────────────────────── أنواع مساعدة ───────────────────────────

/// جلسة المطعم بعد الدخول — التوكن + الفرع اللي التوكن مربوط بيه.
class MerchantSession {
  const MerchantSession({
    required this.accessToken,
    required this.refreshToken,
    required this.userId,
    required this.fullName,
    required this.phone,
    this.email,
    this.avatarUrl,
    this.branchId,
  });

  final String accessToken;
  final String refreshToken;
  final String userId;
  final String fullName;
  final String phone;
  final String? email;
  final String? avatarUrl;

  /// بيرجع null لحساب الأدمن بس — حساب المطعم دايماً مربوط بفرع.
  final String? branchId;

  factory MerchantSession.fromJson(Map<String, dynamic> json) {
    final user = (json['user'] as Map<String, dynamic>?) ?? const {};
    return MerchantSession(
      accessToken: asText(json['accessToken']),
      refreshToken: asText(json['refreshToken']),
      userId: asText(user['id']),
      fullName: asText(user['fullName']),
      phone: asText(user['phone']),
      email: user['email'] as String?,
      avatarUrl: user['avatarUrl'] as String?,
      branchId: json['branchId'] as String?,
    );
  }
}

/// فرع في قائمة الاختيار لما الحساب مربوط بأكتر من فرع.
class BranchOption {
  const BranchOption({
    required this.id,
    required this.nameAr,
    required this.city,
    required this.role,
  });

  final String id;
  final String nameAr;
  final String city;

  /// BRANCH_MANAGER / CASHIER.
  final String role;

  factory BranchOption.fromJson(Map<String, dynamic> json) => BranchOption(
        id: asText(json['id']),
        nameAr: asText(json['nameAr']),
        city: asText(json['city']),
        role: asText(json['role'], 'CASHIER'),
      );
}

/// نتيجة POST /auth/login — إمّا جلسة كاملة، وإمّا قائمة فروع للاختيار.
sealed class LoginResult {
  const LoginResult();
}

class LoginSuccess extends LoginResult {
  const LoginSuccess(this.session);
  final MerchantSession session;
}

class LoginNeedsBranch extends LoginResult {
  const LoginNeedsBranch(this.branches);
  final List<BranchOption> branches;
}

/// صفحة من سجل الطلبات (GET /orders).
typedef OrdersPage = ({
  List<MerchantOrder> orders,
  int total,
  int page,
  int pageSize,
});

/// اختيار جوّه مجموعة عند إنشاء صنف جديد.
class MenuOptionInput {
  const MenuOptionInput({
    required this.nameAr,
    required this.nameEn,
    this.extraPrice = 0,
  });

  final String nameAr;
  final String nameEn;
  final double extraPrice;

  Map<String, dynamic> toJson() => {
        'nameAr': nameAr,
        'nameEn': nameEn,
        'extraPrice': extraPrice,
      };
}

/// مجموعة خيارات عند إنشاء صنف جديد — [type] لازم يكون SINGLE أو MULTI.
class MenuOptionGroupInput {
  const MenuOptionGroupInput({
    required this.nameAr,
    required this.nameEn,
    required this.options,
    this.type = 'SINGLE',
    this.isRequired = false,
    this.minSelect = 0,
    this.maxSelect = 1,
  });

  final String nameAr;
  final String nameEn;
  final String type;
  final bool isRequired;
  final int minSelect;
  final int maxSelect;
  final List<MenuOptionInput> options;

  Map<String, dynamic> toJson() => {
        'nameAr': nameAr,
        'nameEn': nameEn,
        'type': type,
        'isRequired': isRequired,
        'minSelect': minSelect,
        'maxSelect': maxSelect,
        'options': [for (final option in options) option.toJson()],
      };
}

/// مدى التقرير في GET /reports/merchant.
enum ReportRange {
  today('today', 'اليوم'),
  week('week', 'آخر ٧ أيام'),
  month('month', 'آخر شهر');

  const ReportRange(this.wire, this.ar);
  final String wire;
  final String ar;
}

// ─────────────────────────── الدخول ───────────────────────────

class AuthRepository {
  AuthRepository(this._api);

  final ApiClient _api;

  /// POST /auth/login — بالإيميل أو رقم الموبايل.
  /// لو الحساب على أكتر من فرع والـ [branchId] فاضي، السيرفر بيرجّع الفروع
  /// من غير توكن ([LoginNeedsBranch])، وبنعيد النداء ومعانا الفرع المختار.
  /// التوكن بيتحفظ في TokenStore هنا علطول لما الدخول ينجح.
  Future<LoginResult> login({
    required String identifier,
    required String password,
    String? branchId,
  }) async {
    final res = await _api.post<Map<String, dynamic>>(
      '/auth/login',
      body: {
        'identifier': identifier,
        'password': password,
        if (branchId != null && branchId.isNotEmpty) 'branchId': branchId,
      },
    );

    if (res['requiresBranchSelection'] == true) {
      return LoginNeedsBranch([
        for (final raw in (res['branches'] as List<dynamic>? ?? const []))
          BranchOption.fromJson(raw as Map<String, dynamic>),
      ]);
    }

    final session = MerchantSession.fromJson(res);
    await _api.tokens.save(access: session.accessToken, refresh: session.refreshToken);
    return LoginSuccess(session);
  }

  bool get isLoggedIn => _api.tokens.isLoggedIn;

  Future<void> logout() => _api.tokens.clear();
}

// ─────────────────────────── الطلبات ───────────────────────────

class OrdersRepository {
  OrdersRepository(this._api);

  final ApiClient _api;

  /// GET /orders/incoming — الطلبات الجديدة (PENDING) للفرع اللي في التوكن.
  Future<List<MerchantOrder>> incoming() => _list('/orders/incoming');

  /// GET /orders/active — من القبول لحد ما الكابتن يستلم.
  /// ملاحظة: السيرفر بيرجّع PICKED_UP كمان مع ACCEPTED/PREPARING/READY/CAPTAIN_ASSIGNED.
  Future<List<MerchantOrder>> active() => _list('/orders/active');

  Future<List<MerchantOrder>> _list(String path) async {
    final res = await _api.get<List<dynamic>>(path);
    return [
      for (final raw in res) MerchantOrder.fromJson(raw as Map<String, dynamic>),
    ];
  }

  /// GET /orders — السجل، محصور تلقائياً على فرع المطعم.
  Future<OrdersPage> history({
    int page = 1,
    int pageSize = 20,
    List<OrderStatus> statuses = const [],
    DateTime? from,
    DateTime? to,
  }) async {
    final res = await _api.get<Map<String, dynamic>>(
      '/orders',
      query: {
        'page': page,
        'pageSize': pageSize,
        // الـ API بيقبل مصفوفة بس: status[]=DELIVERED&status[]=…
        if (statuses.isNotEmpty) 'status[]': [for (final s in statuses) s.wire],
        if (from != null) 'from': from.toIso8601String(),
        if (to != null) 'to': to.toIso8601String(),
      },
    );

    return (
      orders: [
        for (final raw in (res['data'] as List<dynamic>? ?? const []))
          MerchantOrder.fromJson(raw as Map<String, dynamic>),
      ],
      total: asInt(res['total']),
      page: asInt(res['page'], page),
      pageSize: asInt(res['pageSize'], pageSize),
    );
  }

  /// GET /orders/:id
  Future<MerchantOrder> byId(String id) async =>
      MerchantOrder.fromJson(await _api.get<Map<String, dynamic>>('/orders/$id'));

  /// PATCH /orders/:id/accept — [prepMinutes] بين ١ و ١٨٠ دقيقة.
  /// في وضع «مشغول» السيرفر بيزوّد busyExtraMinutes فوق الرقم ده تلقائياً.
  Future<MerchantOrder> accept(String id, int prepMinutes) async => MerchantOrder.fromJson(
        await _api.patch<Map<String, dynamic>>(
          '/orders/$id/accept',
          body: {'prepMinutes': prepMinutes},
        ),
      );

  /// PATCH /orders/:id/reject — السبب إلزامي (من kRejectReasons).
  Future<MerchantOrder> reject(String id, String reason) async => MerchantOrder.fromJson(
        await _api.patch<Map<String, dynamic>>(
          '/orders/$id/reject',
          body: {'reason': reason},
        ),
      );

  /// PATCH /orders/:id/preparing
  Future<MerchantOrder> markPreparing(String id) async => MerchantOrder.fromJson(
        await _api.patch<Map<String, dynamic>>('/orders/$id/preparing'),
      );

  /// PATCH /orders/:id/ready — بيشغّل البحث عن كابتن.
  Future<MerchantOrder> markReady(String id) async => MerchantOrder.fromJson(
        await _api.patch<Map<String, dynamic>>('/orders/$id/ready'),
      );
}

// ─────────────────────────── الفرع ───────────────────────────

class BranchRepository {
  BranchRepository(this._api);

  final ApiClient _api;

  /// GET /restaurants/branches/:id — الفرع كامل + المطعم + أوقات العمل + الإحداثيات.
  Future<Branch> current(String branchId) async =>
      Branch.fromJson(await _api.get<Map<String, dynamic>>('/restaurants/branches/$branchId'));

  /// PATCH /restaurants/branch/status — [busyExtraMinutes] إلزامي فعلياً مع BUSY
  /// ولازم يكون بين ١٥ و ٣٠، وبيتجاهل في باقي الحالات.
  /// الرد صف الفرع بس (من غير المطعم ولا أوقات العمل ولا lat/lng).
  Future<Branch> setStatus(BranchStatus status, {int? busyExtraMinutes}) async => Branch.fromJson(
        await _api.patch<Map<String, dynamic>>(
          '/restaurants/branch/status',
          body: {
            'status': status.wire,
            if (status == BranchStatus.busy) 'busyExtraMinutes': busyExtraMinutes ?? 15,
          },
        ),
      );

  /// GET /restaurants/branch/working-hours
  Future<List<WorkingHour>> workingHours() async {
    final res = await _api.get<List<dynamic>>('/restaurants/branch/working-hours');
    return [for (final raw in res) WorkingHour.fromJson(raw as Map<String, dynamic>)];
  }

  /// PATCH /restaurants/branch/working-hours — بيستبدل الجدول كله مرة واحدة،
  /// فلازم نبعت كل الفترات مش المعدّلة بس.
  Future<List<WorkingHour>> saveWorkingHours(List<WorkingHour> hours) async {
    final res = await _api.patch<List<dynamic>>(
      '/restaurants/branch/working-hours',
      body: {
        'hours': [for (final hour in hours) hour.toJson()]
      },
    );
    return [for (final raw in res) WorkingHour.fromJson(raw as Map<String, dynamic>)];
  }

  /// GET /restaurants/branch/users — الكاشيرات ومديري الفرع.
  Future<List<BranchUser>> users() async {
    final res = await _api.get<List<dynamic>>('/restaurants/branch/users');
    return [for (final raw in res) BranchUser.fromJson(raw as Map<String, dynamic>)];
  }
}

// ─────────────────────────── المنيو ───────────────────────────

class MenuRepository {
  MenuRepository(this._api);

  final ApiClient _api;

  /// GET /menu/categories — التصنيفات مرتّبة، وجوّه كل واحد أصنافه بخياراتها.
  Future<List<MenuCategory>> categories() async {
    final res = await _api.get<List<dynamic>>('/menu/categories');
    return [for (final raw in res) MenuCategory.fromJson(raw as Map<String, dynamic>)];
  }

  /// POST /menu/categories
  Future<MenuCategory> createCategory(String nameAr, String nameEn) async => MenuCategory.fromJson(
        await _api.post<Map<String, dynamic>>(
          '/menu/categories',
          body: {'nameAr': nameAr, 'nameEn': nameEn},
        ),
      );

  /// PATCH /menu/categories/reorder — بنبعت الترتيب الجديد كامل،
  /// والرد هو المنيو بعد الترتيب.
  Future<List<MenuCategory>> reorderCategories(List<String> orderedIds) async {
    final res = await _api.patch<List<dynamic>>(
      '/menu/categories/reorder',
      body: {'orderedIds': orderedIds},
    );
    return [for (final raw in res) MenuCategory.fromJson(raw as Map<String, dynamic>)];
  }

  /// PATCH /menu/categories/:id/items/reorder — من غير رد.
  Future<void> reorderItems(String categoryId, List<String> orderedIds) => _api.patch<dynamic>(
        '/menu/categories/$categoryId/items/reorder',
        body: {'orderedIds': orderedIds},
      );

  /// POST /menu/items — [branchId] فاضي معناه الصنف متاح في كل الفروع.
  Future<MerchantMenuItem> createItem({
    required String categoryId,
    required String nameAr,
    required String nameEn,
    required double price,
    String? branchId,
    String? descriptionAr,
    String? descriptionEn,
    String? imageUrl,
    int? calories,
    List<MenuOptionGroupInput> optionGroups = const [],
  }) async =>
      MerchantMenuItem.fromJson(
        await _api.post<Map<String, dynamic>>(
          '/menu/items',
          body: {
            'categoryId': categoryId,
            'nameAr': nameAr,
            'nameEn': nameEn,
            'price': price,
            if (branchId != null && branchId.isNotEmpty) 'branchId': branchId,
            if (descriptionAr != null) 'descriptionAr': descriptionAr,
            if (descriptionEn != null) 'descriptionEn': descriptionEn,
            if (imageUrl != null) 'imageUrl': imageUrl,
            if (calories != null) 'calories': calories,
            if (optionGroups.isNotEmpty)
              'optionGroups': [for (final group in optionGroups) group.toJson()],
          },
        ),
      );

  /// PATCH /menu/items/:id — تعديل جزئي؛ [changes] بتتبعت زي ما هي.
  /// الرد مافيهوش optionGroups (السيرفر مابيعملهاش include هنا).
  Future<MerchantMenuItem> updateItem(String id, Map<String, dynamic> changes) async =>
      MerchantMenuItem.fromJson(
        await _api.patch<Map<String, dynamic>>('/menu/items/$id', body: changes),
      );

  /// DELETE /menu/items/:id
  Future<void> deleteItem(String id) => _api.delete<dynamic>('/menu/items/$id');

  /// PATCH /menu/items/availability — إيقاف/إتاحة صنف أو مجموعة أصناف.
  /// OUT_OF_STOCK_TODAY بيرجع AVAILABLE تلقائياً ٤ الفجر.
  Future<void> setAvailability(List<String> itemIds, ItemAvailability availability) =>
      _api.patch<dynamic>(
        '/menu/items/availability',
        body: {'itemIds': itemIds, 'availability': availability.wire},
      );

  /// GET /menu/items/search?q= — أقصى ٥٠ نتيجة، والسيرفر بيرمي خطأ لو النص فاضي.
  Future<List<MerchantMenuItem>> search(String query) async {
    final res = await _api.get<List<dynamic>>('/menu/items/search', query: {'q': query});
    return [for (final raw in res) MerchantMenuItem.fromJson(raw as Map<String, dynamic>)];
  }
}

// ─────────────────────────── التقارير ───────────────────────────

class ReportsRepository {
  ReportsRepository(this._api);

  final ApiClient _api;

  /// GET /reports/merchant?range=today|week|month
  Future<MerchantReport> merchant([ReportRange range = ReportRange.today]) async =>
      MerchantReport.fromJson(
        await _api.get<Map<String, dynamic>>(
          '/reports/merchant',
          query: {'range': range.wire},
        ),
      );
}

// ─────────────────────────── البروڤايدرز ───────────────────────────

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(ref.watch(apiClientProvider)),
);

final ordersRepositoryProvider = Provider<OrdersRepository>(
  (ref) => OrdersRepository(ref.watch(apiClientProvider)),
);

final branchRepositoryProvider = Provider<BranchRepository>(
  (ref) => BranchRepository(ref.watch(apiClientProvider)),
);

final menuRepositoryProvider = Provider<MenuRepository>(
  (ref) => MenuRepository(ref.watch(apiClientProvider)),
);

final reportsRepositoryProvider = Provider<ReportsRepository>(
  (ref) => ReportsRepository(ref.watch(apiClientProvider)),
);
