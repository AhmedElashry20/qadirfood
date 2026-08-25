// العنوان — منزل/عمل/آخر + إحداثيات + ملاحظات للكابتن.
import '../core/enums.dart';

class Address {
  const Address({
    required this.id,
    required this.label,
    required this.title,
    required this.details,
    required this.lat,
    required this.lng,
    this.city,
    this.district,
    this.street,
    this.building,
    this.notes,
    this.isDefault = false,
  });

  final String id;
  final AddressLabel label;

  /// «المنزل» — الاسم اللي كتبه المستخدم (نفس `label` النصي في الـ API).
  final String title;

  /// «حي النرجس، شارع العليا، فيلا 12»
  final String details;
  final double lat;
  final double lng;

  /// الحقول الخام زي ما الـ API بيخزّنها (بتترجع كما هي في التعديل).
  final String? city;
  final String? district;
  final String? street;
  final String? building;

  /// ملاحظات للكابتن (رقم الفيلا، الدور، علامة مميزة).
  final String? notes;
  final bool isDefault;

  factory Address.fromJson(Map<String, dynamic> json) {
    final rawLabel = (json['label'] as String?) ?? '';
    final city = json['city'] as String?;
    final district = json['district'] as String?;
    final street = json['street'] as String?;
    final building = json['building'] as String?;

    return Address(
      id: json['id'] as String,
      label: labelFromWire(rawLabel),
      title: rawLabel.isEmpty ? AddressLabel.other.ar : rawLabel,
      details: buildDetails(city: city, district: district, street: street, building: building),
      lat: (json['lat'] as num?)?.toDouble() ?? 0,
      lng: (json['lng'] as num?)?.toDouble() ?? 0,
      city: city,
      district: district,
      street: street,
      building: building,
      notes: json['notes'] as String?,
      isDefault: json['isDefault'] as bool? ?? false,
    );
  }

  /// الجسم اللي بيتبعت في POST/PATCH /customer/addresses.
  Map<String, dynamic> toJson() => {
        'label': title.isEmpty ? label.ar : title,
        'city': city ?? 'الرياض',
        if (district != null) 'district': district,
        if (street != null) 'street': street,
        if (building != null) 'building': building,
        if (notes != null) 'notes': notes,
        'lat': lat,
        'lng': lng,
        'isDefault': isDefault,
      };

  /// «حي النرجس، شارع العليا، فيلا 12» — من الحقول الخام.
  static String buildDetails({
    String? city,
    String? district,
    String? street,
    String? building,
  }) {
    final parts = [
      if (district != null && district.isNotEmpty) 'حي $district',
      if (street != null && street.isNotEmpty) 'شارع $street',
      if (building != null && building.isNotEmpty) building,
    ];
    if (parts.isEmpty && city != null && city.isNotEmpty) return city;
    return parts.join('، ');
  }

  /// الـ API بيخزّن الـ label كنص حر — بنستنتج منه نوع الأيقونة.
  static AddressLabel labelFromWire(String value) {
    final v = value.toLowerCase();
    if (v.contains('منزل') || v.contains('بيت') || v.contains('home')) return AddressLabel.home;
    if (v.contains('عمل') || v.contains('مكتب') || v.contains('work') || v.contains('office')) {
      return AddressLabel.work;
    }
    return AddressLabel.other;
  }

  Address copyWith({
    AddressLabel? label,
    String? title,
    String? details,
    double? lat,
    double? lng,
    String? city,
    String? district,
    String? street,
    String? building,
    String? notes,
    bool? isDefault,
  }) =>
      Address(
        id: id,
        label: label ?? this.label,
        title: title ?? this.title,
        details: details ?? this.details,
        lat: lat ?? this.lat,
        lng: lng ?? this.lng,
        city: city ?? this.city,
        district: district ?? this.district,
        street: street ?? this.street,
        building: building ?? this.building,
        notes: notes ?? this.notes,
        isDefault: isDefault ?? this.isDefault,
      );
}
