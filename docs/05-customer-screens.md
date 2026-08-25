# شاشات تطبيق العميل (٢٨+)

تطبيق Flutter عربي RTL، مبني على ملف التصميم «قادر فود — تطبيق العميل» (نسخة A: هيدر أصفر للرئيسية، وصورة كبيرة + تابات لصفحة المطعم).

## نظام التصميم — `lib/core/theme.dart`

| العنصر | القيمة |
|---|---|
| الأصفر الأساسي | `#FFD200` (`QColors.brand`) |
| الأسود | `#1C1C1C` (`QColors.ink`) · أسود فاتح `#2B2B2B` |
| خلفية الشاشات | `#F7F6F1` (`QColors.canvas`) · الكروت بيضا |
| الحدود والفواصل | `#E8E6DE` / `#EFEDE5` |
| نجاح / خطر | `#0BA55B` / `#E23E3E` |
| ذهبي (روابط ثانوية) | `#B89A00` |
| الخطوط | **Cairo** للنص العربي · **Outfit** للأرقام واللاتيني (`QText.num` / `QPrice`) |
| الراديوس | كروت 16-18 · شيت سفلي 24 · شرائح 99 |
| البادنج الأفقي | 24 (`QSpace.screenH`) |

المكوّنات المشتركة في `lib/widgets/common.dart` (`QHeader`, `QButton`, `QChip`, `QCard`, `QPrice`, `QRatingPill`, `QBadge`, `QListTile`, `QTileGroup`, `QQuantityStepper`, `QSwitch`, `QRadioDot`, `QCheckBox`, `QField`, `QImage`, `QEmpty`, `QBottomBar`) — أي شاشة جديدة تستخدمها بدل ما تعيد تنسيق نفس الحاجة.

## الشاشات

| # | الشاشة | الملف | المسار |
|---|---|---|---|
| ١ | سبلاش | `features/onboarding/splash_screen.dart` | `/` |
| ٢ | الشاشات التعريفية | `features/onboarding/intro_screen.dart` | `/intro` |
| ٣ | اختيار اللغة | `features/onboarding/language_screen.dart` | `/language` |
| ٤ | تسجيل الدخول بالجوال | `features/auth/login_screen.dart` | `/login` |
| ٥ | رمز التحقق OTP | `features/auth/otp_screen.dart` | `/otp` |
| ٦ | استكمال الملف الشخصي | `features/auth/complete_profile_screen.dart` | `/complete-profile` |
| ٧ | تحديد الموقع على الخريطة | `features/location/pick_location_screen.dart` | `/addresses/pick` |
| ٨ | عناويني | `features/location/addresses_screen.dart` | `/addresses` |
| ٩ | إضافة/تعديل عنوان | `features/location/address_editor_screen.dart` | `/addresses/edit` |
| ١٠ | الرئيسية (نسخة A) | `features/home/home_screen.dart` | `/home` |
| ١١ | البحث | `features/home/search_screen.dart` | `/search` |
| ١٢ | الفلاتر والترتيب | `features/home/filters_screen.dart` | `/filters` |
| ١٣ | مطاعم تصنيف | `features/home/category_restaurants_screen.dart` | `/category/:id` |
| ١٤ | صفحة المطعم (نسخة A) | `features/restaurant/restaurant_screen.dart` | `/restaurant/:id` |
| ١٥ | تفاصيل الصنف | `features/restaurant/item_screen.dart` | `/restaurant/:id/item/:itemId` |
| ١٦ | السلة | `features/restaurant/cart_screen.dart` | `/cart` |
| ١٧ | إتمام الطلب | `features/checkout/checkout_screen.dart` | `/checkout` |
| ١٨ | طرق الدفع | `features/checkout/payment_method_screen.dart` | `/payment-methods` |
| ١٩ | إضافة بطاقة | `features/checkout/payment_screen.dart` | `/payment-methods/add` |
| ٢٠ | تأكيد الطلب | `features/checkout/order_success_screen.dart` | `/order/:id/success` |
| ٢١ ⭐ | تتبع الكابتن لحظياً | `features/tracking/live_tracking_screen.dart` | `/order/:id/track` |
| ٢٢ | تفاصيل الطلب الحالي | `features/tracking/order_details_screen.dart` | `/order/:id` |
| ٢٣ | طلباتي | `features/orders/my_orders_screen.dart` | `/orders` |
| ٢٤ | طلب سابق + إعادة الطلب | `features/orders/past_order_screen.dart` | `/order/:id/receipt` |
| ٢٥ | تقييم الطلب والكابتن | `features/orders/rate_order_screen.dart` | `/order/:id/rate` |
| ٢٦ | حسابي | `features/account/account_screen.dart` | `/account` |
| ٢٧ | الكوبونات والمحفظة | `features/account/wallet_screen.dart` | `/wallet` |
| ٢٨ | الإعدادات | `features/account/settings_screen.dart` | `/settings` |
| ٢٩ | المفضلة | `features/account/favorites_screen.dart` | `/favorites` |
| ٣٠ | الإشعارات | `features/account/notifications_screen.dart` | `/notifications` |
| ٣١ | الدعم والمساعدة | `features/account/support_screen.dart` | `/support` |

التنقّل السفلي (`widgets/bottom_nav.dart`) بيغلّف ٤ تبويبات: الرئيسية · البحث · طلباتي · حسابي.

## الحالة (Riverpod v3)

- `restaurants_provider` — المطاعم، التصنيفات، البحث، الفلاتر (`SortBy` + `RestaurantFilters`)، المفضلة.
- `cart_provider` — السلة (سلة واحدة لمطعم واحد) + `billProvider` (فرعي + توصيل + ضريبة 15% − كوبون).
- `checkout_provider` — الكوبون المفعّل، وقت التوصيل، طريقة الدفع، `placeOrderProvider`.
- `location_provider` — العناوين + العنوان المختار.
- `orders_provider` — الطلبات وتبويباتها + التقييم.
- `order_tracking_provider` — تتبّع لحظي (محاكاة بتايمر دلوقتي).

## المرحلة الحالية: بيانات وهمية

كل الشاشات بتقرأ من `lib/data/mock_data.dart`. لما نوصّل الـ API:

1. `lib/core/api_client.dart` (Dio + JWT) و`socket_service.dart` (`captain:location`, `order:status_changed`).
2. البروڤايدرز تتحوّل لـ `AsyncNotifier` وتقرأ من الـ API بنفس الموديلات في `lib/models/`.
3. `order_tracking_provider` يستبدل التايمر بأحداث السوكيت — الواجهة ما تتغيّرش.
4. الخريطة: دلوقتي OpenStreetMap عبر `flutter_map` (بدون مفتاح). التحويل لـ Google Maps بيتم في `lib/widgets/live_map.dart` بس.
