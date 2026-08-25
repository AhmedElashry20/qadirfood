import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemAvailability, OptionGroupType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  // ── التصنيفات (شاشة ٧) ──

  async listCategories(restaurantId: string) {
    return this.prisma.menuCategory.findMany({
      where: { restaurantId },
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: { optionGroups: { include: { options: true }, orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
  }

  async createCategory(restaurantId: string, data: { nameAr: string; nameEn: string }) {
    const count = await this.prisma.menuCategory.count({ where: { restaurantId } });
    return this.prisma.menuCategory.create({
      data: { ...data, restaurantId, sortOrder: count },
    });
  }

  /** إعادة الترتيب بالسحب والإفلات — بنستقبل الترتيب الجديد كامل ونكتبه مرة واحدة. */
  async reorderCategories(restaurantId: string, orderedIds: string[]) {
    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.menuCategory.updateMany({
          where: { id, restaurantId },
          data: { sortOrder: index },
        }),
      ),
    );
    return this.listCategories(restaurantId);
  }

  async reorderItems(restaurantId: string, categoryId: string, orderedIds: string[]) {
    await this.assertCategoryOwned(restaurantId, categoryId);

    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.menuItem.updateMany({ where: { id, categoryId }, data: { sortOrder: index } }),
      ),
    );
  }

  /**
   * أي عملية على صنف لازم تتأكد إنه تبع مطعم المستخدم — من غير كده أي مطعم
   * يقدر يعدّل أو يحذف أصناف مطعم تاني بمجرد إنه يعرف الـ id.
   */
  private async assertItemsOwned(restaurantId: string, itemIds: string[]) {
    if (itemIds.length === 0) return;

    const count = await this.prisma.menuItem.count({
      where: { id: { in: itemIds }, category: { restaurantId } },
    });

    if (count !== itemIds.length) throw new NotFoundException('الصنف غير موجود');
  }

  private async assertCategoryOwned(restaurantId: string, categoryId: string) {
    const category = await this.prisma.menuCategory.findFirst({
      where: { id: categoryId, restaurantId },
    });
    if (!category) throw new NotFoundException('التصنيف غير موجود');
  }

  // ── الأصناف (شاشة ٨) ──

  async createItem(data: {
    categoryId: string;
    branchId?: string;
    nameAr: string;
    nameEn: string;
    descriptionAr?: string;
    descriptionEn?: string;
    imageUrl?: string;
    price: number;
    calories?: number;
    optionGroups?: {
      nameAr: string;
      nameEn: string;
      type: OptionGroupType;
      isRequired: boolean;
      minSelect: number;
      maxSelect: number;
      options: { nameAr: string; nameEn: string; extraPrice: number }[];
    }[];
  }) {
    const { optionGroups, ...item } = data;
    const count = await this.prisma.menuItem.count({ where: { categoryId: data.categoryId } });

    return this.prisma.menuItem.create({
      data: {
        ...item,
        price: new Prisma.Decimal(item.price),
        sortOrder: count,
        optionGroups: optionGroups
          ? {
              create: optionGroups.map((g, gi) => ({
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
                    extraPrice: new Prisma.Decimal(o.extraPrice),
                    sortOrder: oi,
                  })),
                },
              })),
            }
          : undefined,
      },
      include: { optionGroups: { include: { options: true } } },
    });
  }

  async updateItem(restaurantId: string, id: string, data: Prisma.MenuItemUpdateInput) {
    await this.assertItemsOwned(restaurantId, [id]);
    return this.prisma.menuItem.update({ where: { id }, data });
  }

  async deleteItem(restaurantId: string, id: string) {
    await this.assertItemsOwned(restaurantId, [id]);
    return this.prisma.menuItem.delete({ where: { id } });
  }

  // ── الإتاحة / الإيقاف (شاشة ٩) ──

  /**
   * «موقوف حتى نهاية اليوم» بيترجع تلقائياً — بنحدد availableFrom بفجر بكرة،
   * ومهمة restoreExpiredAvailability() بترجّعه AVAILABLE.
   * «موقوف دائم» بيفضل موقوف لحد ما المطعم يرجّعه بنفسه.
   */
  async setAvailability(restaurantId: string, itemIds: string[], availability: ItemAvailability) {
    await this.assertItemsOwned(restaurantId, itemIds);

    let availableFrom: Date | null = null;

    if (availability === ItemAvailability.OUT_OF_STOCK_TODAY) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(4, 0, 0, 0); // ٤ الفجر — بداية اليوم التشغيلي
      availableFrom = tomorrow;
    }

    await this.prisma.menuItem.updateMany({
      where: { id: { in: itemIds } },
      data: { availability, availableFrom },
    });

    return { updated: itemIds.length, availability, availableFrom };
  }

  /** بتتنادى من كرون كل ساعة — ترجّع الأصناف الموقوفة "حتى نهاية اليوم". */
  async restoreExpiredAvailability() {
    const result = await this.prisma.menuItem.updateMany({
      where: {
        availability: ItemAvailability.OUT_OF_STOCK_TODAY,
        availableFrom: { lte: new Date() },
      },
      data: { availability: ItemAvailability.AVAILABLE, availableFrom: null },
    });
    return { restored: result.count };
  }

  async searchItems(restaurantId: string, query: string) {
    if (!query?.trim()) throw new BadRequestException('نص البحث مطلوب');
    return this.prisma.menuItem.findMany({
      where: {
        category: { restaurantId },
        OR: [
          { nameAr: { contains: query, mode: 'insensitive' } },
          { nameEn: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: { category: true },
      take: 50,
    });
  }
}
