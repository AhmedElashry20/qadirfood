// نقاط الولاء وبرنامج الإحالة.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/api_repository.dart';
import '../models/loyalty.dart';

/// رصيد النقاط وكشف الحركات.
final loyaltyProvider = FutureProvider<LoyaltySummary>((ref) async {
  return ref.read(customerRepositoryProvider).loyalty();
});

/// كود الإحالة — بيتولّد على السيرفر أول مرة الشاشة تتفتح.
final referralProvider = FutureProvider<ReferralInfo>((ref) async {
  return ref.read(customerRepositoryProvider).referral();
});

/// النقاط اللي العميل اختار يستبدلها في الطلب الحالي.
///
/// الرقم ده **نية** مش وعد: السيرفر بيقيّده بالرصيد وبسقف الطلب وبالحد الأدنى
/// وقت التسعير ووقت إنشاء الطلب. الشاشة بتعرض الرقم اللي رجع من التسعير.
class RedeemPointsNotifier extends Notifier<int> {
  @override
  int build() => 0;

  void select(int points) => state = points < 0 ? 0 : points;

  void clear() => state = 0;
}

final redeemPointsProvider =
    NotifierProvider<RedeemPointsNotifier, int>(RedeemPointsNotifier.new);

/// تسعير الاستبدال للسلة الحالية — بيرجع النقاط الفعلية وقيمتها بالريال.
///
/// `family` على السقف عشان التسعير يتحدّث لو العميل غيّر السلة أو الكوبون.
final redemptionQuoteProvider =
    FutureProvider.family<RedemptionQuote, double>((ref, maxDiscountSar) async {
  final points = ref.watch(redeemPointsProvider);
  if (points <= 0 || maxDiscountSar <= 0) return RedemptionQuote.zero;
  return ref.read(customerRepositoryProvider).loyaltyQuote(
        points: points,
        maxDiscountSar: maxDiscountSar,
      );
});
