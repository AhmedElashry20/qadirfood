import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemAvailability, OptionGroupType, Prisma, RestaurantStatus } from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import {
  BranchSort,
  BrowseBranchesDto,
  CreateAddressDto,
  GeoQueryDto,
  UpdateAddressDto,
  UpdateMeDto,
  ValidateCouponDto,
} from './customer.dto';

// ────────────────────────────────────────────────────────────
// أشكال الردود — كل حقول Decimal بترجع أرقام JS، مش كائنات Decimal
// ────────────────────────────────────────────────────────────

export interface CustomerProfileView {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  avatarUrl: string | null;
  walletBalance: number;
  ordersCount: number;
  favoritesCount: number;
}

export interface AddressView {
  id: string;
  label: string;
  city: string;
  district: string | null;
  street: string | null;
  building: string | null;
  notes: string | null;
  isDefault: boolean;
  lat: number | null;
  lng: number | null;
}

export interface BranchCardView {
  id: string;
  restaurantId: string;
  nameAr: string;
  restaurantNameAr: string;
  cuisineAr: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  rating: number;
  ratingCount: number;
  distanceKm: number;
  deliveryFee: number;
  minOrderTotal: number;
  etaMinMinutes: number;
  etaMaxMinutes: number;
  status: RestaurantStatus;
  isOpenNow: boolean;
  isFavorite: boolean;
}

export interface WorkingHourView {
  id: string;
  weekday: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
  isRamadan: boolean;
}

export interface BranchDetailView extends BranchCardView {
  lat: number | null;
  lng: number | null;
  address: string;
  workingHours: WorkingHourView[];
}

export interface MenuOptionView {
  id: string;
  nameAr: string;
  extraPrice: number;
}

export interface MenuOptionGroupView {
  id: string;
  nameAr: string;
  type: OptionGroupType;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  options: MenuOptionView[];
}

export interface MenuItemView {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  imageUrl: string | null;
  price: number;
  availability: ItemAvailability;
  optionGroups: MenuOptionGroupView[];
}

export interface MenuCategoryView {
  id: string;
  nameAr: string;
  nameEn: string;
  sortOrder: number;
  items: MenuItemView[];
}

export interface CouponView {
  code: string;
  descriptionAr: string | null;
  percentOff: number | null;
  amountOff: number | null;
  maxDiscount: number | null;
  minOrderTotal: number;
  expiresAt: Date | null;
}

type BranchWithRestaurant = Prisma.BranchGetPayload<{ include: { restaurant: true } }>;

/** صف raw لعنوان — أعمدة PostGIS مش شايفها Prisma فبنقراها بـ ST_Y / ST_X. */
interface AddressRow {
  id: string;
  label: string;
  city: string;
  district: string | null;
  street: string | null;
  building: string | null;
  notes: string | null;
  isDefault: boolean;
  lat: number | null;
  lng: number | null;
}

const ADDRESS_COLUMNS = `a.id, a.label, a.city, a.district, a.street, a.building, a.notes, a."isDefault",
   ST_Y(a.location::geometry) AS lat, ST_X(a.location::geometry) AS lng`;

@Injectable()
export class CustomerService {
  constructor(private readonly prisma: PrismaService) {}

  // ────────────────────────────────────────────────────────────
  // الملف الشخصي
  // ────────────────────────────────────────────────────────────

  async getMe(customerId: string): Promise<CustomerProfileView> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: { user: true },
    });
    if (!customer) throw new NotFoundException('العميل غير موجود');

    const [ordersCount, favoritesCount] = await this.prisma.$transaction([
      this.prisma.order.count({ where: { customerId } }),
      this.prisma.favorite.count({ where: { customerId } }),
    ]);

    return {
      id: customer.id,
      fullName: customer.user.fullName,
      phone: customer.user.phone,
      email: customer.user.email,
      avatarUrl: customer.user.avatarUrl,
      walletBalance: Number(customer.walletBalance),
      ordersCount,
      favoritesCount,
    };
  }

  async updateMe(customerId: string, userId: string, dto: UpdateMeDto): Promise<CustomerProfileView> {
    if (dto.email) {
      const taken = await this.prisma.user.findFirst({
        where: { email: dto.email, id: { not: userId } },
        select: { id: true },
      });
      if (taken) throw new BadRequestException('البريد الإلكتروني مستخدم بالفعل');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
      },
    });

    return this.getMe(customerId);
  }

  // ────────────────────────────────────────────────────────────
  // العناوين — الإحداثيات بتتكتب بـ setPoint وبتتقرا بـ ST_Y/ST_X
  // ────────────────────────────────────────────────────────────

  /** استعلام raw واحد لكل عناوين العميل — أوفر من getPoint لكل عنوان على حدة. */
  async listAddresses(customerId: string): Promise<AddressView[]> {
    const rows = await this.prisma.$queryRawUnsafe<AddressRow[]>(
      `SELECT ${ADDRESS_COLUMNS}
       FROM addresses a
       WHERE a."customerId" = $1
       ORDER BY a."isDefault" DESC, a."createdAt" ASC`,
      customerId,
    );
    return rows.map((r) => this.toAddressView(r));
  }

  async createAddress(customerId: string, dto: CreateAddressDto): Promise<AddressView> {
    const existing = await this.prisma.address.count({ where: { customerId } });
    const shouldBeDefault = dto.isDefault === true || existing === 0;

    const address = await this.prisma.address.create({
      data: {
        customerId,
        label: dto.label,
        city: dto.city,
        district: dto.district,
        street: dto.street,
        building: dto.building,
        notes: dto.notes,
        isDefault: shouldBeDefault,
      },
    });

    // العمود geography مش بيتكتب من Prisma — لازم raw بعد الإنشاء مباشرة.
    await this.prisma.setPoint('addresses', 'location', address.id, dto.lat, dto.lng);

    if (shouldBeDefault) await this.clearOtherDefaults(customerId, address.id);

    return this.getAddress(customerId, address.id);
  }

  async updateAddress(customerId: string, id: string, dto: UpdateAddressDto): Promise<AddressView> {
    await this.assertAddressOwnership(customerId, id);

    if ((dto.lat === undefined) !== (dto.lng === undefined)) {
      throw new BadRequestException('لازم تبعت خط العرض وخط الطول مع بعض');
    }

    await this.prisma.address.update({
      where: { id },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.city !== undefined ? { city: dto.city } : {}),
        ...(dto.district !== undefined ? { district: dto.district } : {}),
        ...(dto.street !== undefined ? { street: dto.street } : {}),
        ...(dto.building !== undefined ? { building: dto.building } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
      },
    });

    if (dto.lat !== undefined && dto.lng !== undefined) {
      await this.prisma.setPoint('addresses', 'location', id, dto.lat, dto.lng);
    }

    if (dto.isDefault === true) await this.clearOtherDefaults(customerId, id);

    return this.getAddress(customerId, id);
  }

  /** آخر عنوان ما ينفعش يتحذف — العميل لازم يفضل معاه عنوان واحد على الأقل. */
  async deleteAddress(customerId: string, id: string): Promise<{ deleted: true }> {
    const address = await this.assertAddressOwnership(customerId, id);

    const count = await this.prisma.address.count({ where: { customerId } });
    if (count <= 1) throw new BadRequestException('ما ينفع تحذف آخر عنوان');

    await this.prisma.address.delete({ where: { id } });

    // لو المحذوف كان الافتراضي، نرقّي عنوان تاني عشان العميل ما يفضلش من غير افتراضي
    if (address.isDefault) {
      const next = await this.prisma.address.findFirst({
        where: { customerId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (next) await this.prisma.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }

    return { deleted: true };
  }

  async setDefaultAddress(customerId: string, id: string): Promise<AddressView> {
    await this.assertAddressOwnership(customerId, id);

    await this.prisma.$transaction([
      this.prisma.address.updateMany({
        where: { customerId, id: { not: id } },
        data: { isDefault: false },
      }),
      this.prisma.address.update({ where: { id }, data: { isDefault: true } }),
    ]);

    return this.getAddress(customerId, id);
  }

  private async assertAddressOwnership(customerId: string, id: string) {
    const address = await this.prisma.address.findFirst({ where: { id, customerId } });
    if (!address) throw new NotFoundException('العنوان غير موجود');
    return address;
  }

  private async clearOtherDefaults(customerId: string, keepId: string) {
    await this.prisma.address.updateMany({
      where: { customerId, id: { not: keepId } },
      data: { isDefault: false },
    });
  }

  private async getAddress(customerId: string, id: string): Promise<AddressView> {
    const rows = await this.prisma.$queryRawUnsafe<AddressRow[]>(
      `SELECT ${ADDRESS_COLUMNS}
       FROM addresses a
       WHERE a.id = $1 AND a."customerId" = $2`,
      id,
      customerId,
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('العنوان غير موجود');
    return this.toAddressView(row);
  }

  private toAddressView(row: AddressRow): AddressView {
    return {
      id: row.id,
      label: row.label,
      city: row.city,
      district: row.district,
      street: row.street,
      building: row.building,
      notes: row.notes,
      isDefault: row.isDefault,
      lat: row.lat === null ? null : Number(row.lat),
      lng: row.lng === null ? null : Number(row.lng),
    };
  }

  // ────────────────────────────────────────────────────────────
  // التصفح
  // ────────────────────────────────────────────────────────────

  /** الفروع القريبة — المسافة من PostGIS، والباقي (اسم/صور/رسوم/وقت وصول) بيتحقن هنا. */
  async browseBranches(customerId: string, dto: BrowseBranchesDto): Promise<BranchCardView[]> {
    const radiusKm = dto.radiusKm ?? 10;

    const rows = await this.prisma.$queryRawUnsafe<{ id: string; distanceKm: number }[]>(
      `SELECT b.id,
              ST_Distance(b.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000.0 AS "distanceKm"
       FROM branches b
       WHERE b."isActive" = true
         AND ST_DWithin(b.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3 * 1000)
       ORDER BY "distanceKm" ASC
       LIMIT 50`,
      dto.lng,
      dto.lat,
      radiusKm,
    );
    if (!rows.length) return [];

    const distances = new Map(rows.map((r) => [r.id, Number(r.distanceKm)]));

    const q = dto.q?.trim();
    const branches = await this.prisma.branch.findMany({
      where: {
        id: { in: [...distances.keys()] },
        ...(q ? { OR: this.searchFilter(q) } : {}),
      },
      include: { restaurant: true },
    });

    const cards = await this.decorate(customerId, branches, distances);
    return this.sortCards(cards, dto.sort ?? BranchSort.NEAREST);
  }

  /** البحث: اسم المطعم / نوع المطبخ / اسم صنف في منيو الفرع (أصناف الفرع + الأصناف العامة). */
  private searchFilter(q: string): Prisma.BranchWhereInput[] {
    const like = { contains: q, mode: Prisma.QueryMode.insensitive };
    return [
      { restaurant: { nameAr: like } },
      { restaurant: { nameEn: like } },
      { restaurant: { cuisineAr: like } },
      { menuItems: { some: { nameAr: like } } },
      { restaurant: { categories: { some: { items: { some: { nameAr: like, branchId: null } } } } } },
    ];
  }

  async getBranch(customerId: string, id: string, geo: GeoQueryDto): Promise<BranchDetailView> {
    const branch = await this.prisma.branch.findUnique({
      where: { id },
      include: {
        restaurant: true,
        workingHours: { orderBy: [{ weekday: 'asc' }, { opensAt: 'asc' }] },
      },
    });
    if (!branch) throw new NotFoundException('الفرع غير موجود');

    const point = await this.prisma.getPoint('branches', 'location', id);

    const distances = new Map<string, number>();
    if (geo.lat !== undefined && geo.lng !== undefined && point) {
      distances.set(id, await this.prisma.distanceKm(geo.lat, geo.lng, point.lat, point.lng));
    }

    const [card] = await this.decorate(customerId, [branch], distances);

    return {
      ...card,
      lat: point?.lat ?? null,
      lng: point?.lng ?? null,
      address: branch.address,
      workingHours: branch.workingHours.map((h) => ({
        id: h.id,
        weekday: h.weekday,
        opensAt: h.opensAt,
        closesAt: h.closesAt,
        isClosed: h.isClosed,
        isRamadan: h.isRamadan,
      })),
    };
  }

  /**
   * منيو الفرع للعميل: أصناف الفرع + الأصناف العامة (branchId = null) للمطعم،
   * من غير الموقوف دائم، والخيارات المتاحة بس.
   */
  async getBranchMenu(branchId: string): Promise<MenuCategoryView[]> {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new NotFoundException('الفرع غير موجود');

    const categories = await this.prisma.menuCategory.findMany({
      where: { restaurantId: branch.restaurantId, isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          where: {
            OR: [{ branchId }, { branchId: null }],
            availability: { not: ItemAvailability.OUT_OF_STOCK },
          },
          orderBy: { sortOrder: 'asc' },
          include: {
            optionGroups: {
              orderBy: { sortOrder: 'asc' },
              include: {
                options: { where: { isAvailable: true }, orderBy: { sortOrder: 'asc' } },
              },
            },
          },
        },
      },
    });

    return categories.map((c) => ({
      id: c.id,
      nameAr: c.nameAr,
      nameEn: c.nameEn,
      sortOrder: c.sortOrder,
      items: c.items.map((i) => ({
        id: i.id,
        nameAr: i.nameAr,
        nameEn: i.nameEn,
        descriptionAr: i.descriptionAr,
        imageUrl: i.imageUrl,
        price: Number(i.price),
        availability: i.availability,
        optionGroups: i.optionGroups.map((g) => ({
          id: g.id,
          nameAr: g.nameAr,
          type: g.type,
          isRequired: g.isRequired,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          options: g.options.map((o) => ({
            id: o.id,
            nameAr: o.nameAr,
            extraPrice: Number(o.extraPrice),
          })),
        })),
      })),
    }));
  }

  // ────────────────────────────────────────────────────────────
  // المفضلة
  // ────────────────────────────────────────────────────────────

  async listFavorites(customerId: string, geo: GeoQueryDto): Promise<BranchCardView[]> {
    const favorites = await this.prisma.favorite.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      include: { branch: { include: { restaurant: true } } },
    });
    if (!favorites.length) return [];

    const distances = new Map<string, number>();
    if (geo.lat !== undefined && geo.lng !== undefined) {
      const rows = await this.prisma.$queryRawUnsafe<{ id: string; distanceKm: number }[]>(
        `SELECT b.id,
                ST_Distance(b.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000.0 AS "distanceKm"
         FROM branches b
         JOIN favorites f ON f."branchId" = b.id
         WHERE f."customerId" = $3 AND b.location IS NOT NULL`,
        geo.lng,
        geo.lat,
        customerId,
      );
      for (const r of rows) distances.set(r.id, Number(r.distanceKm));
    }

    return this.decorate(
      customerId,
      favorites.map((f) => f.branch),
      distances,
    );
  }

  async addFavorite(customerId: string, branchId: string): Promise<{ favorited: true }> {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } });
    if (!branch) throw new NotFoundException('الفرع غير موجود');

    await this.prisma.favorite.upsert({
      where: { customerId_branchId: { customerId, branchId } },
      create: { customerId, branchId },
      update: {},
    });

    return { favorited: true };
  }

  async removeFavorite(customerId: string, branchId: string): Promise<{ favorited: false }> {
    await this.prisma.favorite.deleteMany({ where: { customerId, branchId } });
    return { favorited: false };
  }

  // ────────────────────────────────────────────────────────────
  // الكوبونات — نفس معادلة الخصم اللي في OrdersService بالظبط،
  // عشان التطبيق ما يعرضش خصم الطلب مش هيحسبه.
  // ────────────────────────────────────────────────────────────

  async listCoupons(): Promise<CouponView[]> {
    const now = new Date();
    const coupons = await this.prisma.coupon.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
        ],
      },
      orderBy: { expiresAt: 'asc' },
    });

    return coupons
      .filter((c) => c.usageLimit === null || c.usedCount < c.usageLimit)
      .map((c) => ({
        code: c.code,
        descriptionAr: c.descriptionAr,
        percentOff: c.percentOff,
        amountOff: c.amountOff === null ? null : Number(c.amountOff),
        maxDiscount: c.maxDiscount === null ? null : Number(c.maxDiscount),
        minOrderTotal: Number(c.minOrderTotal),
        expiresAt: c.expiresAt,
      }));
  }

  async validateCoupon(
    dto: ValidateCouponDto,
  ): Promise<{ valid: true; code: string; discount: number; descriptionAr: string | null }> {
    const coupon = await this.prisma.coupon.findUnique({ where: { code: dto.code } });
    const now = new Date();

    if (!coupon || !coupon.isActive) throw new BadRequestException('الكوبون غير صالح');
    if (coupon.startsAt && coupon.startsAt > now) throw new BadRequestException('الكوبون غير صالح');
    if (coupon.expiresAt && coupon.expiresAt < now) throw new BadRequestException('الكوبون منتهي');
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      throw new BadRequestException('الكوبون غير صالح');
    }

    const subtotal = new Decimal(dto.subtotal);
    const minOrderTotal = new Decimal(coupon.minOrderTotal.toString());
    if (subtotal.lt(minOrderTotal)) {
      throw new BadRequestException(`الحد الأدنى للطلب ${minOrderTotal.toFixed(2)} ريال`);
    }

    let discount = coupon.percentOff
      ? subtotal.times(coupon.percentOff).dividedBy(100)
      : new Decimal(coupon.amountOff?.toString() ?? 0);

    if (coupon.maxDiscount) {
      discount = Decimal.min(discount, new Decimal(coupon.maxDiscount.toString()));
    }

    return {
      valid: true,
      code: coupon.code,
      discount: Number(discount.toFixed(2)),
      descriptionAr: coupon.descriptionAr,
    };
  }

  // ────────────────────────────────────────────────────────────
  // مساعدات التصفح
  // ────────────────────────────────────────────────────────────

  /** بيحوّل صفوف الفروع لبطاقات جاهزة للعرض: مفضلة + مفتوح دلوقتي + وقت وصول متوقع. */
  private async decorate(
    customerId: string,
    branches: BranchWithRestaurant[],
    distances: Map<string, number>,
  ): Promise<BranchCardView[]> {
    if (!branches.length) return [];

    const ids = branches.map((b) => b.id);
    const now = new Date();
    const weekday = now.getDay();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const [favorites, slots] = await Promise.all([
      this.prisma.favorite.findMany({
        where: { customerId, branchId: { in: ids } },
        select: { branchId: true },
      }),
      // نفس قاعدة RestaurantsService.isBranchOpenNow — فترة واحدة على الأقل شاملة الوقت الحالي
      this.prisma.workingHour.findMany({
        where: { branchId: { in: ids }, weekday, isClosed: false, isRamadan: false },
        select: { branchId: true, opensAt: true, closesAt: true },
      }),
    ]);

    const favoriteIds = new Set(favorites.map((f) => f.branchId));
    const openIds = new Set(
      slots.filter((s) => s.opensAt <= hhmm && hhmm <= s.closesAt).map((s) => s.branchId),
    );

    return branches.map((b) => {
      const distanceKm = distances.get(b.id) ?? 0;
      const etaMinMinutes =
        b.avgPrepMinutes +
        Math.round(distanceKm * 3) +
        (b.status === RestaurantStatus.BUSY ? b.busyExtraMinutes : 0);

      return {
        id: b.id,
        restaurantId: b.restaurantId,
        nameAr: b.nameAr,
        restaurantNameAr: b.restaurant.nameAr,
        cuisineAr: b.restaurant.cuisineAr,
        logoUrl: b.restaurant.logoUrl,
        coverUrl: b.restaurant.coverUrl,
        rating: Number(b.rating),
        ratingCount: b.ratingCount,
        distanceKm: Number(distanceKm.toFixed(2)),
        deliveryFee: Number(b.deliveryFee),
        minOrderTotal: Number(b.minOrderTotal),
        etaMinMinutes,
        etaMaxMinutes: etaMinMinutes + 10,
        status: b.status,
        isOpenNow: b.status === RestaurantStatus.OPEN && openIds.has(b.id),
        isFavorite: favoriteIds.has(b.id),
      };
    });
  }

  private sortCards(cards: BranchCardView[], sort: BranchSort): BranchCardView[] {
    const sorted = [...cards];
    switch (sort) {
      case BranchSort.FASTEST:
        sorted.sort((a, b) => a.etaMinMinutes - b.etaMinMinutes || a.distanceKm - b.distanceKm);
        break;
      case BranchSort.TOP_RATED:
        sorted.sort((a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount);
        break;
      default:
        sorted.sort((a, b) => a.distanceKm - b.distanceKm);
    }
    return sorted;
  }
}
