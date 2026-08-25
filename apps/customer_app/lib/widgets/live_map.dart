// خريطة التتبع الحي — OpenStreetMap (زي التصميم، وبدون مفتاح API).
// لو اتحوّلنا لـ Google Maps: الملف ده هو الوحيد اللي يتغيّر.
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../core/theme.dart';

const _tileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const _userAgent = 'com.qadirfood.customer';

/// خريطة بعلامات ثابتة (تتبّع الكابتن، عرض موقع العنوان).
class LiveMap extends StatelessWidget {
  const LiveMap({
    super.key,
    required this.center,
    this.zoom = 14,
    this.captain,
    this.destination,
    this.controller,
    this.onMove,
  });

  final LatLng center;
  final double zoom;

  /// موقع الكابتن — علامة صفرا فيها 🛵.
  final LatLng? captain;

  /// موقع العميل — دبوس 📍.
  final LatLng? destination;
  final MapController? controller;

  /// بيتنده لما المستخدم يحرّك الخريطة (اختيار موقع العنوان).
  final ValueChanged<LatLng>? onMove;

  @override
  Widget build(BuildContext context) {
    return FlutterMap(
      mapController: controller,
      options: MapOptions(
        initialCenter: center,
        initialZoom: zoom,
        onPositionChanged: onMove == null
            ? null
            : (position, hasGesture) {
                if (hasGesture) onMove!(position.center);
              },
      ),
      children: [
        TileLayer(urlTemplate: _tileUrl, userAgentPackageName: _userAgent),
        MarkerLayer(
          markers: [
            if (captain != null)
              Marker(
                point: captain!,
                width: 44,
                height: 44,
                child: const _CaptainPin(),
              ),
            if (destination != null)
              Marker(
                point: destination!,
                width: 40,
                height: 44,
                alignment: Alignment.topCenter,
                child: const Text('📍', style: TextStyle(fontSize: 34)),
              ),
          ],
        ),
      ],
    );
  }
}

class _CaptainPin extends StatelessWidget {
  const _CaptainPin();

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
      child: const Text('🛵', style: TextStyle(fontSize: 18)),
    );
  }
}

/// دبوس ثابت في نص الشاشة (شاشة اختيار الموقع — الخريطة بتتحرك تحته).
class CenterPin extends StatelessWidget {
  const CenterPin({super.key});

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Center(
        child: Transform.translate(
          offset: const Offset(0, -20),
          child: const Text('📍', style: TextStyle(fontSize: 40)),
        ),
      ),
    );
  }
}
