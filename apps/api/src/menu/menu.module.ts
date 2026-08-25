import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ItemAvailability, OptionGroupType, UserRole } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MenuService } from './menu.service';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, type AuthUser } from '../common';
import { PrismaService } from '../prisma/prisma.service';

class OptionDto {
  @IsString() nameAr!: string;
  @IsString() nameEn!: string;
  @IsNumber() @Min(0) extraPrice!: number;
}

class OptionGroupDto {
  @IsString() nameAr!: string;
  @IsString() nameEn!: string;
  @IsEnum(OptionGroupType) type!: OptionGroupType;
  @IsBoolean() isRequired!: boolean;
  @IsInt() @Min(0) minSelect!: number;
  @IsInt() @Min(1) maxSelect!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OptionDto)
  options!: OptionDto[];
}

class CreateItemDto {
  @IsUUID() categoryId!: string;
  @IsOptional() @IsUUID() branchId?: string;
  @IsString() nameAr!: string;
  @IsString() nameEn!: string;
  @IsOptional() @IsString() descriptionAr?: string;
  @IsOptional() @IsString() descriptionEn?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsNumber() @Min(0) price!: number;
  @IsOptional() @IsInt() @Min(0) calories?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OptionGroupDto)
  optionGroups?: OptionGroupDto[];
}

class CreateCategoryDto {
  @IsString() nameAr!: string;
  @IsString() nameEn!: string;
}

// حقول التعديل المسموح بيها بس — من غير كده الـ body الخام كان بيروح مباشرة لـ
// Prisma فأي حد يقدر يعدّل أي عمود (restaurantId، إلخ) = mass assignment.
class UpdateItemDto {
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsString() nameEn?: string;
  @IsOptional() @IsString() descriptionAr?: string;
  @IsOptional() @IsString() descriptionEn?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsInt() @Min(0) calories?: number;
  @IsOptional() @IsEnum(ItemAvailability) availability?: ItemAvailability;
}

class SetAvailabilityDto {
  @IsArray()
  @IsUUID('all', { each: true })
  itemIds!: string[];

  @IsEnum(ItemAvailability)
  availability!: ItemAvailability;
}

class ReorderDto {
  @IsArray()
  @IsUUID('all', { each: true })
  orderedIds!: string[];
}

@ApiTags('menu')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('menu')
export class MenuController {
  constructor(
    private readonly menu: MenuService,
    private readonly prisma: PrismaService,
  ) {}

  /** المطعم بيشتغل على مستوى الفرع — بنستنتج المطعم من الفرع اللي في التوكن. */
  private async restaurantIdOf(user: AuthUser): Promise<string> {
    const branch = await this.prisma.branch.findUnique({ where: { id: user.branchId! } });
    return branch!.restaurantId;
  }

  @Get('categories')
  @Roles(UserRole.MERCHANT, UserRole.ADMIN)
  @ApiOperation({ summary: 'المنيو كامل بالتصنيفات والأصناف (شاشة ٧)' })
  async categories(@CurrentUser() user: AuthUser) {
    return this.menu.listCategories(await this.restaurantIdOf(user));
  }

  @Post('categories')
  @Roles(UserRole.MERCHANT)
  async createCategory(@CurrentUser() user: AuthUser, @Body() body: CreateCategoryDto) {
    return this.menu.createCategory(await this.restaurantIdOf(user), body);
  }

  @Patch('categories/reorder')
  @Roles(UserRole.MERCHANT)
  @ApiOperation({ summary: 'إعادة ترتيب التصنيفات (سحب وإفلات)' })
  async reorderCategories(@CurrentUser() user: AuthUser, @Body() dto: ReorderDto) {
    return this.menu.reorderCategories(await this.restaurantIdOf(user), dto.orderedIds);
  }

  @Patch('categories/:id/items/reorder')
  @Roles(UserRole.MERCHANT)
  async reorderItems(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) categoryId: string,
    @Body() dto: ReorderDto,
  ) {
    return this.menu.reorderItems(await this.restaurantIdOf(user), categoryId, dto.orderedIds);
  }

  @Post('items')
  @Roles(UserRole.MERCHANT)
  @ApiOperation({ summary: 'إضافة صنف بخياراته وإضافاته (شاشة ٨)' })
  createItem(@Body() dto: CreateItemDto) {
    return this.menu.createItem(dto);
  }

  // لازم يفضل **قبل** `items/:id` — Nest بيطابق بترتيب التعريف، ولو اتأخر
  // هياخده الـ `:id` ويرفض «availability» في ParseUUIDPipe بـ 400.
  @Patch('items/availability')
  @Roles(UserRole.MERCHANT)
  @ApiOperation({ summary: 'إتاحة/إيقاف صنف أو مجموعة أصناف (شاشة ٩)' })
  async setAvailability(@CurrentUser() user: AuthUser, @Body() dto: SetAvailabilityDto) {
    return this.menu.setAvailability(
      await this.restaurantIdOf(user),
      dto.itemIds,
      dto.availability,
    );
  }

  @Patch('items/:id')
  @Roles(UserRole.MERCHANT)
  async updateItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateItemDto,
  ) {
    return this.menu.updateItem(await this.restaurantIdOf(user), id, body);
  }

  @Delete('items/:id')
  @Roles(UserRole.MERCHANT)
  async deleteItem(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.menu.deleteItem(await this.restaurantIdOf(user), id);
  }

  @Get('items/search')
  @Roles(UserRole.MERCHANT, UserRole.ADMIN)
  async search(@CurrentUser() user: AuthUser, @Query('q') q: string) {
    return this.menu.searchItems(await this.restaurantIdOf(user), q);
  }
}

@Module({
  providers: [MenuService],
  controllers: [MenuController],
  exports: [MenuService],
})
export class MenuModule {}
