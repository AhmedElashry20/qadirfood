// بيانات وهمية للمرحلة الأولى (واجهة فقط) — كل شاشة تقرأ من هنا عبر البروڤايدرز.
// لما نوصّل الـ API: الملف ده يتشال والبروڤايدرز تقرأ من ApiClient بنفس الموديلات.
import '../core/enums.dart';
import '../models/address.dart';
import '../models/menu_item.dart';
import '../models/order.dart';
import '../models/restaurant.dart';

abstract final class MockData {
  // ── المستخدم ──
  static const userName = 'Ahmed Alqadir';
  static const userPhone = '+966 55 123 4567';
  static const userTier = 'Gold';
  static const walletBalance = 42.50;
  static const loyaltyPoints = 1240;

  // ── التصنيفات ──
  static const categories = <FoodCategory>[
    FoodCategory(
      id: 'burger',
      name: 'برجر',
      imageUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=200&q=60',
    ),
    FoodCategory(
      id: 'pizza',
      name: 'بيتزا',
      imageUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=200&q=60',
    ),
    FoodCategory(
      id: 'grill',
      name: 'مشويات',
      imageUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=200&q=60',
    ),
    FoodCategory(
      id: 'sushi',
      name: 'سوشي',
      imageUrl: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=200&q=60',
    ),
    FoodCategory(
      id: 'dessert',
      name: 'حلويات',
      imageUrl: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=200&q=60',
    ),
    FoodCategory(
      id: 'rice',
      name: 'رز ومندي',
      imageUrl: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=200&q=60',
    ),
  ];

  // ── صور ──
  static const _burgerImg =
      'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=70';
  static const _smashImg = 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=800&q=70';
  static const _friesImg =
      'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=800&q=70';
  static const _juiceImg =
      'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=800&q=70';
  static const _restaurantImg =
      'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=800&q=70';
  static const _pizzaImg =
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=70';
  static const _shawarmaImg =
      'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=800&q=70';
  static const _riceImg = 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=800&q=70';
  static const _dessertImg = 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=800&q=70';
  static const _oldBurgerImg =
      'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=800&q=70';

  // ── مجموعات خيارات مشتركة ──
  static const _sizeGroup = OptionGroup(
    id: 'size',
    name: 'الحجم',
    isRequired: true,
    options: [
      ItemOption(id: 'size_m', name: 'وسط'),
      ItemOption(id: 'size_l', name: 'كبير', extraPrice: 6),
    ],
  );

  static const _extrasGroup = OptionGroup(
    id: 'extras',
    name: 'إضافات',
    maxSelections: 3,
    options: [
      ItemOption(id: 'cheese', name: 'جبنة إضافية', extraPrice: 4),
      ItemOption(id: 'onion', name: 'حلقات بصل مقرمشة', extraPrice: 5),
      ItemOption(id: 'hot', name: 'صوص حار'),
    ],
  );

  static const _drinkSizeGroup = OptionGroup(
    id: 'drink_size',
    name: 'الحجم',
    isRequired: true,
    options: [
      ItemOption(id: 'd_m', name: 'وسط'),
      ItemOption(id: 'd_l', name: 'كبير', extraPrice: 3),
    ],
  );

  // ── المطاعم ──
  static final restaurants = <Restaurant>[
    const Restaurant(
      id: 'burger_lab',
      name: 'Burger Lab',
      cuisine: 'برجر · أمريكي',
      coverUrl: _restaurantImg,
      rating: 4.8,
      ratingCount: 1240,
      distanceKm: 1.2,
      etaMinMinutes: 25,
      etaMaxMinutes: 35,
      deliveryFee: 5,
      minOrder: 20,
      discountPercent: 30,
      badge: 'الأكثر طلباً',
      categoryIds: ['burger'],
      sections: [
        MenuSection(
          id: 'popular',
          name: 'الأكثر طلباً',
          items: [
            MenuItem(
              id: 'bl_cheese',
              restaurantId: 'burger_lab',
              name: 'تشيز برجر دبل',
              description:
                  'لحم واجيو مشوي على الفحم، جبنة شيدر ذائبة، خس، طماطم، وصوص المطعم الخاص',
              imageUrl: _burgerImg,
              price: 35,
              optionGroups: [_sizeGroup, _extrasGroup],
            ),
            MenuItem(
              id: 'bl_smash',
              restaurantId: 'burger_lab',
              name: 'سماش برجر كلاسيك',
              description: 'قطعتين سماش، بصل مكرمل، مخلل، وصوص السماش',
              imageUrl: _smashImg,
              price: 27,
              oldPrice: 34,
              optionGroups: [_sizeGroup, _extrasGroup],
            ),
            MenuItem(
              id: 'bl_fries',
              restaurantId: 'burger_lab',
              name: 'بطاطس ترافل',
              description: 'بارميزان وزيت الترافل',
              imageUrl: _friesImg,
              price: 18,
            ),
          ],
        ),
        MenuSection(
          id: 'burgers',
          name: 'برجر',
          items: [
            MenuItem(
              id: 'bl_classic',
              restaurantId: 'burger_lab',
              name: 'برجر كلاسيك',
              description: 'لحم بقري، خس، طماطم، صوص خاص',
              imageUrl: _oldBurgerImg,
              price: 29,
              optionGroups: [_sizeGroup, _extrasGroup],
            ),
            MenuItem(
              id: 'bl_spicy',
              restaurantId: 'burger_lab',
              name: 'برجر حار',
              description: 'هالبينو، جبنة بيبر جاك، صوص شيبوتلي',
              imageUrl: _smashImg,
              price: 33,
              optionGroups: [_sizeGroup, _extrasGroup],
            ),
          ],
        ),
        MenuSection(
          id: 'sides',
          name: 'سايدز',
          items: [
            MenuItem(
              id: 'bl_rings',
              restaurantId: 'burger_lab',
              name: 'حلقات بصل',
              description: 'مقرمشة مع صوص الرانش',
              imageUrl: _friesImg,
              price: 15,
            ),
          ],
        ),
        MenuSection(
          id: 'drinks',
          name: 'مشروبات',
          items: [
            MenuItem(
              id: 'bl_juice',
              restaurantId: 'burger_lab',
              name: 'عصير برتقال فريش',
              description: 'معصور في نفس اللحظة',
              imageUrl: _juiceImg,
              price: 12,
              optionGroups: [_drinkSizeGroup],
            ),
          ],
        ),
      ],
    ),
    const Restaurant(
      id: 'smash_house',
      name: 'Smash House',
      cuisine: 'سماش برجر',
      coverUrl: _smashImg,
      rating: 4.6,
      ratingCount: 860,
      distanceKm: 2.1,
      etaMinMinutes: 20,
      etaMaxMinutes: 30,
      deliveryFee: 0,
      minOrder: 25,
      badge: 'توصيل مجاني',
      categoryIds: ['burger'],
      sections: [
        MenuSection(
          id: 'popular',
          name: 'الأكثر طلباً',
          items: [
            MenuItem(
              id: 'sh_double',
              restaurantId: 'smash_house',
              name: 'دبل سماش',
              description: 'قطعتين لحم، جبنة أمريكية، بصل',
              imageUrl: _smashImg,
              price: 32,
              optionGroups: [_extrasGroup],
            ),
            MenuItem(
              id: 'sh_fries',
              restaurantId: 'smash_house',
              name: 'بطاطس مقلية',
              description: 'مقرمشة بملح البحر',
              imageUrl: _friesImg,
              price: 12,
            ),
          ],
        ),
      ],
    ),
    const Restaurant(
      id: 'hara_burger',
      name: 'برجر الحارة',
      cuisine: 'برجر · ساندويتشات',
      coverUrl: _oldBurgerImg,
      rating: 4.4,
      ratingCount: 320,
      distanceKm: 3.4,
      etaMinMinutes: 28,
      etaMaxMinutes: 40,
      deliveryFee: 7,
      minOrder: 15,
      isOpen: false,
      opensAtLabel: 'يفتح 4:00 PM',
      categoryIds: ['burger'],
      sections: [
        MenuSection(
          id: 'popular',
          name: 'الأكثر طلباً',
          items: [
            MenuItem(
              id: 'hb_classic',
              restaurantId: 'hara_burger',
              name: 'برجر الحارة',
              description: 'الوصفة الأصلية',
              imageUrl: _oldBurgerImg,
              price: 24,
            ),
          ],
        ),
      ],
    ),
    const Restaurant(
      id: 'pizza_corner',
      name: 'Pizza Corner',
      cuisine: 'بيتزا · إيطالي',
      coverUrl: _pizzaImg,
      rating: 4.6,
      ratingCount: 640,
      distanceKm: 1.8,
      etaMinMinutes: 30,
      etaMaxMinutes: 40,
      deliveryFee: 5,
      minOrder: 30,
      categoryIds: ['pizza'],
      sections: [
        MenuSection(
          id: 'popular',
          name: 'الأكثر طلباً',
          items: [
            MenuItem(
              id: 'pc_margherita',
              restaurantId: 'pizza_corner',
              name: 'مارجريتا',
              description: 'صوص طماطم، موتزاريلا، ريحان',
              imageUrl: _pizzaImg,
              price: 38,
              optionGroups: [_sizeGroup],
            ),
            MenuItem(
              id: 'pc_pepperoni',
              restaurantId: 'pizza_corner',
              name: 'بيبروني',
              description: 'بيبروني مزدوج وجبنة',
              imageUrl: _pizzaImg,
              price: 45,
              oldPrice: 52,
              optionGroups: [_sizeGroup],
            ),
          ],
        ),
      ],
    ),
    const Restaurant(
      id: 'shawarma_bait',
      name: 'شاورما البيت',
      cuisine: 'شاورما · مشويات',
      coverUrl: _shawarmaImg,
      rating: 4.7,
      ratingCount: 980,
      distanceKm: 0.9,
      etaMinMinutes: 20,
      etaMaxMinutes: 30,
      deliveryFee: 0,
      minOrder: 20,
      badge: 'توصيل مجاني',
      categoryIds: ['grill'],
      sections: [
        MenuSection(
          id: 'popular',
          name: 'الأكثر طلباً',
          items: [
            MenuItem(
              id: 'sb_chicken',
              restaurantId: 'shawarma_bait',
              name: 'شاورما دجاج عربي',
              description: 'خبز عربي، ثومية، مخلل',
              imageUrl: _shawarmaImg,
              price: 17,
              optionGroups: [_extrasGroup],
            ),
            MenuItem(
              id: 'sb_meat',
              restaurantId: 'shawarma_bait',
              name: 'شاورما لحم',
              description: 'صلصة طحينة وبقدونس',
              imageUrl: _shawarmaImg,
              price: 22,
            ),
          ],
        ),
      ],
    ),
    const Restaurant(
      id: 'bukhari',
      name: 'مذاق البخاري',
      cuisine: 'رز · مندي وبرياني',
      coverUrl: _riceImg,
      rating: 4.9,
      ratingCount: 1520,
      distanceKm: 2.6,
      etaMinMinutes: 30,
      etaMaxMinutes: 45,
      deliveryFee: 6,
      minOrder: 40,
      categoryIds: ['rice', 'grill'],
      sections: [
        MenuSection(
          id: 'popular',
          name: 'الأكثر طلباً',
          items: [
            MenuItem(
              id: 'bk_chicken',
              restaurantId: 'bukhari',
              name: 'رز بخاري دجاج',
              description: 'نص دجاجة على رز بخاري مع الشطة والسلطة',
              imageUrl: _riceImg,
              price: 38,
              optionGroups: [_sizeGroup],
            ),
          ],
        ),
      ],
    ),
    const Restaurant(
      id: 'hala_fruits',
      name: 'حلا وفاكهة',
      cuisine: 'حلويات · عصائر',
      coverUrl: _dessertImg,
      rating: 4.5,
      ratingCount: 410,
      distanceKm: 3.1,
      etaMinMinutes: 25,
      etaMaxMinutes: 35,
      deliveryFee: 5,
      minOrder: 15,
      categoryIds: ['dessert'],
      sections: [
        MenuSection(
          id: 'popular',
          name: 'الأكثر طلباً',
          items: [
            MenuItem(
              id: 'hf_cheesecake',
              restaurantId: 'hala_fruits',
              name: 'تشيز كيك توت',
              description: 'قاعدة بسكويت وتوت طازج',
              imageUrl: _dessertImg,
              price: 22,
            ),
          ],
        ),
      ],
    ),
  ];

  static Restaurant restaurantById(String id) =>
      restaurants.firstWhere((r) => r.id == id, orElse: () => restaurants.first);

  static MenuItem itemById(String restaurantId, String itemId) {
    final r = restaurantById(restaurantId);
    return r.allItems.firstWhere((i) => i.id == itemId, orElse: () => r.allItems.first);
  }

  // ── العناوين ──
  static const addresses = <Address>[
    Address(
      id: 'a1',
      label: AddressLabel.home,
      title: 'المنزل',
      details: 'حي النرجس، شارع العليا، فيلا 12',
      lat: 24.7736,
      lng: 46.6753,
      isDefault: true,
    ),
    Address(
      id: 'a2',
      label: AddressLabel.work,
      title: 'العمل',
      details: 'طريق الملك فهد، برج المملكة، الدور 14',
      lat: 24.7114,
      lng: 46.6745,
    ),
    Address(
      id: 'a3',
      label: AddressLabel.other,
      title: 'بيت الوالد',
      details: 'حي الملقا، شارع أنس بن مالك',
      lat: 24.8012,
      lng: 46.6231,
    ),
  ];

  // ── طرق الدفع ──
  static const paymentMethods = <PaymentMethod>[
    PaymentMethod(id: 'p1', type: PaymentType.mada, title: 'بطاقة مدى', last4: '4382'),
    PaymentMethod(id: 'p2', type: PaymentType.applePay, title: 'Apple Pay'),
    PaymentMethod(id: 'p3', type: PaymentType.card, title: 'فيزا', last4: '8821'),
    PaymentMethod(id: 'p4', type: PaymentType.cash, title: 'كاش عند الاستلام'),
    PaymentMethod(
      id: 'p5',
      type: PaymentType.wallet,
      title: 'محفظة قادر',
      subtitle: 'الرصيد: 42.50 ر.س',
    ),
  ];

  // ── الكوبونات ──
  static const coupons = <Coupon>[
    Coupon(
      code: 'QADIR20',
      title: 'QADIR20 — على كل المطاعم',
      subtitle: 'حد أقصى 15 ر.س · ينتهي بعد 3 أيام',
      badge: '20%',
      percent: 20,
    ),
    Coupon(
      code: 'FREEDEL',
      title: 'FREEDEL — أول 5 طلبات',
      subtitle: 'باقي 2 استخدام · بدون حد أدنى',
      badge: 'توصيل مجاني',
      freeDelivery: true,
    ),
    Coupon(
      code: 'WELCOME30',
      title: 'WELCOME30 — مستخدم',
      subtitle: 'تم استخدامه في طلب #QF-19822',
      badge: '30',
      isUsed: true,
    ),
  ];

  // ── الطلبات ──
  static final orders = <Order>[
    Order(
      id: 'o_active',
      number: '#QF-20492',
      restaurantId: 'shawarma_bait',
      restaurantName: 'شاورما البيت',
      restaurantImageUrl: _shawarmaImg,
      status: OrderStatus.onTheWay,
      lines: const [
        OrderLine(name: 'شاورما دجاج عربي', quantity: 2, lineTotal: 34),
      ],
      subtotal: 34,
      deliveryFee: 0,
      vat: 5.10,
      discount: 5.10,
      address: addresses[0],
      paymentLabel: 'مدى •••• 4382',
      placedAtLabel: 'اليوم 8:47 PM',
      etaLabel: '9:15 PM',
      captain: const Captain(
        name: 'محمد',
        rating: 4.9,
        vehicle: 'هوندا PCX',
        lat: 24.7186,
        lng: 46.6903,
      ),
    ),
    Order(
      id: 'o_20481',
      number: '#QF-20481',
      restaurantId: 'burger_lab',
      restaurantName: 'Burger Lab',
      restaurantImageUrl: _burgerImg,
      status: OrderStatus.delivered,
      lines: const [
        OrderLine(name: 'تشيز برجر دبل', quantity: 1, lineTotal: 39, optionsLabel: 'وسط + جبنة'),
        OrderLine(name: 'بطاطس ترافل', quantity: 1, lineTotal: 18),
      ],
      subtotal: 57,
      deliveryFee: 5,
      vat: 9.30,
      discount: 11.40,
      address: addresses[0],
      paymentLabel: 'مدى •••• 4382',
      placedAtLabel: 'أمس',
      deliveredAtLabel: 'اليوم 9:12 PM',
      couponCode: 'QADIR20',
      captain: const Captain(
        name: 'محمد',
        rating: 4.9,
        vehicle: 'هوندا PCX',
        lat: 24.7186,
        lng: 46.6903,
      ),
    ),
    Order(
      id: 'o_20455',
      number: '#QF-20455',
      restaurantId: 'bukhari',
      restaurantName: 'مذاق البخاري',
      restaurantImageUrl: _riceImg,
      status: OrderStatus.delivered,
      lines: const [
        OrderLine(name: 'رز بخاري دجاج', quantity: 2, lineTotal: 76),
      ],
      subtotal: 66,
      deliveryFee: 6,
      vat: 10.80,
      discount: 6.80,
      address: addresses[1],
      paymentLabel: 'كاش عند الاستلام',
      placedAtLabel: 'الثلاثاء',
      deliveredAtLabel: 'الثلاثاء 7:40 PM',
      rating: 5,
    ),
    Order(
      id: 'o_20399',
      number: '#QF-20399',
      restaurantId: 'hala_fruits',
      restaurantName: 'حلا وفاكهة',
      restaurantImageUrl: _dessertImg,
      status: OrderStatus.cancelled,
      lines: const [
        OrderLine(name: 'تشيز كيك توت', quantity: 1, lineTotal: 22),
      ],
      subtotal: 22,
      deliveryFee: 5,
      vat: 4.05,
      discount: 3.05,
      address: addresses[0],
      paymentLabel: 'مدى •••• 4382',
      placedAtLabel: 'الأحد',
    ),
  ];

  static Order orderById(String id) =>
      orders.firstWhere((o) => o.id == id, orElse: () => orders.first);

  // ── الإشعارات ──
  static const notifications = <AppNotification>[
    AppNotification(
      emoji: '🛵',
      title: 'كابتن محمد في الطريق إليك!',
      body: 'طلبك من شاورما البيت يوصل خلال 12 دقيقة',
      timeLabel: '9:03 PM',
      isUnread: true,
    ),
    AppNotification(
      emoji: '🎁',
      title: 'كوبون جديد وصلك 🎉',
      body: 'استخدم QADIR20 واحصل على خصم 20%',
      timeLabel: '2:40 PM',
      isUnread: true,
    ),
    AppNotification(
      emoji: '✓',
      title: 'تم توصيل طلبك بنجاح',
      body: 'Burger Lab — قيّم تجربتك واكسب 50 نقطة',
      timeLabel: '9:14 PM',
      isToday: false,
    ),
    AppNotification(
      emoji: '⭐',
      title: 'مبروك! وصلت لمستوى Gold',
      body: 'استمتع بمزايا حصرية وعروض أسبوعية',
      timeLabel: '11:02 AM',
      isToday: false,
    ),
  ];

  // ── الأسئلة الشائعة ──
  static const faqs = <String>[
    'وين طلبي؟ التتبع ما يتحدث',
    'وصلني طلب ناقص أو خاطئ',
    'كيف أسترجع مبلغ مدفوع؟',
    'كيف أستخدم الكوبونات؟',
    'تعديل أو إلغاء طلب',
  ];

  /// عمليات بحث شائعة (شاشة البحث).
  static const popularSearches = <String>['وجبة', 'مندي', 'قهوة مختصة', 'بيتزا'];
}
