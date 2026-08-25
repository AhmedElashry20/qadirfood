// منيو الفرع — الأقسام والأصناف من الـ API (مافيش موك خالص).
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api_client.dart';
import '../data/api_repository.dart';
import '../models/menu_item.dart';

/// GET /customer/branches/:id/menu
final menuProvider = FutureProvider.family<List<MenuSection>, String>(
  (ref, branchId) => ref.watch(customerRepositoryProvider).menu(branchId),
);

/// صنف واحد — (branchId, itemId) — بيتقرا من منيو الفرع المحمّل (مافيش نداء زيادة).
final menuItemProvider = FutureProvider.family<MenuItem, (String, String)>((ref, key) async {
  final (branchId, itemId) = key;

  final sections = await ref.watch(menuProvider(branchId).future);
  for (final section in sections) {
    for (final item in section.items) {
      if (item.id == itemId) return item;
    }
  }

  throw ApiException('الصنف مش موجود في المنيو', statusCode: 404);
});
