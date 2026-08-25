// الخريطة والتوجيه — OpenStreetMap (زي التصميم، وبدون مفتاح API).
// لو اتحوّلنا لـ Google Maps: الملف ده هو الوحيد اللي يتغيّر.
//
// بياخد [LatLngPoint] بتاعنا (core/location_service.dart) مش `LatLng` بتاع
// latlong2 — عشان الشاشات ماتستوردش حزمة الخرائط أصلاً والتبديل يفضل هنا بس.
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../core/location_service.dart';
import '../core/theme.dart';

const _tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const _userAgent = 'com.qadirfood.captain';

/// علامة إضافية على الخريطة — لأي شاشة عايزة تحط نقطة بشكلها الخاص.
typedef QMapMarker = ({LatLngPoint point, Widget child, double size});

/// خريطة بعلامات ثابتة — الرئيسية وشاشة العرض وشاشات الرحلة كلها بتستخدمها.
class QMap extends StatelessWidget {
  const QMap({
    super.key,
    required this.center,
    this.zoom = 14,
    this.captain,
    this.destination,
    this.markers = const [],
    this.controller,
    this.interactive = true,
  });

  final LatLngPoint center;
  final double zoom;

  /// موقع الكابتن — دايرة صفرا فيها 🛵.
  final LatLngPoint? captain;

  /// الوجهة (المطعم أو العميل) — دبوس 📍.
  final LatLngPoint? destination;

  /// علامات إضافية فوق دول.
  final List<QMapMarker> markers;

  final MapController? controller;

  /// شاشة العرض بتعرض الخريطة كخلفية مش قابلة للتحريك.
  final bool interactive;

  static LatLng _toLatLng(LatLngPoint point) => LatLng(point.lat, point.lng);

  @override
  Widget build(BuildContext context) {
    return FlutterMap(
      mapController: controller,
      options: MapOptions(
        initialCenter: _toLatLng(center),
        initialZoom: zoom,
        interactionOptions: InteractionOptions(
          flags: interactive ? InteractiveFlag.all : InteractiveFlag.none,
        ),
      ),
      children: [
        TileLayer(urlTemplate: _tileUrl, userAgentPackageName: _userAgent),
        MarkerLayer(
          markers: [
            if (destination != null)
              Marker(
                point: _toLatLng(destination!),
                width: 40,
                height: 44,
                alignment: Alignment.topCenter,
                child: const Text('📍', style: TextStyle(fontSize: 34)),
              ),
            for (final marker in markers)
              Marker(
                point: _toLatLng(marker.point),
                width: marker.size,
                height: marker.size,
                child: marker.child,
              ),
            // الكابتن آخر واحد عشان يفضل فوق أي علامة تانية.
            if (captain != null)
              Marker(
                point: _toLatLng(captain!),
                width: 46,
                height: 46,
                child: const QCaptainPin(),
              ),
          ],
        ),
      ],
    );
  }
}

/// دايرة الكابتن الصفرا — ٤٦×٤٦ بإطار أبيض ٣ بكسل وظل.
class QCaptainPin extends StatelessWidget {
  const QCaptainPin({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: QColors.brand,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 3),
        boxShadow: const [
          BoxShadow(color: Color(0x40000000), blurRadius: 12, offset: Offset(0, 4)),
        ],
      ),
      alignment: Alignment.center,
      child: const Text('🛵', style: TextStyle(fontSize: 19)),
    );
  }
}
