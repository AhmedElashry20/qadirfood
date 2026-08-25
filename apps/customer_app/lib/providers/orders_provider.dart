// طلباتي — من الـ API (GET /orders). التبويبات بتترشّح من نفس القائمة.
// كل الأخطاء بتطلع كـ ApiException برسالتها العربية (إلغاء طلب مش PENDING مثلاً).
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/enums.dart';
import '../data/api_repository.dart';
import '../models/order.dart';

class OrdersNotifier extends AsyncNotifier<List<Order>> {
  @override
  Future<List<Order>> build() => _fetch();

  Future<List<Order>> _fetch() async =>
      (await ref.read(ordersRepositoryProvider).list(pageSize: 50)).orders;

  /// سحب لأسفل للتحديث — بيحافظ على القائمة القديمة لحد ما الجديدة توصل.
  Future<void> refresh() async {
    state = await AsyncValue.guard(_fetch);
  }

  /// PATCH /orders/:id/cancel — مسموح وهو PENDING بس، وإلا ApiException برسالة السيرفر.
  Future<Order> cancel(String id, {String? reason}) async {
    final updated = await ref.read(ordersRepositoryProvider).cancel(id, reason: reason);

    final current = state.value;
    if (current != null) {
      state = AsyncData([for (final o in current) o.id == id ? updated : o]);
    }
    ref.invalidate(orderProvider(id));
    return updated;
  }

  /// POST /orders/:id/review — تقييم المطعم (و الكابتن اختيارياً) ثم إعادة التحميل.
  Future<void> rate(String id, int stars, {int? captainStars, String? comment}) async {
    await ref.read(ordersRepositoryProvider).review(
          id,
          stars: stars,
          captainStars: captainStars,
          comment: comment,
        );
    ref.invalidate(orderProvider(id));
    await refresh();
  }

  /// GET /orders/:id/reorder — مسوّدة أصناف الطلب القديم (فيها اللي بقى مش متوفر).
  /// الشاشة بتحوّلها لسلة بعد ما تجيب المنيو (ReorderItem فيه menuItemId بس).
  Future<ReorderDraft> reorder(String id) => ref.read(ordersRepositoryProvider).reorder(id);
}

final ordersProvider = AsyncNotifierProvider<OrdersNotifier, List<Order>>(OrdersNotifier.new);

/// تبويبات شاشة «طلباتي».
enum OrdersTab {
  current('الحالي'),
  done('تم التنفيذ'),
  cancelled('الملغية');

  const OrdersTab(this.ar);
  final String ar;
}

/// الطلبات المرشّحة للتبويب — فاضية أثناء التحميل (الشاشة بتعرض حالة التحميل
/// من `ordersProvider` نفسه).
final ordersByTabProvider = Provider.family<List<Order>, OrdersTab>((ref, tab) {
  final orders = ref.watch(ordersProvider).value ?? const <Order>[];
  return switch (tab) {
    OrdersTab.current => orders.where((o) => o.status.isActive).toList(),
    OrdersTab.done => orders.where((o) => o.status == OrderStatus.delivered).toList(),
    OrdersTab.cancelled => orders.where((o) => o.status.isCancelledOrRejected).toList(),
  };
});

/// طلب واحد بالتفصيل (GET /orders/:id) — بيشتغل حتى لو القائمة لسه ماحمّلتش
/// (رابط عميق أو رجوع من شاشة النجاح).
final orderProvider = FutureProvider.family<Order, String>(
  (ref, id) => ref.watch(ordersRepositoryProvider).byId(id),
);

/// أحدث طلب شغّال — يظهر كبانر «تتبع الطلب» في الرئيسية والدعم.
final activeOrderProvider = Provider<Order?>((ref) {
  final orders = ref.watch(ordersProvider).value ?? const <Order>[];
  for (final order in orders) {
    if (order.status.isActive) return order;
  }
  return null;
});
