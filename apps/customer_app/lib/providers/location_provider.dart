// العناوين المحفوظة + العنوان المختار للتوصيل — من الـ API.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/api_repository.dart';
import '../models/address.dart';

/// مركز الخريطة الافتراضي — الرياض.
const kRiyadhLat = 24.7136;
const kRiyadhLng = 46.6753;

/// GET /customer/addresses — القائمة كلها، والتعديلات بتعيد تحميلها من السيرفر.
/// كل الدوال بترمي [ApiException] زي ما هي عشان الشاشة تعرض `e.message`.
class AddressesNotifier extends AsyncNotifier<List<Address>> {
  @override
  Future<List<Address>> build() => ref.watch(customerRepositoryProvider).addresses();

  CustomerRepository get _repo => ref.read(customerRepositoryProvider);

  Future<void> _reload() async => state = AsyncData(await _repo.addresses());

  /// POST /customer/addresses
  Future<void> add(Address address) async {
    await _repo.createAddressFrom(address);
    await _reload();
  }

  /// PATCH /customer/addresses/:id
  /// (اسمها مش `update` لأن الاسم ده محجوز في `AsyncNotifier`.)
  Future<void> updateAddress(Address address) async {
    await _repo.updateAddressFrom(address);
    await _reload();
  }

  /// إضافة أو تعديل حسب وجود العنوان في القائمة — شاشة محرر العنوان بتستخدمها.
  Future<void> upsert(Address address) {
    final current = state.value ?? const <Address>[];
    final isNew = address.id.isEmpty || !current.any((a) => a.id == address.id);
    return isNew ? add(address) : updateAddress(address);
  }

  /// DELETE /customer/addresses/:id
  Future<void> remove(String id) async {
    await _repo.deleteAddress(id);

    // لو كان هو المختار للتوصيل، نرجّع للافتراضي (selectedAddressProvider بيحلّها).
    if (ref.read(selectedAddressIdProvider) == id) {
      ref.read(selectedAddressIdProvider.notifier).clear();
    }
    await _reload();
  }

  /// PATCH /customer/addresses/:id/default
  Future<void> makeDefault(String id) async {
    await _repo.setDefaultAddress(id);
    await _reload();
    ref.read(selectedAddressIdProvider.notifier).select(id);
  }
}

final addressesProvider =
    AsyncNotifierProvider<AddressesNotifier, List<Address>>(AddressesNotifier.new);

/// العنوان اللي المستخدم اختاره يدوياً — `null` = استخدم الافتراضي من الـ API.
class SelectedAddressIdNotifier extends Notifier<String?> {
  @override
  String? build() => null;

  void select(String id) => state = id;

  void clear() => state = null;
}

final selectedAddressIdProvider =
    NotifierProvider<SelectedAddressIdNotifier, String?>(SelectedAddressIdNotifier.new);

/// العنوان المختار للتوصيل — يظهر في هيدر الرئيسية وفي إتمام الطلب.
///
/// **بيرجع `null`** لو العناوين لسه بتحمّل أو المستخدم مالوش عناوين
/// (كان non-null أيام الموك). الترتيب: المختار يدوياً ← الافتراضي ← أول عنوان.
final selectedAddressProvider = Provider<Address?>((ref) {
  final addresses = ref.watch(addressesProvider).value;
  if (addresses == null || addresses.isEmpty) return null;

  final id = ref.watch(selectedAddressIdProvider);
  return addresses.firstWhere(
    (a) => a.id == id,
    orElse: () => addresses.firstWhere((a) => a.isDefault, orElse: () => addresses.first),
  );
});

/// إحداثيات البحث عن المطاعم — عنوان التوصيل، وبديلها الرياض.
final currentLatLngProvider = Provider<({double lat, double lng})>((ref) {
  final address = ref.watch(selectedAddressProvider);
  return (lat: address?.lat ?? kRiyadhLat, lng: address?.lng ?? kRiyadhLng);
});
