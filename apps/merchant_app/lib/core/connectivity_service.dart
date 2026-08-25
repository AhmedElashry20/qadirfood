// مراقبة الاتصال — بيغذّي بانر الـ Offline.
// الفرع لو النت قطع مش هيشوف الطلبات الجديدة، فلازم تحذير واضح مش مجرد أيقونة.
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// `true` = فيه اتصال. بيتحدّث تلقائياً مع كل تغيير في الشبكة.
final connectivityProvider = StreamProvider<bool>((ref) async* {
  final connectivity = Connectivity();

  bool isOnline(List<ConnectivityResult> results) =>
      results.any((r) => r != ConnectivityResult.none);

  yield isOnline(await connectivity.checkConnectivity());
  yield* connectivity.onConnectivityChanged.map(isOnline);
});

/// نسخة مبسّطة للشاشات: بتفترض الاتصال شغّال لحد ما يثبت العكس.
final isOnlineProvider = Provider<bool>(
  (ref) => ref.watch(connectivityProvider).value ?? true,
);
