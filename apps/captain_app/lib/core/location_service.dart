// بث الموقع كل ٥ ثواني أثناء المهمة.
// ملاحظة: geolocator مش متثبت دلوقتي (البناء لسه من غير أذونات الموقع)، فالخدمة
// دي بتشتغل بمصدر موقع قابل للاستبدال: افتراضياً محاكاة بتتحرك ناحية الوجهة، ولما
// نضيف geolocator نستبدل [LocationSource] بس ومحدش تاني بيتغيّر.
import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/foundation.dart' show debugPrint;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import 'socket_service.dart';

class LatLngPoint {
  const LatLngPoint(this.lat, this.lng);

  final double lat;
  final double lng;
}

/// مصدر الموقع — واجهة عشان نستبدل المحاكاة بـ GPS حقيقي من غير ما نلمس الشاشات.
abstract class LocationSource {
  Stream<LatLngPoint> watch();
  Future<LatLngPoint?> current();
}

/// محاكاة: بتتحرك ناحية [destination] بخطوة ثابتة كل تحديث.
/// من غيرها التطبيق مش هيقدر يبعت موقع على الإطلاق في المحاكي.
class SimulatedLocationSource implements LocationSource {
  SimulatedLocationSource({required LatLngPoint start, LatLngPoint? destination})
      : _current = start,
        _destination = destination;

  LatLngPoint _current;
  LatLngPoint? _destination;

  void setDestination(LatLngPoint? destination) => _destination = destination;

  @override
  Future<LatLngPoint?> current() async => _current;

  @override
  Stream<LatLngPoint> watch() async* {
    yield _current;

    await for (final _ in Stream<void>.periodic(const Duration(seconds: 5))) {
      final dest = _destination;
      if (dest != null) {
        // بنقطع ١٠٪ من المسافة الباقية كل تحديث.
        _current = LatLngPoint(
          _current.lat + (dest.lat - _current.lat) * 0.10,
          _current.lng + (dest.lng - _current.lng) * 0.10,
        );
      }
      yield _current;
    }
  }
}

/// مصدر GPS حقيقي من جهاز الكابتن (geolocator). بيطلب الإذن أول مرة، وبيبث كل
/// حركة ≥ ٢٥ متر. لو الإذن مرفوض أو خدمة الموقع مقفولة، الـ streams بتفضل فاضية
/// (مافيش موقع بيتبعت) بدل ما التطبيق يقع.
class GpsLocationSource implements LocationSource {
  Future<bool> _ensurePermission() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      debugPrint('خدمة الموقع مقفولة على الجهاز');
      return false;
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied ||
        permission == LocationPermission.deniedForever) {
      debugPrint('إذن الموقع مرفوض');
      return false;
    }
    return true;
  }

  @override
  Future<LatLngPoint?> current() async {
    if (!await _ensurePermission()) return null;
    try {
      final pos = await Geolocator.getCurrentPosition();
      return LatLngPoint(pos.latitude, pos.longitude);
    } catch (e) {
      debugPrint('فشل قراءة الموقع الحالي: $e');
      return null;
    }
  }

  @override
  Stream<LatLngPoint> watch() async* {
    if (!await _ensurePermission()) return;
    yield* Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 25, // تحديث كل ≥ ٢٥ متر — يوفّر بطارية وباندويدث
      ),
    ).map((p) => LatLngPoint(p.latitude, p.longitude));
  }
}

/// بتشغّل بث الموقع للسيرفر طول ما الكابتن أونلاين.
class LocationBroadcaster {
  LocationBroadcaster(this._socket, this._source);

  final SocketService _socket;
  final LocationSource _source;

  StreamSubscription<LatLngPoint>? _sub;
  String? _orderId;
  LatLngPoint? _last;

  LatLngPoint? get lastKnown => _last;
  bool get isRunning => _sub != null;

  /// [orderId] بيتحط لما الكابتن يبقى في رحلة — عشان الموقع يوصل لشاشة تتبّع العميل.
  void start({String? orderId}) {
    _orderId = orderId;
    if (_sub != null) return;

    _sub = _source.watch().listen((point) {
      _last = point;
      _socket.sendLocation(lat: point.lat, lng: point.lng, orderId: _orderId);
    });
  }

  void setOrder(String? orderId) => _orderId = orderId;

  void stop() {
    _sub?.cancel();
    _sub = null;
  }

  void dispose() => stop();
}

/// نقطة البداية الافتراضية — الرياض (نفس بيانات الـ seed).
const kRiyadh = LatLngPoint(24.7136, 46.6753);

/// GPS حقيقي افتراضياً. للاختبار على محاكي من غير GPS، ابنِ بـ
/// `--dart-define=SIMULATE_LOCATION=true` عشان يرجع للمصدر المحاكى.
const _simulateLocation = bool.fromEnvironment('SIMULATE_LOCATION');

final locationSourceProvider = Provider<LocationSource>(
  (ref) => _simulateLocation ? SimulatedLocationSource(start: kRiyadh) : GpsLocationSource(),
);

final locationBroadcasterProvider = Provider<LocationBroadcaster>((ref) {
  final broadcaster = LocationBroadcaster(
    ref.watch(socketServiceProvider),
    ref.watch(locationSourceProvider),
  );
  ref.onDispose(broadcaster.dispose);
  return broadcaster;
});

/// مسافة تقريبية بالكيلومتر بين نقطتين.
double distanceKm(LatLngPoint a, LatLngPoint b) {
  const kmPerDegree = 111.0;
  final dLat = (b.lat - a.lat) * kmPerDegree;
  final dLng = (b.lng - a.lng) * kmPerDegree * 0.9; // تصحيح تقريبي لخط عرض الرياض
  return math.sqrt(dLat * dLat + dLng * dLng);
}
