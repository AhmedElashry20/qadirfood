// الطلبات — بيستقبل order:new من السوكيت ويحدّث القائمة لحظياً.
//
// ده الملف الوحيد اللي بيربط أحداث السوكيت بإبطال البروڤايدرز: `socketRefreshProvider`.
// أي شاشة عايزة تحديث لحظي بتعمل `ref.watch(socketRefreshProvider)` وخلاص —
// ممنوع الاشتراك في الـ streams جوّه الشاشات عشان مانكررش الاشتراك.
import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/enums.dart';
import '../core/socket_service.dart';
import '../data/merchant_repository.dart';
import '../models/order.dart';

// ────────────────────────── الطلبات الواردة ──────────────────────────

/// الطلبات الجديدة (PENDING) — قلب التطبيق، وعليها بيتعلّق صوت التنبيه.
final incomingOrdersProvider = AsyncNotifierProvider<IncomingOrdersNotifier, List<MerchantOrder>>(
  IncomingOrdersNotifier.new,
);

class IncomingOrdersNotifier extends AsyncNotifier<List<MerchantOrder>> {
  @override
  Future<List<MerchantOrder>> build() => ref.watch(ordersRepositoryProvider).incoming();

  /// إعادة جلب من غير ما نرجّع الشاشة لحالة التحميل الكاملة.
  Future<void> refresh() async {
    state = await AsyncValue.guard(() => ref.read(ordersRepositoryProvider).incoming());
  }

  /// قبول الطلب بوقت تحضير — بيرمي ApiException زي ما هي عشان الشاشة تعرض رسالتها.
  Future<void> accept(String id, int prepMinutes) async {
    await ref.read(ordersRepositoryProvider).accept(id, prepMinutes);
    _dropLocally(id); // شيله فوراً عشان صوت التنبيه يقف من غير انتظار الشبكة.
    await _syncBoth();
  }

  /// رفض الطلب بسبب إلزامي.
  Future<void> reject(String id, String reason) async {
    await ref.read(ordersRepositoryProvider).reject(id, reason);
    _dropLocally(id);
    await _syncBoth();
  }

  void _dropLocally(String id) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData([
      for (final order in current)
        if (order.id != id) order,
    ]);
  }

  /// بعد أي قبول/رفض القائمتين بيتغيّروا مع بعض.
  Future<void> _syncBoth() async {
    await refresh();
    await ref.read(activeOrdersProvider.notifier).refresh();
  }
}

// ─────────────────────────── الطلبات الجارية ───────────────────────────

/// من القبول لحد ما الكابتن يستلم.
final activeOrdersProvider = AsyncNotifierProvider<ActiveOrdersNotifier, List<MerchantOrder>>(
  ActiveOrdersNotifier.new,
);

class ActiveOrdersNotifier extends AsyncNotifier<List<MerchantOrder>> {
  @override
  Future<List<MerchantOrder>> build() => ref.watch(ordersRepositoryProvider).active();

  Future<void> refresh() async {
    state = await AsyncValue.guard(() => ref.read(ordersRepositoryProvider).active());
  }

  Future<void> markPreparing(String id) async {
    await ref.read(ordersRepositoryProvider).markPreparing(id);
    ref.invalidate(orderProvider(id));
    await refresh();
  }

  Future<void> markReady(String id) async {
    await ref.read(ordersRepositoryProvider).markReady(id);
    ref.invalidate(orderProvider(id));
    await refresh();
  }
}

// ─────────────────────────── طلب واحد ───────────────────────────

/// تفاصيل طلب بالـ id — شاشة «جاهز للاستلام» بتستخدمها.
final orderProvider = FutureProvider.family<MerchantOrder, String>(
  (ref, id) => ref.watch(ordersRepositoryProvider).byId(id),
);

// ─────────────────────────── السجل ───────────────────────────

/// فلاتر شاشة «سجل الطلبات» — كل واحد بيحدّد المدة والحالات.
enum HistoryFilter {
  today('اليوم'),
  week('الأسبوع'),
  cancelled('الملغية');

  const HistoryFilter(this.label);

  final String label;

  /// بداية المدة — «الملغية» مالهاش حد زمني (كل الملغي).
  DateTime? get from {
    final now = DateTime.now();
    return switch (this) {
      HistoryFilter.today => DateTime(now.year, now.month, now.day),
      HistoryFilter.week => now.subtract(const Duration(days: 7)),
      HistoryFilter.cancelled => null,
    };
  }

  /// «اليوم» و«الأسبوع» بيعرضوا كل الحالات في المدة، و«الملغية» بتفلتر بالحالة.
  List<OrderStatus> get statuses => switch (this) {
        HistoryFilter.cancelled => const [OrderStatus.rejected, OrderStatus.cancelled],
        _ => const [],
      };
}

/// السجل حسب الفلتر — بناخد أول صفحة كبيرة (٥٠) والـ API بيرجّع صفحات
/// (OrdersPage) فبنقرأ منها `.orders` بس؛ مافيش pagination في التصميم.
final historyProvider = FutureProvider.family<List<MerchantOrder>, HistoryFilter>(
  (ref, filter) async {
    final page = await ref.watch(ordersRepositoryProvider).history(
          pageSize: 50,
          statuses: filter.statuses,
          from: filter.from,
        );
    return page.orders;
  },
);

// ─────────────────────────── العدّادات ───────────────────────────
// كلها بترجّع صفر أثناء التحميل أو الخطأ — الهيدر مايعرضش شرطة ولا يفضى.

final incomingCountProvider = Provider<int>(
  (ref) => ref.watch(incomingOrdersProvider).value?.length ?? 0,
);

int _countWhere(Ref ref, bool Function(MerchantOrder) test) =>
    ref.watch(activeOrdersProvider).value?.where(test).length ?? 0;

/// ACCEPTED + PREPARING — الاتنين في المطبخ فعلياً.
final preparingCountProvider = Provider<int>(
  (ref) => _countWhere(
    ref,
    (o) => o.status == OrderStatus.accepted || o.status == OrderStatus.preparing,
  ),
);

final readyCountProvider = Provider<int>(
  (ref) => _countWhere(ref, (o) => o.status == OrderStatus.ready),
);

final awaitingCaptainCountProvider = Provider<int>(
  (ref) => _countWhere(ref, (o) => o.status == OrderStatus.captainAssigned),
);

// ─────────────────────────── ربط السوكيت ───────────────────────────

/// نقطة الربط الوحيدة بين أحداث السوكيت والبروڤايدرز.
/// الشاشات بتعمل `ref.watch(socketRefreshProvider)` عشان الاشتراك يفضل حي
/// طول ما الشاشة مفتوحة، وبيتلغي لوحده لما تقفل.
final socketRefreshProvider = Provider<void>((ref) {
  final socket = ref.watch(socketServiceProvider);

  // آمن نناديها هنا: `connect()` بترجع فوراً لو الاتصال قايم (main.dart بتفتحه
  // عند الإقلاع)، والنداء ده بيغطي حالة الدخول بعد ما التطبيق اشتغل.
  socket.connect();

  final subs = <StreamSubscription<Object>>[
    // طلب جديد → القائمة الواردة (والصوت بيشتغل من الشاشة لما تتملّى).
    socket.newOrders.listen((_) => ref.invalidate(incomingOrdersProvider)),

    // تغيّر حالة → الجارية + تفاصيل الطلب نفسه (لو مفتوح).
    socket.statusChanges.listen((event) {
      ref.invalidate(activeOrdersProvider);
      ref.invalidate(orderProvider(event.orderId));
    }),

    // اتعيّن كابتن → الجارية + شاشة «جاهز للاستلام».
    socket.captainAssigned.listen((event) {
      ref.invalidate(activeOrdersProvider);
      ref.invalidate(orderProvider(event.orderId));
    }),
  ];

  ref.onDispose(() {
    for (final sub in subs) {
      sub.cancel();
    }
  });
});
