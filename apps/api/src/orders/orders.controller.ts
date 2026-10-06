import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { OrdersService } from './orders.service';
import { OrderChatService } from './order-chat.service';
import {
  AcceptOrderDto,
  CancelOrderDto,
  CreateOrderDto,
  CreateReviewDto,
  DeliveredDto,
  ListOrdersDto,
  SendOrderMessageDto,
  PickupDto,
  RejectOrderDto,
} from './orders.dto';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard, type AuthUser } from '../common';
import { PermissionsGuard, RequirePermission } from '../common/permissions';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly chat: OrderChatService,
  ) {}

  // ── العميل ──
  @Post()
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: 'إنشاء طلب — الأسعار بتتحسب على السيرفر' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.orders.createOrder(user.customerId!, dto);
  }

  @Post(':id/review')
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: 'تقييم الطلب بعد التسليم (شاشة التقييم)' })
  review(
    @CurrentUser('customerId') customerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReviewDto,
  ) {
    return this.orders.createReview(customerId, id, dto);
  }

  @Get(':id/reorder')
  @Roles(UserRole.CUSTOMER)
  @ApiOperation({ summary: 'بيانات «اطلب مجدداً» — بتملى السلة من طلب قديم من غير ما تنشئ طلب' })
  reorder(@CurrentUser('customerId') customerId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.reorder(customerId, id);
  }

  // ── المطعم ──
  @Get('incoming')
  @Roles(UserRole.MERCHANT)
  @ApiOperation({ summary: 'الطلبات الواردة (شاشة ٢)' })
  incoming(@CurrentUser() user: AuthUser) {
    return this.orders.incomingForBranch(user.branchId!);
  }

  @Get('active')
  @Roles(UserRole.MERCHANT)
  @ApiOperation({ summary: 'الطلبات الجارية (شاشة ٤)' })
  active(@CurrentUser() user: AuthUser) {
    return this.orders.activeForBranch(user.branchId!);
  }

  @Patch(':id/accept')
  @Roles(UserRole.MERCHANT)
  @ApiOperation({ summary: 'قبول الطلب + وقت التحضير (شاشة ٣)' })
  accept(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AcceptOrderDto) {
    return this.orders.acceptOrder(user, id, dto);
  }

  @Patch(':id/reject')
  @Roles(UserRole.MERCHANT)
  @ApiOperation({ summary: 'رفض الطلب — السبب إلزامي' })
  reject(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectOrderDto) {
    return this.orders.rejectOrder(user, id, dto);
  }

  @Patch(':id/preparing')
  @Roles(UserRole.MERCHANT)
  preparing(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.markPreparing(user, id);
  }

  @Patch(':id/ready')
  @Roles(UserRole.MERCHANT)
  @ApiOperation({ summary: 'جاهز للاستلام (شاشة ٥) — يبلّغ الكابتن' })
  ready(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.markReady(user, id);
  }

  // ── الكابتن ──
  @Patch(':id/pickup')
  @Roles(UserRole.CAPTAIN)
  @ApiOperation({ summary: 'استلام الطلب — يتطلب مطابقة كود الاستلام' })
  pickup(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PickupDto) {
    return this.orders.captainPickup(user, id, dto.pickupCode);
  }

  @Patch(':id/on-the-way')
  @Roles(UserRole.CAPTAIN)
  onTheWay(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.markOnTheWay(user, id);
  }

  @Patch(':id/delivered')
  @Roles(UserRole.CAPTAIN)
  @ApiOperation({ summary: 'تم التسليم — يتطلب كود العميل + صورة، ويقفل الحساب' })
  delivered(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DeliveredDto) {
    return this.orders.markDelivered(user, id, dto.code, dto.photoUrl);
  }

  // ── مشترك ──
  @Patch(':id/cancel')
  @Roles(UserRole.CUSTOMER, UserRole.ADMIN)
  // الصلاحية بتخص الأدمن بس — العميل بيلغي طلبه عادي (الجارد بيعدّي غير الأدمن).
  @RequirePermission('orders.cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelOrderDto) {
    return this.orders.cancelOrder(user, id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'سجل الطلبات بفلاتر (شاشة ٦)' })
  list(@CurrentUser() user: AuthUser, @Query() query: ListOrdersDto) {
    return this.orders.list(user, query);
  }

  // ── محادثة الطلب (عميل ↔ مندوب) ──
  // مفتوحة من إسناد المندوب لحد التسليم. الأدمن بيقرا ومابيكتبش.

  @Get(':id/messages')
  @ApiOperation({ summary: 'رسايل محادثة الطلب + حالة المحادثة' })
  messages(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.list(user, id);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'إرسال رسالة في محادثة الطلب' })
  sendMessage(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendOrderMessageDto,
  ) {
    return this.chat.send(user, id, dto.body);
  }

  @Patch(':id/messages/read')
  @ApiOperation({ summary: 'تعليم رسايل الطرف الآخر كمقروءة' })
  readMessages(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.chat.markRead(user, id);
  }

  @Get(':id/events')
  @ApiOperation({ summary: 'سجل أحداث الطلب — من فعل ماذا ومتى' })
  events(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.events(user, id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.findOne(user, id);
  }
}
