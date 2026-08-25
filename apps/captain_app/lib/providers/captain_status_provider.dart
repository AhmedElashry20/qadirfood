// أونلاين / أوفلاين / في مهمة.
//
// ══════════════════════════════════════════════════════════════════════════
//  ⚠️ الحالة دي **محلية + سوكيت بس — مافيش REST endpoint لها خالص**
// ══════════════════════════════════════════════════════════════════════════
// التغيير بيتبعت بـ `captain:status_update` على السوكيت، والسيرفر بيستخدمه في
// التوزيع. بس مافيش `GET /captains/me/status` ولا أي مسار يرجّع الحالة، يعني:
//   • مانقدرش نقرا الحالة الحقيقية بعد ما التطبيق يتقفل ويتفتح تاني.
//   • عشان كده [build] بترجّع **offline دايماً** عند الإقلاع. ده مش افتراض
//     عشوائي — ده أأمن حاجة: لو فرضنا إنه أونلاين وهو مش كده، الكابتن هيستنى
//     عروض مش جاية. الكابتن بيضغط الزرار الكبير بنفسه أول ما يفتح التطبيق.
//   • السيرفر لوحده بيرجّع الكابتن ONLINE بعد التسليم (markDelivered)، فلو
//     الحالة المحلية اتغيّرت من غير علمنا مافيش طريقة نعرف.
//
// `GET /captains/me` بقى بيرجّع `status` — بس دي للقراءة والعرض بس، مش مصدر
// للزرار الكبير، عشان مانقلبش حالة الكابتن من تحت إيده وهو بيشتغل.
import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/enums.dart';
import '../core/location_service.dart';
import '../core/socket_service.dart';
import '../data/captain_repository.dart';
import '../models/captain.dart';

class CaptainStatusNotifier extends Notifier<CaptainStatus> {
  /// أوفلاين دايماً عند الإقلاع — راجع تعليق أول الملف.
  @override
  CaptainStatus build() => CaptainStatus.offline;

  /// الزرار الكبير في الرئيسية.
  ///
  /// بيعمل تلات حاجات مع بعض:
  ///   ١) `captain:status_update` على السوكيت (ONLINE / OFFLINE) ومعاه آخر موقع
  ///      معروف — السيرفر بيستخدم الإحداثيات في اختيار أقرب كابتن.
  ///   ٢) بيشغّل/بيوقّف بث الموقع (كل ٥ ثواني).
  ///   ٣) بيحدّث الحالة المحلية.
  void setOnline(bool online) {
    final socket = ref.read(socketServiceProvider);
    final broadcaster = ref.read(locationBroadcasterProvider);
    // لو لسه مافيش قراءة موقع حقيقية، مانبعتش إحداثيات مزيّفة — بنبعت الحالة من
    // غير موقع والسيرفر يستنى أول location_update حقيقي من البث.
    final point = broadcaster.lastKnown;

    final next = online ? CaptainStatus.online : CaptainStatus.offline;
    socket.sendStatus(next.wire, lat: point?.lat, lng: point?.lng);

    if (online) {
      broadcaster.start();
    } else {
      broadcaster.stop();
    }

    state = next;
  }

  /// الكابتن قبل رحلة — بيفضل باعت موقعه، بس بـ `orderId` عشان الموقع يوصل
  /// لشاشة تتبّع العميل (من غيره السيرفر مايعرفش الموقع ده بتاع أنهي طلب).
  void setOnTrip({String? orderId}) {
    final socket = ref.read(socketServiceProvider);
    final broadcaster = ref.read(locationBroadcasterProvider);
    // نفس المبدأ: من غير موقع حقيقي مانبعتش إحداثيات مزيّفة.
    final point = broadcaster.lastKnown;

    socket.sendStatus(CaptainStatus.onTrip.wire, lat: point?.lat, lng: point?.lng);
    broadcaster.start(orderId: orderId);
    broadcaster.setOrder(orderId);

    state = CaptainStatus.onTrip;
  }
}

final captainStatusProvider =
    NotifierProvider<CaptainStatusNotifier, CaptainStatus>(CaptainStatusNotifier.new);

/// بيانات الكابتن — `GET /captains/me` (شوف [CaptainRepository.me]).
///
/// فيه التقييم والمحفظة وعدد التوصيلات وملخص الوثائق في نداء واحد. لو التوكن
/// مالوش `captainId` السيرفر بيرجّع 403 والـ repository بيرجع للطريقة القديمة
/// (صف `captain` المرفق مع أحدث طلب) قبل ما يرمي.
final captainProvider = FutureProvider<Captain>((ref) {
  return ref.watch(captainRepositoryProvider).me();
});

/// وثائق الكابتن — `GET /captains/me/documents`.
///
/// بترجّع **خمس صفوف دايماً** حتى لو مترفعش ولا واحدة، فالشاشة مابتخترعش صفوف.
/// [upload] بيعمل الخطوتين مع بعض: رفع الملف على `/uploads` عشان ياخد رابط،
/// وبعدين تسجيل الرابط على نوع الوثيقة — وبعدها بيعيد القراءة.
class DocumentsNotifier extends AsyncNotifier<List<CaptainDocument>> {
  @override
  Future<List<CaptainDocument>> build() => ref.watch(captainRepositoryProvider).documents();

  /// إعادة قراءة من السيرفر — بتعدّي على حالة التحميل عشان الشاشة تبيّن.
  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => ref.read(captainRepositoryProvider).documents());
  }

  /// رفع (أو إعادة رفع) وثيقة.
  ///
  /// بيرمي [ApiException] برسالة السيرفر العربية عشان الشاشة تعرضها زي ما هي —
  /// مابنبلعش الخطأ هنا. الحالة بترجع PENDING من السيرفر تلقائياً بعد أي رفع.
  Future<void> upload({
    required String type,
    required File file,
    DateTime? expiresAt,
  }) async {
    final repository = ref.read(captainRepositoryProvider);
    final fileUrl = await repository.uploadFile(file, folder: 'documents');
    await repository.uploadDocument(type: type, fileUrl: fileUrl, expiresAt: expiresAt);
    await refresh();
  }
}

final documentsProvider =
    AsyncNotifierProvider<DocumentsNotifier, List<CaptainDocument>>(DocumentsNotifier.new);
