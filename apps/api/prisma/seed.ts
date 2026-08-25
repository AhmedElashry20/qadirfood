import {
  PrismaClient,
  DocumentStatus,
  DocumentType,
  PayoutDestination,
  UserRole,
  MerchantRole,
  RestaurantStatus,
  OptionGroupType,
  VehicleType,
  CaptainStatus,
  TgaStatus,
  FaceCheckStatus,
  TicketStatus,
  TicketCategory,
  TicketPriority,
  TicketSenderRole,
  PaymentMethod,
  PaymentStatus,
  OrderStatus,
  WalletEntryType,
  RefundLiability,
  RefundStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/** الإحداثيات بترتيب (lng, lat) في PostGIS. */
async function setPoint(table: string, column: string, id: string, lat: number, lng: number) {
  await prisma.$executeRawUnsafe(
    `UPDATE "${table}" SET "${column}" = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography WHERE id = $3`,
    lng,
    lat,
    id,
  );
}

// ──────────────────────────────────────────────────────────────
// الصور — نفس روابط Unsplash المستخدمة في apps/customer_app/lib/data/mock_data.dart
// ──────────────────────────────────────────────────────────────
const IMG = {
  burger: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&q=70',
  smash: 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=800&q=70',
  fries: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=800&q=70',
  juice: 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=800&q=70',
  restaurant: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?w=800&q=70',
  pizza: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=800&q=70',
  shawarma: 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=800&q=70',
  rice: 'https://images.unsplash.com/photo-1512058564366-18510be2db19?w=800&q=70',
  dessert: 'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=800&q=70',
  oldBurger: 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=800&q=70',
} as const;

// ──────────────────────────────────────────────────────────────
// أنواع تعريف المنيو (بتتحوّل لـ nested create في Prisma)
// ──────────────────────────────────────────────────────────────
type OptionDef = { nameAr: string; nameEn: string; extraPrice?: number };
type GroupDef = {
  nameAr: string;
  nameEn: string;
  type: OptionGroupType;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  options: OptionDef[];
};
type ItemDef = {
  nameAr: string;
  nameEn: string;
  descriptionAr?: string;
  imageUrl: string;
  price: number;
  calories?: number;
  groups?: GroupDef[];
};
type CategoryDef = { nameAr: string; nameEn: string; items: ItemDef[] };
type RestaurantDef = {
  key: string;
  nameAr: string;
  nameEn: string;
  cuisineAr: string;
  cuisineEn: string;
  descriptionAr: string;
  imageUrl: string; // logo + cover
  contactPhone: string;
  branch: {
    nameAr: string;
    nameEn: string;
    address: string;
    lat: number;
    lng: number;
    avgPrepMinutes: number;
    deliveryFee: number;
    minOrderTotal: number;
    deliveryRadiusKm: number;
    rating: number;
    ratingCount: number;
  };
  categories: CategoryDef[];
};

/** «الحجم» — مجموعة إجبارية باختيار واحد. */
const sizeGroup = (): GroupDef => ({
  nameAr: 'الحجم',
  nameEn: 'Size',
  type: OptionGroupType.SINGLE,
  isRequired: true,
  minSelect: 1,
  maxSelect: 1,
  options: [
    { nameAr: 'وسط', nameEn: 'Medium', extraPrice: 0 },
    { nameAr: 'كبير', nameEn: 'Large', extraPrice: 6 },
  ],
});

/** «إضافات» — مجموعة اختيارية متعددة (٣ كحد أقصى). */
const extrasGroup = (): GroupDef => ({
  nameAr: 'إضافات',
  nameEn: 'Add-ons',
  type: OptionGroupType.MULTI,
  isRequired: false,
  minSelect: 0,
  maxSelect: 3,
  options: [
    { nameAr: 'جبنة إضافية', nameEn: 'Extra Cheese', extraPrice: 4 },
    { nameAr: 'حلقات بصل مقرمشة', nameEn: 'Crispy Onion Rings', extraPrice: 5 },
    { nameAr: 'صوص حار', nameEn: 'Hot Sauce', extraPrice: 0 },
  ],
});

/** «الحجم» للمشروبات — كبير +٣. */
const drinkSizeGroup = (): GroupDef => ({
  nameAr: 'الحجم',
  nameEn: 'Size',
  type: OptionGroupType.SINGLE,
  isRequired: true,
  minSelect: 1,
  maxSelect: 1,
  options: [
    { nameAr: 'وسط', nameEn: 'Medium', extraPrice: 0 },
    { nameAr: 'كبير', nameEn: 'Large', extraPrice: 3 },
  ],
});

/** «إضافات» الحلويات — نفس البنية (متعدد، ٣ كحد أقصى) بس بإضافات مناسبة. */
const dessertExtrasGroup = (): GroupDef => ({
  nameAr: 'إضافات',
  nameEn: 'Add-ons',
  type: OptionGroupType.MULTI,
  isRequired: false,
  minSelect: 0,
  maxSelect: 3,
  options: [
    { nameAr: 'توت طازج إضافي', nameEn: 'Extra Fresh Berries', extraPrice: 5 },
    { nameAr: 'صوص شوكولاتة', nameEn: 'Chocolate Sauce', extraPrice: 4 },
    { nameAr: 'كرة آيس كريم', nameEn: 'Ice Cream Scoop', extraPrice: 0 },
  ],
});

// نقطة عنوان العميل الأول (0555555555): 24.7180, 46.6790 —
// كل الفروع تحت على بُعد ~١ إلى ~٣ كم منها عشان تظهر في /nearby.
const RESTAURANTS: RestaurantDef[] = [
  {
    key: 'burger_lab',
    nameAr: 'برجر لاب',
    nameEn: 'Burger Lab',
    cuisineAr: 'برجر · أمريكي',
    cuisineEn: 'Burgers · American',
    descriptionAr: 'برجر واجيو مشوي على الفحم وصوصات خاصة',
    imageUrl: IMG.restaurant,
    contactPhone: '0112000001',
    branch: {
      nameAr: 'فرع التحلية',
      nameEn: 'Tahlia Branch',
      address: 'شارع التحلية، حي العليا',
      lat: 24.7261, // ≈ ١٫٢ كم من عنوان العميل
      lng: 46.6869,
      avgPrepMinutes: 25,
      deliveryFee: 5,
      minOrderTotal: 20,
      deliveryRadiusKm: 8,
      rating: 4.8,
      ratingCount: 1240,
    },
    categories: [
      {
        nameAr: 'الأكثر طلباً',
        nameEn: 'Most Popular',
        items: [
          {
            nameAr: 'تشيز برجر دبل',
            nameEn: 'Double Cheeseburger',
            descriptionAr: 'لحم واجيو مشوي على الفحم، جبنة شيدر ذائبة، خس، طماطم، وصوص المطعم الخاص',
            imageUrl: IMG.burger,
            price: 35,
            calories: 780,
            groups: [sizeGroup(), extrasGroup()],
          },
          {
            nameAr: 'سماش برجر كلاسيك',
            nameEn: 'Classic Smash Burger',
            descriptionAr: 'قطعتين سماش، بصل مكرمل، مخلل، وصوص السماش',
            imageUrl: IMG.smash,
            price: 27,
            calories: 640,
            groups: [sizeGroup(), extrasGroup()],
          },
          {
            nameAr: 'بطاطس ترافل',
            nameEn: 'Truffle Fries',
            descriptionAr: 'بارميزان وزيت الترافل',
            imageUrl: IMG.fries,
            price: 18,
            calories: 420,
          },
        ],
      },
      {
        nameAr: 'برجر',
        nameEn: 'Burgers',
        items: [
          {
            nameAr: 'برجر كلاسيك',
            nameEn: 'Classic Burger',
            descriptionAr: 'لحم بقري، خس، طماطم، صوص خاص',
            imageUrl: IMG.oldBurger,
            price: 29,
            calories: 610,
            groups: [sizeGroup(), extrasGroup()],
          },
          {
            nameAr: 'برجر حار',
            nameEn: 'Spicy Burger',
            descriptionAr: 'هالبينو، جبنة بيبر جاك، صوص شيبوتلي',
            imageUrl: IMG.smash,
            price: 33,
            calories: 700,
            groups: [sizeGroup(), extrasGroup()],
          },
        ],
      },
      {
        nameAr: 'سايدز',
        nameEn: 'Sides',
        items: [
          {
            nameAr: 'حلقات بصل',
            nameEn: 'Onion Rings',
            descriptionAr: 'مقرمشة مع صوص الرانش',
            imageUrl: IMG.fries,
            price: 15,
            calories: 380,
          },
        ],
      },
      {
        nameAr: 'مشروبات',
        nameEn: 'Drinks',
        items: [
          {
            nameAr: 'عصير برتقال فريش',
            nameEn: 'Fresh Orange Juice',
            descriptionAr: 'معصور في نفس اللحظة',
            imageUrl: IMG.juice,
            price: 12,
            calories: 110,
            groups: [drinkSizeGroup()],
          },
        ],
      },
    ],
  },
  {
    key: 'smash_house',
    nameAr: 'سماش هاوس',
    nameEn: 'Smash House',
    cuisineAr: 'سماش برجر',
    cuisineEn: 'Smash Burgers',
    descriptionAr: 'سماش برجر طازج — توصيل مجاني',
    imageUrl: IMG.smash,
    contactPhone: '0112000002',
    branch: {
      nameAr: 'فرع الملز',
      nameEn: 'Malaz Branch',
      address: 'طريق صلاح الدين، حي الملز',
      lat: 24.7315, // ≈ ٢٫١ كم
      lng: 46.6645,
      avgPrepMinutes: 20,
      deliveryFee: 0, // توصيل مجاني
      minOrderTotal: 25,
      deliveryRadiusKm: 7,
      rating: 4.6,
      ratingCount: 860,
    },
    categories: [
      {
        nameAr: 'الأكثر طلباً',
        nameEn: 'Most Popular',
        items: [
          {
            nameAr: 'دبل سماش',
            nameEn: 'Double Smash',
            descriptionAr: 'قطعتين لحم، جبنة أمريكية، بصل',
            imageUrl: IMG.smash,
            price: 32,
            calories: 720,
            groups: [sizeGroup(), extrasGroup()],
          },
          {
            nameAr: 'بطاطس مقلية',
            nameEn: 'French Fries',
            descriptionAr: 'مقرمشة بملح البحر',
            imageUrl: IMG.fries,
            price: 12,
            calories: 350,
          },
        ],
      },
      {
        nameAr: 'مشروبات',
        nameEn: 'Drinks',
        items: [
          {
            nameAr: 'عصير برتقال فريش',
            nameEn: 'Fresh Orange Juice',
            descriptionAr: 'معصور في نفس اللحظة',
            imageUrl: IMG.juice,
            price: 12,
            calories: 110,
            groups: [drinkSizeGroup()],
          },
        ],
      },
    ],
  },
  {
    key: 'pizza_corner',
    nameAr: 'بيتزا كورنر',
    nameEn: 'Pizza Corner',
    cuisineAr: 'بيتزا · إيطالي',
    cuisineEn: 'Pizza · Italian',
    descriptionAr: 'بيتزا إيطالية في فرن الحطب',
    imageUrl: IMG.pizza,
    contactPhone: '0112000003',
    branch: {
      nameAr: 'فرع السليمانية',
      nameEn: 'Sulaimaniyah Branch',
      address: 'شارع الأمير سلطان، حي السليمانية',
      lat: 24.7072, // ≈ ١٫٨ كم
      lng: 46.6923,
      avgPrepMinutes: 30,
      deliveryFee: 5,
      minOrderTotal: 30,
      deliveryRadiusKm: 8,
      rating: 4.6,
      ratingCount: 640,
    },
    categories: [
      {
        nameAr: 'الأكثر طلباً',
        nameEn: 'Most Popular',
        items: [
          {
            nameAr: 'مارجريتا',
            nameEn: 'Margherita',
            descriptionAr: 'صوص طماطم، موتزاريلا، ريحان',
            imageUrl: IMG.pizza,
            price: 38,
            calories: 820,
            groups: [sizeGroup(), extrasGroup()],
          },
          {
            nameAr: 'بيبروني',
            nameEn: 'Pepperoni',
            descriptionAr: 'بيبروني مزدوج وجبنة',
            imageUrl: IMG.pizza,
            price: 45,
            calories: 940,
            groups: [sizeGroup(), extrasGroup()],
          },
        ],
      },
      {
        nameAr: 'مشروبات',
        nameEn: 'Drinks',
        items: [
          {
            nameAr: 'عصير برتقال فريش',
            nameEn: 'Fresh Orange Juice',
            descriptionAr: 'معصور في نفس اللحظة',
            imageUrl: IMG.juice,
            price: 12,
            calories: 110,
            groups: [drinkSizeGroup()],
          },
        ],
      },
    ],
  },
  {
    key: 'shawarma_bait',
    nameAr: 'شاورما البيت',
    nameEn: 'Shawarma Al Bait',
    cuisineAr: 'شاورما · مشويات',
    cuisineEn: 'Shawarma · Grills',
    descriptionAr: 'شاورما على الفحم بخبز عربي — توصيل مجاني',
    imageUrl: IMG.shawarma,
    contactPhone: '0112000004',
    branch: {
      nameAr: 'فرع العليا',
      nameEn: 'Olaya Branch',
      address: 'شارع العليا العام، حي العليا',
      lat: 24.7094, // ≈ ١ كم — أقرب فرع للعميل
      lng: 46.6825,
      avgPrepMinutes: 20,
      deliveryFee: 0, // توصيل مجاني
      minOrderTotal: 20,
      deliveryRadiusKm: 6,
      rating: 4.7,
      ratingCount: 980,
    },
    categories: [
      {
        nameAr: 'الأكثر طلباً',
        nameEn: 'Most Popular',
        items: [
          {
            nameAr: 'شاورما دجاج عربي',
            nameEn: 'Arabic Chicken Shawarma',
            descriptionAr: 'خبز عربي، ثومية، مخلل',
            imageUrl: IMG.shawarma,
            price: 17,
            calories: 460,
            groups: [sizeGroup(), extrasGroup()],
          },
          {
            nameAr: 'شاورما لحم',
            nameEn: 'Beef Shawarma',
            descriptionAr: 'صلصة طحينة وبقدونس',
            imageUrl: IMG.shawarma,
            price: 22,
            calories: 520,
          },
        ],
      },
      {
        nameAr: 'سايدز',
        nameEn: 'Sides',
        items: [
          {
            nameAr: 'بطاطس مقلية',
            nameEn: 'French Fries',
            descriptionAr: 'مقرمشة بملح البحر',
            imageUrl: IMG.fries,
            price: 10,
            calories: 350,
          },
        ],
      },
    ],
  },
  {
    key: 'bukhari',
    nameAr: 'مذاق البخاري',
    nameEn: 'Bukhari Taste',
    cuisineAr: 'رز · مندي وبرياني',
    cuisineEn: 'Rice · Mandi & Biryani',
    descriptionAr: 'رز بخاري ومندي على أصوله',
    imageUrl: IMG.rice,
    contactPhone: '0112000005',
    branch: {
      nameAr: 'فرع الروضة',
      nameEn: 'Rawdah Branch',
      address: 'شارع خالد بن الوليد، حي الروضة',
      lat: 24.7018, // ≈ ٢٫٦ كم
      lng: 46.6604,
      avgPrepMinutes: 30,
      deliveryFee: 6,
      minOrderTotal: 40,
      deliveryRadiusKm: 9,
      rating: 4.9,
      ratingCount: 1520,
    },
    categories: [
      {
        nameAr: 'الأكثر طلباً',
        nameEn: 'Most Popular',
        items: [
          {
            nameAr: 'رز بخاري دجاج',
            nameEn: 'Chicken Bukhari Rice',
            descriptionAr: 'نص دجاجة على رز بخاري مع الشطة والسلطة',
            imageUrl: IMG.rice,
            price: 38,
            calories: 890,
            groups: [sizeGroup(), extrasGroup()],
          },
          {
            nameAr: 'برياني لحم',
            nameEn: 'Lamb Biryani',
            descriptionAr: 'رز بسمتي بالبهارات الهندية ولحم ضاني',
            imageUrl: IMG.rice,
            price: 45,
            calories: 950,
          },
        ],
      },
      {
        nameAr: 'مشروبات',
        nameEn: 'Drinks',
        items: [
          {
            nameAr: 'عصير برتقال فريش',
            nameEn: 'Fresh Orange Juice',
            descriptionAr: 'معصور في نفس اللحظة',
            imageUrl: IMG.juice,
            price: 12,
            calories: 110,
            groups: [drinkSizeGroup()],
          },
        ],
      },
    ],
  },
  {
    key: 'hala_fruits',
    nameAr: 'حلا وفاكهة',
    nameEn: 'Hala & Fruits',
    cuisineAr: 'حلويات · عصائر',
    cuisineEn: 'Desserts · Juices',
    descriptionAr: 'حلويات طازجة وعصائر طبيعية',
    imageUrl: IMG.dessert,
    contactPhone: '0112000006',
    branch: {
      nameAr: 'فرع النخيل',
      nameEn: 'Nakheel Branch',
      address: 'طريق الملك عبدالعزيز، حي النخيل',
      lat: 24.7432, // ≈ ٣٫١ كم
      lng: 46.6922,
      avgPrepMinutes: 25,
      deliveryFee: 5,
      minOrderTotal: 15,
      deliveryRadiusKm: 7,
      rating: 4.5,
      ratingCount: 410,
    },
    categories: [
      {
        nameAr: 'الأكثر طلباً',
        nameEn: 'Most Popular',
        items: [
          {
            nameAr: 'تشيز كيك توت',
            nameEn: 'Berry Cheesecake',
            descriptionAr: 'قاعدة بسكويت وتوت طازج',
            imageUrl: IMG.dessert,
            price: 22,
            calories: 430,
            // إجباري (الحجم) + اختياري متعدد (إضافات) — عشان واجهة الخيارات تتجرّب
            groups: [sizeGroup(), dessertExtrasGroup()],
          },
        ],
      },
      {
        nameAr: 'عصائر',
        nameEn: 'Juices',
        items: [
          {
            nameAr: 'عصير برتقال فريش',
            nameEn: 'Fresh Orange Juice',
            descriptionAr: 'معصور في نفس اللحظة',
            imageUrl: IMG.juice,
            price: 12,
            calories: 110,
            groups: [drinkSizeGroup()],
          },
        ],
      },
    ],
  },
];

async function main() {
  console.log('🌱 جاري تجهيز البيانات التجريبية…');

  // نظّف كل حاجة (الترتيب مهم بسبب المفاتيح الأجنبية)
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE face_checks, zones, ticket_messages, support_tickets, order_item_options, order_items, order_events, reviews,
      transactions, refunds, orders,
      options, option_groups, menu_items, menu_categories, working_hours, merchant_users,
      settlement_lines, settlements, restaurant_payout_accounts, branches, restaurants,
      captain_documents, wallet_transactions, withdrawal_requests, payout_methods, shifts,
      captain_distributions, company_settlement_lines, company_settlements, company_payout_accounts,
      company_users, companies, trip_offers, captains, favorites, addresses, customers, coupons,
      otp_codes, audit_logs, users RESTART IDENTITY CASCADE
  `);

  const password = await bcrypt.hash('123456', 10);

  // ── الأدمن ──
  const adminUser = await prisma.user.create({
    data: { phone: '0500000000', email: 'admin@delivery.sa', passwordHash: password, fullName: 'مدير المنصة', role: UserRole.ADMIN },
  });

  // أدمن تاني للمراجعة — عشان الموافقة المزدوجة على الاسترداد الكبير تبقى قابلة
  // للتجربة (فصل المهام: اللي طلب الاسترداد مايقدرش يوافق عليه).
  const reviewerUser = await prisma.user.create({
    data: { phone: '0500000009', email: 'reviewer@delivery.sa', passwordHash: password, fullName: 'مدير المراجعة', role: UserRole.ADMIN },
  });

  // ── المطعم وفروعه ──
  const restaurant = await prisma.restaurant.create({
    data: {
      nameAr: 'مطعم الأصيل',
      nameEn: 'Al Aseel Restaurant',
      cuisineAr: 'مأكولات شرقية · مشويات',
      cuisineEn: 'Oriental · Grills',
      descriptionAr: 'مأكولات شرقية أصيلة',
      logoUrl: IMG.rice,
      coverUrl: IMG.rice,
      contactPhone: '0112345678',
      commissionRate: 15,
    },
  });

  const riyadhCenter = { lat: 24.7136, lng: 46.6753 };

  const branch1 = await prisma.branch.create({
    data: {
      restaurantId: restaurant.id,
      nameAr: 'فرع العليا',
      nameEn: 'Olaya Branch',
      city: 'الرياض',
      address: 'شارع العليا العام',
      status: RestaurantStatus.OPEN,
      avgPrepMinutes: 20,
      deliveryRadiusKm: 8,
      deliveryFee: 10,
      minOrderTotal: 25,
      rating: 4.6,
      ratingCount: 512,
    },
  });
  await setPoint('branches', 'location', branch1.id, riyadhCenter.lat, riyadhCenter.lng);

  const branch2 = await prisma.branch.create({
    data: {
      restaurantId: restaurant.id,
      nameAr: 'فرع النخيل',
      nameEn: 'Nakheel Branch',
      city: 'الرياض',
      address: 'حي النخيل',
      status: RestaurantStatus.OPEN,
      avgPrepMinutes: 25,
      deliveryRadiusKm: 6,
      deliveryFee: 10,
      minOrderTotal: 25,
      rating: 4.4,
      ratingCount: 198,
    },
  });
  await setPoint('branches', 'location', branch2.id, 24.7500, 46.6300);

  // أوقات العمل — فترة صباحية ومسائية لكل يوم
  await prisma.workingHour.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].flatMap((weekday) => [
      { branchId: branch1.id, weekday, opensAt: '11:00', closesAt: '16:00' },
      { branchId: branch1.id, weekday, opensAt: '18:00', closesAt: '23:59' },
      { branchId: branch2.id, weekday, opensAt: '12:00', closesAt: '23:00' },
    ]),
  });

  // ── مستخدمي المطعم: مدير على الفرعين + كاشير على فرع واحد ──
  const managerUser = await prisma.user.create({
    data: { phone: '0511111111', email: 'manager@aseel.sa', passwordHash: password, fullName: 'أحمد المدير', role: UserRole.MERCHANT },
  });
  await prisma.merchantUser.createMany({
    data: [
      { userId: managerUser.id, branchId: branch1.id, role: MerchantRole.BRANCH_MANAGER },
      { userId: managerUser.id, branchId: branch2.id, role: MerchantRole.BRANCH_MANAGER },
    ],
  });

  const cashierUser = await prisma.user.create({
    data: { phone: '0522222222', email: 'cashier@aseel.sa', passwordHash: password, fullName: 'خالد الكاشير', role: UserRole.MERCHANT },
  });
  await prisma.merchantUser.create({
    data: { userId: cashierUser.id, branchId: branch1.id, role: MerchantRole.CASHIER },
  });

  // ── المنيو ──
  const [appetizers, mains, drinks] = await Promise.all([
    prisma.menuCategory.create({ data: { restaurantId: restaurant.id, nameAr: 'مقبلات', nameEn: 'Appetizers', sortOrder: 0 } }),
    prisma.menuCategory.create({ data: { restaurantId: restaurant.id, nameAr: 'أطباق رئيسية', nameEn: 'Main Dishes', sortOrder: 1 } }),
    prisma.menuCategory.create({ data: { restaurantId: restaurant.id, nameAr: 'مشروبات', nameEn: 'Drinks', sortOrder: 2 } }),
  ]);

  await prisma.menuItem.create({
    data: { categoryId: appetizers.id, nameAr: 'حمص بالطحينة', nameEn: 'Hummus', price: 15, calories: 320, sortOrder: 0 },
  });
  await prisma.menuItem.create({
    data: { categoryId: appetizers.id, nameAr: 'متبل', nameEn: 'Mutabbal', price: 15, calories: 280, sortOrder: 1 },
  });
  await prisma.menuItem.create({
    data: { categoryId: appetizers.id, nameAr: 'فتوش', nameEn: 'Fattoush', price: 18, calories: 210, sortOrder: 2 },
  });

  // طبق رئيسي بمجموعات خيارات: الحجم (إجباري، واحد) + الإضافات (اختياري، متعدد)
  const mandi = await prisma.menuItem.create({
    data: {
      categoryId: mains.id,
      nameAr: 'مندي لحم',
      nameEn: 'Lamb Mandi',
      descriptionAr: 'أرز بسمتي مع لحم ضاني مدخّن',
      imageUrl: IMG.rice,
      price: 45,
      calories: 850,
      sortOrder: 0,
      optionGroups: {
        create: [
          {
            nameAr: 'الحجم',
            nameEn: 'Size',
            type: OptionGroupType.SINGLE,
            isRequired: true,
            minSelect: 1,
            maxSelect: 1,
            sortOrder: 0,
            options: {
              create: [
                { nameAr: 'نص كيلو', nameEn: 'Half Kilo', extraPrice: 0, sortOrder: 0 },
                { nameAr: 'كيلو', nameEn: 'One Kilo', extraPrice: 35, sortOrder: 1 },
              ],
            },
          },
          {
            nameAr: 'إضافات',
            nameEn: 'Add-ons',
            type: OptionGroupType.MULTI,
            isRequired: false,
            minSelect: 0,
            maxSelect: 3,
            sortOrder: 1,
            options: {
              create: [
                { nameAr: 'صلصة حارة', nameEn: 'Hot Sauce', extraPrice: 3, sortOrder: 0 },
                { nameAr: 'سلطة', nameEn: 'Salad', extraPrice: 8, sortOrder: 1 },
                { nameAr: 'مكسرات', nameEn: 'Nuts', extraPrice: 5, sortOrder: 2 },
              ],
            },
          },
        ],
      },
    },
  });

  await prisma.menuItem.create({
    data: { categoryId: mains.id, nameAr: 'كبسة دجاج', nameEn: 'Chicken Kabsa', price: 38, calories: 720, sortOrder: 1 },
  });
  await prisma.menuItem.create({
    data: { categoryId: mains.id, nameAr: 'مشاوي مشكّلة', nameEn: 'Mixed Grill', price: 65, calories: 950, sortOrder: 2 },
  });
  await prisma.menuItem.create({
    data: { categoryId: drinks.id, nameAr: 'عصير برتقال طازج', nameEn: 'Fresh Orange Juice', price: 12, calories: 110, sortOrder: 0 },
  });
  await prisma.menuItem.create({
    data: { categoryId: drinks.id, nameAr: 'ماء', nameEn: 'Water', price: 3, calories: 0, sortOrder: 1 },
  });

  // ──────────────────────────────────────────────────────────────
  // ── مطاعم تطبيق العميل (نفس بيانات mock_data.dart) ──
  // ──────────────────────────────────────────────────────────────
  /** فروع المطاعم الجديدة مفهرسة بالـ key. */
  const branchByKey: Record<string, string> = {};
  const restaurantByKey: Record<string, string> = {};
  /** أصناف المنيو مفهرسة بـ `${key}:${nameAr}` — بنستخدمها في الطلبات تحت. */
  const itemByKey: Record<string, { id: string; nameAr: string; nameEn: string; price: number }> = {};

  for (const def of RESTAURANTS) {
    const r = await prisma.restaurant.create({
      data: {
        nameAr: def.nameAr,
        nameEn: def.nameEn,
        cuisineAr: def.cuisineAr,
        cuisineEn: def.cuisineEn,
        descriptionAr: def.descriptionAr,
        logoUrl: def.imageUrl,
        coverUrl: def.imageUrl,
        contactPhone: def.contactPhone,
        commissionRate: 15,
      },
    });

    const branch = await prisma.branch.create({
      data: {
        restaurantId: r.id,
        nameAr: def.branch.nameAr,
        nameEn: def.branch.nameEn,
        city: 'الرياض',
        address: def.branch.address,
        status: RestaurantStatus.OPEN,
        avgPrepMinutes: def.branch.avgPrepMinutes,
        deliveryRadiusKm: def.branch.deliveryRadiusKm,
        deliveryFee: def.branch.deliveryFee,
        minOrderTotal: def.branch.minOrderTotal,
        rating: def.branch.rating,
        ratingCount: def.branch.ratingCount,
      },
    });
    // PostGIS: لازم raw SQL — الأعمدة الجغرافية مش مدعومة في Prisma Client
    await setPoint('branches', 'location', branch.id, def.branch.lat, def.branch.lng);
    branchByKey[def.key] = branch.id;
    restaurantByKey[def.key] = r.id;

    // مفتوح من ١٠ صباحاً لـ ١١:٥٩ مساءً كل أيام الأسبوع
    await prisma.workingHour.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        branchId: branch.id,
        weekday,
        opensAt: '10:00',
        closesAt: '23:59',
      })),
    });

    for (const [ci, cat] of def.categories.entries()) {
      const category = await prisma.menuCategory.create({
        data: { restaurantId: r.id, nameAr: cat.nameAr, nameEn: cat.nameEn, sortOrder: ci },
      });

      for (const [ii, item] of cat.items.entries()) {
        const created = await prisma.menuItem.create({
          data: {
            categoryId: category.id,
            nameAr: item.nameAr,
            nameEn: item.nameEn,
            descriptionAr: item.descriptionAr,
            imageUrl: item.imageUrl,
            price: item.price,
            calories: item.calories,
            sortOrder: ii,
            optionGroups: {
              create: (item.groups ?? []).map((g, gi) => ({
                nameAr: g.nameAr,
                nameEn: g.nameEn,
                type: g.type,
                isRequired: g.isRequired,
                minSelect: g.minSelect,
                maxSelect: g.maxSelect,
                sortOrder: gi,
                options: {
                  create: g.options.map((o, oi) => ({
                    nameAr: o.nameAr,
                    nameEn: o.nameEn,
                    extraPrice: o.extraPrice ?? 0,
                    sortOrder: oi,
                  })),
                },
              })),
            },
          },
        });
        itemByKey[`${def.key}:${item.nameAr}`] = {
          id: created.id,
          nameAr: item.nameAr,
          nameEn: item.nameEn,
          price: item.price,
        };
      }
    }
  }

  // ── الكباتن ──
  const captainUser1 = await prisma.user.create({
    data: { phone: '0533333333', fullName: 'سعد الكابتن', role: UserRole.CAPTAIN },
  });
  const captain1 = await prisma.captain.create({
    data: {
      userId: captainUser1.id,
      nationalId: '1234567890',
      vehicleType: VehicleType.MOTORCYCLE,
      plateNumber: 'ABC 1234',
      // على رحلة فعلاً — عنده الطلب الجاري (ON_THE_WAY)، فحالته تبان صح على الخريطة.
      status: CaptainStatus.ON_TRIP,
      isVerified: true,
      faceVerifiedAt: new Date(),
      rating: 4.8,
      // هيئة النقل: بطاقة توصيل موثّقة سارية.
      tgaCardNumber: 'TGA-4471120',
      tgaCardExpiresAt: new Date(Date.now() + 400 * 86_400_000),
      tgaStatus: TgaStatus.VERIFIED,
      tgaCheckedAt: new Date(),
    },
  });
  await setPoint('captains', 'lastLocation', captain1.id, 24.7200, 46.6800);

  const captainUser2 = await prisma.user.create({
    data: { phone: '0544444444', fullName: 'فهد الكابتن', role: UserRole.CAPTAIN },
  });
  const captain2 = await prisma.captain.create({
    data: {
      userId: captainUser2.id,
      nationalId: '0987654321',
      vehicleType: VehicleType.CAR,
      plateNumber: 'XYZ 5678',
      status: CaptainStatus.OFFLINE,
      isVerified: true,
      rating: 4.5,
      // هيئة النقل: بطاقة التشغيل منتهية ⇒ ممنوع من التوزيع (نفس قصة وثائقه).
      tgaCardNumber: 'TGA-3320815',
      tgaCardExpiresAt: new Date(Date.now() - 30 * 86_400_000),
      tgaStatus: TgaStatus.EXPIRED,
      tgaCheckedAt: new Date(Date.now() - 30 * 86_400_000),
    },
  });
  await setPoint('captains', 'lastLocation', captain2.id, 24.7400, 46.6500);

  // كابتن تالت — وثائقه ناقصة عشان شاشة الالتزام يبان فيها الحالات كلها.
  const captainUser3 = await prisma.user.create({
    data: { phone: '0555111222', fullName: 'ماجد الكابتن', role: UserRole.CAPTAIN },
  });
  const captain3 = await prisma.captain.create({
    data: {
      userId: captainUser3.id,
      nationalId: '1122334455',
      vehicleType: VehicleType.MOTORCYCLE,
      plateNumber: 'JKL 9012',
      status: CaptainStatus.OFFLINE,
      isVerified: false,
      rating: 4.2,
      // هيئة النقل: بطاقة اترفعت ومستنية تحقّق (لسه بيتفعّل).
      tgaCardNumber: 'TGA-5567402',
      tgaCardExpiresAt: new Date(Date.now() + 300 * 86_400_000),
      tgaStatus: TgaStatus.PENDING,
    },
  });
  await setPoint('captains', 'lastLocation', captain3.id, 24.7300, 46.6900);

  // كباتن إضافيين أونلاين حوالين الرياض — عشان الخريطة الحيّة تبان مليانة.
  // بياناتهم كاملة (وثائق معتمدة) فينفع التوزيع يعرض عليهم كمان.
  const mapCaptains = [
    { name: 'تركي المندوب', phone: '0561000001', plate: 'AAA 1111', lat: 24.7255, lng: 46.6720, v: VehicleType.MOTORCYCLE, tgaExpDays: 420 },
    { name: 'عمر المندوب', phone: '0561000002', plate: 'BBB 2222', lat: 24.7120, lng: 46.6650, v: VehicleType.CAR, tgaExpDays: 365 },
    { name: 'سالم المندوب', phone: '0561000003', plate: 'CCC 3333', lat: 24.7350, lng: 46.6810, v: VehicleType.MOTORCYCLE, tgaExpDays: 500 },
    // بدر بطاقته قربت تنتهي (٢٥ يوم) — عشان تبان حالة «قرب الانتهاء» في اللوحة.
    { name: 'بدر المندوب', phone: '0561000004', plate: 'DDD 4444', lat: 24.7060, lng: 46.6900, v: VehicleType.MOTORCYCLE, tgaExpDays: 25 },
    { name: 'ناصر المندوب', phone: '0561000005', plate: 'EEE 5555', lat: 24.7410, lng: 46.6580, v: VehicleType.CAR, tgaExpDays: 300 },
  ];
  let mapNat = 5000000001;
  let mapTga = 6100200;
  for (const mc of mapCaptains) {
    const u = await prisma.user.create({ data: { phone: mc.phone, fullName: mc.name, role: UserRole.CAPTAIN } });
    const c = await prisma.captain.create({
      data: {
        userId: u.id,
        nationalId: String(mapNat++),
        vehicleType: mc.v,
        plateNumber: mc.plate,
        status: CaptainStatus.ONLINE,
        isVerified: true,
        rating: 4.7,
        lastSeenAt: new Date(),
        // هيئة النقل: بطاقات توصيل موثّقة سارية (فريق شغّال أونلاين).
        tgaCardNumber: `TGA-${mapTga++}`,
        tgaCardExpiresAt: new Date(Date.now() + mc.tgaExpDays * 86_400_000),
        tgaStatus: TgaStatus.VERIFIED,
        tgaCheckedAt: new Date(),
      },
    });
    await setPoint('captains', 'lastLocation', c.id, mc.lat, mc.lng);
    // وثائق معتمدة سارية عشان يبقوا مؤهلين للتوزيع
    for (const t of [DocumentType.IDENTITY, DocumentType.LICENSE, DocumentType.VEHICLE_REG, DocumentType.INSURANCE]) {
      await prisma.captainDocument.create({
        data: { captainId: c.id, type: t, fileUrl: '/uploads/documents/seed-placeholder.png', status: DocumentStatus.APPROVED, expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), reviewedAt: new Date() },
      });
    }
  }

  // ── شركات الأسطول ومناديبها ──
  // شركة «سرعة» ليها كابتنين، وشركة «نخبة» موقوفة (عشان تبان الحالتين).
  // الكابتن التالت بيفضل مستقل (بدون شركة) — عشان يبان إن الموديل بيدعم الاتنين.
  const companySaraa = await prisma.company.create({
    data: { nameAr: 'سرعة للتوصيل', nameEn: 'Suraa Delivery', contactPhone: '0112500100', commissionRate: 10 },
  });
  const companyNokhba = await prisma.company.create({
    data: { nameAr: 'نخبة اللوجستية', nameEn: 'Nokhba Logistics', contactPhone: '0112500200', commissionRate: 12, status: 'SUSPENDED' },
  });
  // سعد تابع لشركة «سرعة» ⇒ مستحقاته بتروح لتسوية الشركة مش محفظته.
  // فهد وماجد مستقلين ⇒ محفظة مباشرة (عشان مسار المحفظة/السحب يفضل قابل للتجربة).
  await prisma.captain.update({ where: { id: captain1.id }, data: { companyId: companySaraa.id } });

  // مستخدم لوحة لشركة «سرعة» — الدخول بإيميل/كلمة مرور زي المطعم.
  await prisma.user.create({
    data: {
      phone: '0553330001',
      email: 'ops@suraa.sa',
      passwordHash: password,
      fullName: 'مشغّل سرعة',
      role: UserRole.COMPANY,
      companiesOf: { create: { companyId: companySaraa.id } },
    },
  });

  // ── وثائق الكباتن ──
  // كل حالة ممكنة موجودة عشان لوحة الالتزام تتجرّب من غير ما حد يرفع يدوي:
  // معتمدة سارية · معتمدة قربت تنتهي · معتمدة منتهية · تحت المراجعة · مرفوضة · ناقصة.
  const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const docFile = '/uploads/documents/seed-placeholder.png';

  const documentSeed: {
    captainId: string;
    type: DocumentType;
    status: DocumentStatus;
    expiresAt?: Date;
    rejectReason?: string;
  }[] = [
    // سعد — سليم تماماً، بس التأمين قرب ينتهي
    { captainId: captain1.id, type: DocumentType.IDENTITY, status: DocumentStatus.APPROVED, expiresAt: inDays(400) },
    { captainId: captain1.id, type: DocumentType.LICENSE, status: DocumentStatus.APPROVED, expiresAt: inDays(200) },
    { captainId: captain1.id, type: DocumentType.VEHICLE_REG, status: DocumentStatus.APPROVED, expiresAt: inDays(310) },
    { captainId: captain1.id, type: DocumentType.INSURANCE, status: DocumentStatus.APPROVED, expiresAt: inDays(18) },
    { captainId: captain1.id, type: DocumentType.PHOTO, status: DocumentStatus.APPROVED },

    // فهد — بطاقة التشغيل منتهية ⇒ ممنوع من التوزيع
    { captainId: captain2.id, type: DocumentType.IDENTITY, status: DocumentStatus.APPROVED, expiresAt: inDays(-5) },
    { captainId: captain2.id, type: DocumentType.LICENSE, status: DocumentStatus.APPROVED, expiresAt: inDays(150) },
    { captainId: captain2.id, type: DocumentType.VEHICLE_REG, status: DocumentStatus.APPROVED, expiresAt: inDays(90) },
    { captainId: captain2.id, type: DocumentType.INSURANCE, status: DocumentStatus.APPROVED, expiresAt: inDays(60) },

    // ماجد — لسه بيتفعّل: وحدة تحت المراجعة، وحدة مرفوضة، والباقي ناقص
    { captainId: captain3.id, type: DocumentType.IDENTITY, status: DocumentStatus.PENDING },
    {
      captainId: captain3.id,
      type: DocumentType.LICENSE,
      status: DocumentStatus.REJECTED,
      rejectReason: 'الصورة غير واضحة — أعد الرفع',
    },
  ];

  for (const doc of documentSeed) {
    await prisma.captainDocument.create({
      data: {
        captainId: doc.captainId,
        type: doc.type,
        fileUrl: docFile,
        status: doc.status,
        expiresAt: doc.expiresAt ?? null,
        rejectReason: doc.rejectReason ?? null,
        reviewedAt:
          doc.status === DocumentStatus.APPROVED || doc.status === DocumentStatus.REJECTED
            ? new Date()
            : null,
      },
    });
  }

  // فهد وثيقته منتهية ⇒ لازم يبقى غير موثّق عشان التوزيع يستبعده.
  await prisma.captain.update({ where: { id: captain2.id }, data: { isVerified: false } });

  // ── حسابات الاستلام وطلبات السحب ──
  // ملاحظة: دفتر المحفظة نفسه بيتكتب في آخر الـ seed بعد ما الطلبات المسلّمة تتعمل،
  // عشان الرصيد يطلع من مستحقات حقيقية مش رقم مكتوب بالإيد.
  await prisma.payoutMethod.create({
    data: {
      captainId: captain1.id,
      destination: PayoutDestination.BANK,
      label: 'البنك الأهلي السعودي',
      accountRef: 'SA0380000000608010167519',
      isDefault: true,
    },
  });
  await prisma.payoutMethod.create({
    data: {
      captainId: captain2.id,
      destination: PayoutDestination.STC_PAY,
      label: 'stc pay',
      accountRef: '0544444444',
      isDefault: true,
    },
  });

  // طلب سحب معلّق عشان لوحة «المحافظ والسحب» يبان فيها صف حقيقي.
  await prisma.withdrawalRequest.create({
    data: {
      captainId: captain2.id,
      amount: '120.00',
      destination: PayoutDestination.STC_PAY,
      destinationRef: '0544444444',
    },
  });

  // ── العملاء وعناوينهم ──
  const customers: { customerId: string; addressId: string }[] = [];
  const customerSeed = [
    // رقم الديمو — أول واحد عشان ياخد الطلب الجاري والمفضلة وسجل الطلبات.
    { phone: '0575420596', name: 'أحمد الأشرف', lat: 24.7180, lng: 46.6790, district: 'العليا' },
    { phone: '0555555555', name: 'محمد العميل', lat: 24.7180, lng: 46.6790, district: 'العليا' },
    { phone: '0566666666', name: 'نورة العميلة', lat: 24.7300, lng: 46.6600, district: 'الملز' },
    { phone: '0577777777', name: 'عبدالله العميل', lat: 24.7050, lng: 46.6850, district: 'السليمانية' },
  ];

  for (const c of customerSeed) {
    const user = await prisma.user.create({
      data: { phone: c.phone, fullName: c.name, role: UserRole.CUSTOMER, customer: { create: {} } },
      include: { customer: true },
    });
    const address = await prisma.address.create({
      data: {
        customerId: user.customer!.id,
        label: 'البيت',
        city: 'الرياض',
        district: c.district,
        street: 'شارع ١٥',
        building: 'عمارة ٤',
        notes: 'الدور الثالث، شقة ٧',
        isDefault: true,
      },
    });
    await setPoint('addresses', 'location', address.id, c.lat, c.lng);
    customers.push({ customerId: user.customer!.id, addressId: address.id });
  }

  // عنوان تاني (الشغل) للعميل الأول — عشان شاشة اختيار العنوان يبان فيها أكتر من خيار
  const workAddress = await prisma.address.create({
    data: {
      customerId: customers[0].customerId,
      label: 'الشغل',
      city: 'الرياض',
      district: 'العليا',
      street: 'طريق الملك فهد',
      building: 'برج المملكة، الدور ١٤',
      isDefault: false,
    },
  });
  await setPoint('addresses', 'location', workAddress.id, 24.7114, 46.6745);

  // ── المفضلة ──
  await prisma.favorite.createMany({
    data: [
      { customerId: customers[0].customerId, branchId: branchByKey['burger_lab'] },
      { customerId: customers[0].customerId, branchId: branchByKey['shawarma_bait'] },
    ],
  });

  // ── الكوبونات ──
  const in3Days = new Date(Date.now() + 3 * 24 * 3600e3);

  await prisma.coupon.create({
    data: {
      code: 'WELCOME20',
      descriptionAr: 'خصم ٢٠٪ لأول طلب',
      percentOff: 20,
      maxDiscount: 30,
      minOrderTotal: 50,
      usageLimit: 1000,
      isActive: true,
    },
  });

  const qadir20 = await prisma.coupon.create({
    data: {
      code: 'QADIR20',
      descriptionAr: 'خصم ٢٠٪ على كل المطاعم — حد أقصى ١٥ ر.س',
      percentOff: 20,
      maxDiscount: 15,
      minOrderTotal: 0,
      usageLimit: 1000,
      expiresAt: in3Days,
      isActive: true,
    },
  });

  await prisma.coupon.create({
    data: {
      code: 'FREEDEL',
      descriptionAr: 'توصيل مجاني على أول 5 طلبات',
      amountOff: 5, // = رسوم التوصيل الشائعة
      minOrderTotal: 0,
      usageLimit: 5,
      usedCount: 3,
      isActive: true,
    },
  });

  // ── طلبات في حالات مختلفة (مطعم الأصيل — تطبيق المطعم) ──
  const mkOrder = async (
    idx: number,
    status: OrderStatus,
    captainId?: string,
    extra: Record<string, unknown> = {},
  ) => {
    const c = customers[idx % customers.length];
    const order = await prisma.order.create({
      data: {
        orderNumber: `A-${1000 + idx}`,
        pickupCode: String(1000 + idx * 7),
        customerId: c.customerId,
        branchId: branch1.id,
        addressId: c.addressId,
        captainId,
        status,
        subtotal: 48,
        deliveryFee: 10,
        discount: 0,
        vat: 8.7,
        total: 66.7,
        commission: 7.2,
        paymentMethod: idx % 2 ? PaymentMethod.CASH : PaymentMethod.MADA,
        customerNotes: idx % 2 ? 'بدون بصل لو سمحت' : undefined,
        items: {
          create: [
            {
              menuItemId: mandi.id,
              nameAr: 'مندي لحم',
              nameEn: 'Lamb Mandi',
              unitPrice: 48,
              quantity: 1,
              lineTotal: 48,
              options: { create: [{ groupNameAr: 'الحجم', nameAr: 'نص كيلو', nameEn: 'Half Kilo', extraPrice: 0 }, { groupNameAr: 'إضافات', nameAr: 'صلصة حارة', nameEn: 'Hot Sauce', extraPrice: 3 }] },
            },
          ],
        },
        ...extra,
      },
    });
    await prisma.orderEvent.create({ data: { orderId: order.id, status, actorRole: UserRole.CUSTOMER } });
    return order;
  };

  await mkOrder(0, OrderStatus.PENDING); // طلب وارد — هيرن في تطبيق المطعم
  await mkOrder(1, OrderStatus.PENDING);
  await mkOrder(2, OrderStatus.PREPARING, undefined, { acceptedAt: new Date(), prepMinutes: 20 });
  await mkOrder(3, OrderStatus.READY, captain1.id, { acceptedAt: new Date(), readyAt: new Date(), prepMinutes: 15 });
  await mkOrder(4, OrderStatus.DELIVERED, captain1.id, {
    acceptedAt: new Date(Date.now() - 3600e3),
    readyAt: new Date(Date.now() - 3300e3),
    pickedUpAt: new Date(Date.now() - 3000e3),
    deliveredAt: new Date(Date.now() - 2400e3),
    prepMinutes: 20,
    captainPayout: 12,
    paymentStatus: PaymentStatus.PAID,
  });
  await mkOrder(5, OrderStatus.REJECTED, undefined, { rejectReason: 'الصنف غير متوفر حالياً', cancelledAt: new Date() });

  // ── طلبات العميل الأول من المطاعم الجديدة (شاشة «طلباتي» + التتبّع) ──
  const cust = customers[0];
  const minutes = (n: number) => new Date(Date.now() - n * 60e3);

  // ١) طلب جارٍ — في الطريق، عليه كابتن (شاشة التتبّع)
  const shawarmaItem = itemByKey['shawarma_bait:شاورما دجاج عربي'];
  const activeOrder = await prisma.order.create({
    data: {
      orderNumber: 'QF-20492',
      pickupCode: '4821',
      customerId: cust.customerId,
      branchId: branchByKey['shawarma_bait'],
      addressId: cust.addressId,
      captainId: captain1.id,
      status: OrderStatus.ON_THE_WAY,
      subtotal: 34,
      deliveryFee: 0,
      discount: 5.1,
      vat: 5.1,
      total: 34,
      commission: 5.1,
      paymentMethod: PaymentMethod.MADA,
      paymentStatus: PaymentStatus.PAID,
      couponId: qadir20.id,
      prepMinutes: 15,
      placedAt: minutes(28),
      acceptedAt: minutes(26),
      readyAt: minutes(12),
      assignedAt: minutes(11),
      pickedUpAt: minutes(8),
      items: {
        create: [
          {
            menuItemId: shawarmaItem.id,
            nameAr: shawarmaItem.nameAr,
            nameEn: shawarmaItem.nameEn,
            unitPrice: 17,
            quantity: 2,
            lineTotal: 34,
            options: { create: [{ groupNameAr: 'الحجم', nameAr: 'وسط', nameEn: 'Medium', extraPrice: 0 }] },
          },
        ],
      },
    },
  });
  // خط زمني كامل عشان شاشة التتبّع تعرض الخطوات
  await prisma.orderEvent.createMany({
    data: [
      { orderId: activeOrder.id, status: OrderStatus.PENDING, actorRole: UserRole.CUSTOMER, createdAt: minutes(28) },
      { orderId: activeOrder.id, status: OrderStatus.ACCEPTED, actorRole: UserRole.MERCHANT, createdAt: minutes(26) },
      { orderId: activeOrder.id, status: OrderStatus.PREPARING, actorRole: UserRole.MERCHANT, createdAt: minutes(25) },
      { orderId: activeOrder.id, status: OrderStatus.READY, actorRole: UserRole.MERCHANT, createdAt: minutes(12) },
      { orderId: activeOrder.id, status: OrderStatus.CAPTAIN_ASSIGNED, actorRole: UserRole.ADMIN, createdAt: minutes(11) },
      { orderId: activeOrder.id, status: OrderStatus.PICKED_UP, actorRole: UserRole.CAPTAIN, createdAt: minutes(8) },
      { orderId: activeOrder.id, status: OrderStatus.ON_THE_WAY, actorRole: UserRole.CAPTAIN, createdAt: minutes(7) },
    ],
  });

  // ٢) طلب مسلّم من Burger Lab (بخيارات — «وسط + جبنة إضافية»)
  const cheeseBurger = itemByKey['burger_lab:تشيز برجر دبل'];
  const truffleFries = itemByKey['burger_lab:بطاطس ترافل'];
  const deliveredBurger = await prisma.order.create({
    data: {
      orderNumber: 'QF-20481',
      pickupCode: '3390',
      customerId: cust.customerId,
      branchId: branchByKey['burger_lab'],
      addressId: cust.addressId,
      captainId: captain1.id,
      status: OrderStatus.DELIVERED,
      subtotal: 57,
      deliveryFee: 5,
      discount: 11.4,
      vat: 9.3,
      total: 59.9,
      commission: 8.55,
      captainPayout: 12,
      paymentMethod: PaymentMethod.MADA,
      paymentStatus: PaymentStatus.PAID,
      couponId: qadir20.id,
      prepMinutes: 25,
      placedAt: minutes(1500),
      acceptedAt: minutes(1498),
      readyAt: minutes(1475),
      pickedUpAt: minutes(1470),
      deliveredAt: minutes(1455),
      items: {
        create: [
          {
            menuItemId: cheeseBurger.id,
            nameAr: cheeseBurger.nameAr,
            nameEn: cheeseBurger.nameEn,
            unitPrice: 39,
            quantity: 1,
            lineTotal: 39,
            options: {
              create: [
                { groupNameAr: 'الحجم', nameAr: 'وسط', nameEn: 'Medium', extraPrice: 0 },
                { groupNameAr: 'إضافات', nameAr: 'جبنة إضافية', nameEn: 'Extra Cheese', extraPrice: 4 },
              ],
            },
          },
          {
            menuItemId: truffleFries.id,
            nameAr: truffleFries.nameAr,
            nameEn: truffleFries.nameEn,
            unitPrice: 18,
            quantity: 1,
            lineTotal: 18,
          },
        ],
      },
    },
  });
  await prisma.orderEvent.create({
    data: { orderId: deliveredBurger.id, status: OrderStatus.DELIVERED, actorRole: UserRole.CAPTAIN, createdAt: minutes(1455) },
  });

  // ٣) طلب مسلّم ومقيَّم من مذاق البخاري (كاش)
  const bukhariRice = itemByKey['bukhari:رز بخاري دجاج'];
  const deliveredBukhari = await prisma.order.create({
    data: {
      orderNumber: 'QF-20455',
      pickupCode: '7712',
      customerId: cust.customerId,
      branchId: branchByKey['bukhari'],
      addressId: workAddress.id,
      captainId: captain2.id,
      status: OrderStatus.DELIVERED,
      subtotal: 76,
      deliveryFee: 6,
      discount: 0,
      vat: 12.3,
      total: 94.3,
      commission: 11.4,
      captainPayout: 14,
      paymentMethod: PaymentMethod.CASH,
      paymentStatus: PaymentStatus.PAID,
      prepMinutes: 30,
      placedAt: minutes(4400),
      acceptedAt: minutes(4398),
      readyAt: minutes(4370),
      pickedUpAt: minutes(4365),
      deliveredAt: minutes(4345),
      items: {
        create: [
          {
            menuItemId: bukhariRice.id,
            nameAr: bukhariRice.nameAr,
            nameEn: bukhariRice.nameEn,
            unitPrice: 38,
            quantity: 2,
            lineTotal: 76,
            options: { create: [{ groupNameAr: 'الحجم', nameAr: 'وسط', nameEn: 'Medium', extraPrice: 0 }] },
          },
        ],
      },
    },
  });
  await prisma.orderEvent.create({
    data: { orderId: deliveredBukhari.id, status: OrderStatus.DELIVERED, actorRole: UserRole.CAPTAIN, createdAt: minutes(4345) },
  });
  await prisma.review.create({
    data: {
      orderId: deliveredBukhari.id,
      customerId: cust.customerId,
      restaurantStars: 5,
      captainStars: 5,
      comment: 'الرز ممتاز والتوصيل سريع',
    },
  });
  // تقييم منخفض على طلب البرجر — عشان شاشة الجودة يبان فيها شكوى حقيقية.
  await prisma.review.create({
    data: {
      orderId: deliveredBurger.id,
      customerId: cust.customerId,
      restaurantStars: 2,
      captainStars: 4,
      comment: 'البرجر وصل بارد والبطاطس ناقصة',
      createdAt: minutes(1450),
    },
  });

  // ٤) طلب ملغي من حلا وفاكهة
  const cheesecake = itemByKey['hala_fruits:تشيز كيك توت'];
  const cancelledOrder = await prisma.order.create({
    data: {
      orderNumber: 'QF-20399',
      pickupCode: '9014',
      customerId: cust.customerId,
      branchId: branchByKey['hala_fruits'],
      addressId: cust.addressId,
      status: OrderStatus.CANCELLED,
      subtotal: 22,
      deliveryFee: 5,
      discount: 0,
      vat: 4.05,
      total: 31.05,
      commission: 3.3,
      paymentMethod: PaymentMethod.MADA,
      paymentStatus: PaymentStatus.REFUNDED,
      cancelReason: 'العميل ألغى الطلب',
      placedAt: minutes(7300),
      cancelledAt: minutes(7295),
      items: {
        create: [
          {
            menuItemId: cheesecake.id,
            nameAr: cheesecake.nameAr,
            nameEn: cheesecake.nameEn,
            unitPrice: 22,
            quantity: 1,
            lineTotal: 22,
            options: { create: [{ groupNameAr: 'الحجم', nameAr: 'وسط', nameEn: 'Medium', extraPrice: 0 }] },
          },
        ],
      },
    },
  });
  await prisma.orderEvent.create({
    data: { orderId: cancelledOrder.id, status: OrderStatus.CANCELLED, actorRole: UserRole.CUSTOMER, createdAt: minutes(7295) },
  });

  // ── حساب استلام لمطعم واحد ──
  // عشان مسار تسجيل التحويل في التسويات يبقى قابل للتجربة. الباقي بدون حساب
  // عن قصد — عشان تبان الحالتين في اللوحة (جاهز للتحويل / ناقص حساب).
  await prisma.restaurantPayoutAccount.create({
    data: {
      restaurantId: restaurantByKey['burger_lab'],
      bankName: 'مصرف الراجحي',
      accountName: 'مؤسسة برجر لاب للتجارة',
      iban: 'SA4480000123456789012345',
    },
  });

  // ملحوظة: التسويات نفسها مابتتزرعش — بتتعمل من زرار «بدء دورة تسوية» في اللوحة
  // اللي بينادي POST /settlements/run. ده الـ workflow الحقيقي، وبيمنع تكرار
  // منطق الحساب في مكانين.

  // ── سجل عروض المهام ──
  // عشان «نسبة القبول» تبقى رقم حقيقي مش null. سعد قَبِل رحلاته المسلّمة، وعنده
  // رفض وتجاهل واحد — فنسبته تطلع من الاتنين. TIMEOUT/REJECTED على طلبات ملغية
  // أو جارية (مش لازم يبقوا مسلّمين).
  const activeOrderId = activeOrder.id;
  const tripOfferSeed = [
    { orderId: deliveredBurger.id, captainId: captain1.id, status: 'ACCEPTED' as const, payout: 12, km: 3.2 },
    { orderId: deliveredBukhari.id, captainId: captain2.id, status: 'ACCEPTED' as const, payout: 14, km: 4.1 },
    { orderId: activeOrderId, captainId: captain1.id, status: 'ACCEPTED' as const, payout: 9, km: 2.4 },
    // سعد رفض عرض وعدّى عليه واحد تاني — عشان نسبته متبقاش ١٠٠٪
    { orderId: cancelledOrder.id, captainId: captain1.id, status: 'REJECTED' as const, payout: 8, km: 1.5 },
    { orderId: cancelledOrder.id, captainId: captain2.id, status: 'TIMEOUT' as const, payout: 8, km: 1.9 },
  ];
  for (const o of tripOfferSeed) {
    await prisma.tripOffer.create({
      data: {
        orderId: o.orderId,
        captainId: o.captainId,
        status: o.status,
        payout: o.payout.toFixed(2),
        distanceKm: o.km.toFixed(2),
        respondedAt: new Date(), // كلهم اتردّ عليهم (مفيش OFFERED في الزرع)
      },
    });
  }

  // ── ورديات ──
  // ورديتين مقفولتين النهاردة لسعد عشان «ساعات الاتصال» تبان رقم حقيقي مش صفر.
  await prisma.shift.createMany({
    data: [
      { captainId: captain1.id, startedAt: minutes(360), endedAt: minutes(300), tripCount: 2, earnings: '24.00' },
      { captainId: captain1.id, startedAt: minutes(150), endedAt: minutes(95), tripCount: 1, earnings: '12.00' },
    ],
  });

  // ── دفتر المدفوعات ──
  // نفس قاعدة المحفظة: `paymentStatus` لوحدها مش مصدر — لازم يبقى وراها عملية.
  // الطلبات اللي فوق بتتكتب بحالتها على طول، فبنولّد صف التحصيل من الحالة دي،
  // والطلب المسترد بياخد صف استرداد كامل عشان المجاميع تقفل.
  const allOrders = await prisma.order.findMany({
    select: {
      id: true,
      total: true,
      commission: true,
      paymentMethod: true,
      paymentStatus: true,
      placedAt: true,
      deliveredAt: true,
    },
  });

  for (const order of allOrders) {
    const isCash = order.paymentMethod === PaymentMethod.CASH;
    const settled = order.paymentStatus !== PaymentStatus.PENDING && order.paymentStatus !== PaymentStatus.FAILED;

    await prisma.transaction.create({
      data: {
        orderId: order.id,
        provider: isCash ? 'cash' : 'sandbox',
        providerRefId: isCash || !settled ? null : `sbx_seed_${order.id.slice(0, 8)}`,
        method: order.paymentMethod,
        amount: order.total,
        status: settled ? PaymentStatus.PAID : order.paymentStatus,
        paidAt: settled ? (order.deliveredAt ?? order.placedAt) : null,
      },
    });

    if (order.paymentStatus === PaymentStatus.REFUNDED) {
      await prisma.refund.create({
        data: {
          orderId: order.id,
          amount: order.total,
          reasonAr: 'إلغاء الطلب بعد الدفع',
          // إلغاء ⇒ البيع ماتمّش ⇒ العمولة بترجع كاملة للمطعم.
          liability: RefundLiability.NONE,
          commissionReversed: order.commission,
          provider: isCash ? 'cash' : 'sandbox',
          status: RefundStatus.COMPLETED,
          providerRefId: `sbxr_seed_${order.id.slice(0, 8)}`,
          createdById: adminUser.id,
          completedAt: order.placedAt,
        },
      });
    }
  }

  // ── دفتر المحفظة ──
  // شاشة «الأرباح» بتحسب من الطلبات المسلّمة، وشاشة «المحفظة» بتحسب من الدفتر.
  // لو الـ seed كتب طلبات مسلّمة من غير حركات، الشاشتين بيتناقضوا (أرباح ١٢ ورصيد ٠).
  // فبنولّد الحركات من الطلبات نفسها بنفس اللي creditTripPayout بيعمله وقت التسليم.
  // المستقلين بس — الكابتن التابع لشركة مستحقه بيروح لتسوية الشركة مش محفظته،
  // فمابنكتبلوش حركة محفظة هنا (وإلا الفلوس هتتحسب مرتين).
  const paidTrips = await prisma.order.findMany({
    where: { status: OrderStatus.DELIVERED, captainId: { not: null }, captain: { companyId: null } },
    orderBy: { deliveredAt: 'asc' },
    select: { id: true, captainId: true, captainPayout: true, orderNumber: true, deliveredAt: true },
  });

  const balances = new Map<string, number>();

  // فهد عنده طلب سحب معلّق بـ ١٢٠ ر.س، ومستحقات رحلاته لوحدها ما تغطّيهاش.
  // بنفتحله رصيد مرحّل كتسوية موصوفة — عشان مسار الموافقة في لوحة الأدمن يبقى قابل للتجربة
  // من غير ما ناخد أرقام من الهوا. أي تعديل يدوي على المحفظة لازم يبان في الدفتر كده.
  const openingBalance = 186;
  balances.set(captain2.id, openingBalance);
  await prisma.walletTransaction.create({
    data: {
      captainId: captain2.id,
      type: WalletEntryType.ADJUSTMENT,
      amount: openingBalance.toFixed(2),
      balanceAfter: openingBalance.toFixed(2),
      descriptionAr: 'رصيد مرحّل من التسوية الافتتاحية',
      createdAt: minutes(10_000),
    },
  });

  for (const trip of paidTrips) {
    const amount = Number(trip.captainPayout ?? 0);
    if (!amount) continue;
    const after = Number(((balances.get(trip.captainId!) ?? 0) + amount).toFixed(2));
    balances.set(trip.captainId!, after);
    await prisma.walletTransaction.create({
      data: {
        captainId: trip.captainId!,
        type: WalletEntryType.TRIP_PAYOUT,
        amount: amount.toFixed(2),
        balanceAfter: after.toFixed(2),
        descriptionAr: `مستحق توصيل الطلب ${trip.orderNumber}`,
        orderId: trip.id,
        createdAt: trip.deliveredAt ?? new Date(),
      },
    });
  }

  for (const [captainId, balance] of balances) {
    await prisma.captain.update({ where: { id: captainId }, data: { walletBalance: balance.toFixed(2) } });
  }

  // ── تذاكر الدعم — شكاوى بكل الحالات (مربوطة بطلبات حقيقية) ──
  // بتغذّي شاشة «الشكاوى والدعم»: مفتوحة/بانتظار الرد/مصعّدة/مغلقة + محادثات.
  const supportTickets = [
    {
      ticketNumber: 'T-1000',
      customerId: cust.customerId,
      orderId: cancelledOrder.id,
      category: TicketCategory.PAYMENT,
      priority: TicketPriority.HIGH,
      status: TicketStatus.OPEN,
      subject: 'الطلب اتلغى ولسه المبلغ متخصوم',
      assignedToId: null as string | null,
      resolvedAt: null as Date | null,
      msgs: [
        { role: TicketSenderRole.CUSTOMER, body: 'طلبي اتلغى من ساعة والفلوس لسه متخصومة من المدى. ممكن حد يشوفلي؟', ago: 42 },
      ],
    },
    {
      ticketNumber: 'T-1001',
      customerId: cust.customerId,
      orderId: deliveredBurger.id,
      category: TicketCategory.ORDER,
      priority: TicketPriority.NORMAL,
      status: TicketStatus.PENDING,
      subject: 'وصل صنف ناقص في الطلب',
      assignedToId: adminUser.id,
      resolvedAt: null,
      msgs: [
        { role: TicketSenderRole.CUSTOMER, body: 'طلبت بطرسين ووصل واحد بس.', ago: 180 },
        { role: TicketSenderRole.AGENT, body: 'أسِف على ده. راجعنا الطلب وهنعمل استرداد جزئي للصنف الناقص، تأكيدك؟', ago: 150 },
      ],
    },
    {
      ticketNumber: 'T-1002',
      customerId: customers[1].customerId,
      orderId: null,
      category: TicketCategory.DELIVERY,
      priority: TicketPriority.URGENT,
      status: TicketStatus.ESCALATED,
      subject: 'الكابتن اتأخر أكتر من ساعة',
      assignedToId: reviewerUser.id,
      resolvedAt: null,
      msgs: [
        { role: TicketSenderRole.CUSTOMER, body: 'مستني الطلب من ساعة والكابتن مش بيرد.', ago: 75 },
        { role: TicketSenderRole.AGENT, body: 'بنتواصل مع الكابتن حالاً ونرجعلك.', ago: 60 },
        { role: TicketSenderRole.SYSTEM, body: 'الحالة → ESCALATED · الأولوية → URGENT', ago: 58 },
      ],
    },
    {
      ticketNumber: 'T-1003',
      customerId: cust.customerId,
      orderId: deliveredBukhari.id,
      category: TicketCategory.CAPTAIN,
      priority: TicketPriority.LOW,
      status: TicketStatus.CLOSED,
      subject: 'شكر للكابتن — خدمة ممتازة',
      assignedToId: adminUser.id,
      resolvedAt: minutes(20),
      msgs: [
        { role: TicketSenderRole.CUSTOMER, body: 'الكابتن كان محترم وسريع، حبيت أشكره.', ago: 240 },
        { role: TicketSenderRole.AGENT, body: 'يسعدنا كده! وصّلنا شكرك للكابتن. 🌟', ago: 230 },
        { role: TicketSenderRole.SYSTEM, body: 'الحالة → CLOSED', ago: 20 },
      ],
    },
    {
      ticketNumber: 'T-1004',
      customerId: customers[2].customerId,
      orderId: null,
      category: TicketCategory.APP,
      priority: TicketPriority.NORMAL,
      status: TicketStatus.OPEN,
      subject: 'التطبيق بيقفل عند الدفع',
      assignedToId: null,
      resolvedAt: null,
      msgs: [
        { role: TicketSenderRole.CUSTOMER, body: 'كل ما أوصل لصفحة الدفع التطبيق بيقفل. آيفون ١٥.', ago: 12 },
      ],
    },
  ];

  for (const t of supportTickets) {
    const lastAgo = t.msgs[t.msgs.length - 1].ago;
    await prisma.supportTicket.create({
      data: {
        ticketNumber: t.ticketNumber,
        customerId: t.customerId,
        orderId: t.orderId,
        category: t.category,
        priority: t.priority,
        status: t.status,
        subject: t.subject,
        assignedToId: t.assignedToId,
        resolvedAt: t.resolvedAt,
        lastMessageAt: minutes(lastAgo),
        createdAt: minutes(t.msgs[0].ago),
        messages: {
          create: t.msgs.map((m) => ({
            senderRole: m.role,
            senderId:
              m.role === TicketSenderRole.CUSTOMER
                ? null
                : m.role === TicketSenderRole.AGENT
                  ? t.assignedToId
                  : adminUser.id,
            body: m.body,
            createdAt: minutes(m.ago),
          })),
        },
      },
    });
  }

  // ── مناطق التوصيل — مستطيلات بتسعيرة مختلفة بتغطّي عناوين العملاء ──
  // رسوم كل طلب جديد بتتاخد من المنطقة اللي بتغطّي عنوانه (بدل رسوم الفرع).
  await prisma.zone.createMany({
    data: [
      { name: 'العليا وحطين', minLat: 24.712, maxLat: 24.735, minLng: 46.665, maxLng: 46.700, deliveryFee: '10.00', priority: 3, color: '#F5C518' },
      { name: 'الملز', minLat: 24.715, maxLat: 24.760, minLng: 46.640, maxLng: 46.668, deliveryFee: '13.00', priority: 3, color: '#3B82F6' },
      { name: 'السليمانية', minLat: 24.690, maxLat: 24.712, minLng: 46.670, maxLng: 46.705, deliveryFee: '11.00', priority: 3, color: '#10B981' },
      // منطقة عامة (احتياطية) بأولوية أقل — بتغطّي باقي الرياض برسوم أعلى.
      { name: 'الرياض الكبرى', minLat: 24.55, maxLat: 24.90, minLng: 46.50, maxLng: 46.85, deliveryFee: '15.00', priority: 1, color: '#9CA3AF' },
    ],
  });

  // ── فحوصات الوجه اليومية — المناديب الأونلاين موثّقين النهاردة ──
  // عشان لو FACE_CHECK_ENFORCE اتفعّل، الفريق الشغّال مايتقفلش، وروستر الأدمن
  // يبان فيه حالات. فهد وماجد (أوفلاين) من غير فحص النهاردة → «مطلوب».
  const onlineForFace = await prisma.captain.findMany({
    where: { status: { in: [CaptainStatus.ONLINE, CaptainStatus.ON_TRIP] } },
    select: { id: true },
  });
  for (const c of onlineForFace) {
    await prisma.faceCheck.create({
      data: {
        captainId: c.id,
        selfieUrl: `/uploads/selfies/seed-${c.id.slice(0, 8)}.jpg`,
        status: FaceCheckStatus.VERIFIED,
        provider: 'stub',
        checkedAt: minutes(35),
      },
    });
  }

  // ── ملخّص ──
  const [nRestaurants, nBranches, nCategories, nItems, nOptionGroups, nCoupons, nOrders, nFavorites] =
    await Promise.all([
      prisma.restaurant.count(),
      prisma.branch.count(),
      prisma.menuCategory.count(),
      prisma.menuItem.count(),
      prisma.optionGroup.count(),
      prisma.coupon.count(),
      prisma.order.count(),
      prisma.favorite.count(),
    ]);

  console.log(`
✅ تمت التهيئة:
   المطاعم:  ${nRestaurants} مطعم · ${nBranches} فرع (كلها في الرياض، وفروع تطبيق العميل على بُعد ١–٣ كم من عنوان العميل)
   المنيو:   ${nCategories} تصنيف · ${nItems} صنف · ${nOptionGroups} مجموعة خيارات (الحجم إجباري + الإضافات اختيارية)
   الكوبونات: ${nCoupons} — WELCOME20 · QADIR20 (٢٠٪ بحد أقصى ١٥) · FREEDEL (توصيل مجاني)
   الطلبات:  ${nOrders} · المفضلة: ${nFavorites}

   🔐 الدخول:
   الأدمن:   admin@delivery.sa / 123456  ·  المراجع: reviewer@delivery.sa / 123456 (للموافقة المزدوجة)
   المدير:   manager@aseel.sa / 123456  (فرعين — هيطلب اختيار الفرع)
   الكاشير:  cashier@aseel.sa / 123456  (فرع واحد)
   الشركة:   ops@suraa.sa / 123456  (شركة «سرعة» — مندوبها: سعد → مستحقاته لتسوية الشركة)
   الكباتن:  0533333333 (سعد · شركة سرعة) · 0544444444 (فهد · مستقل + محفظة) · 0555111222 (ماجد · مستقل)
   الديمو:   0575420596 ⭐ (له طلب جارٍ + سجل طلبات + مفضلة)
   العملاء:  0555555555 · 0566666666 · 0577777777

   🍔 مطاعم تطبيق العميل: Burger Lab · Smash House (توصيل مجاني) · Pizza Corner ·
      شاورما البيت (توصيل مجاني) · مذاق البخاري · حلا وفاكهة
   📦 ٢ طلبات PENDING هيرنّوا في تطبيق المطعم · طلب ON_THE_WAY لشاشة التتبّع
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
