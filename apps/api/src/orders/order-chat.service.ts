import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderChatRole, OrderStatus, UserRole } from '@prisma/client';

import type { AuthUser } from '../common';
import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from '../tracking/tracking.gateway';

/**
 * محادثة الطلب بين العميل والمندوب.
 *
 * **مؤقتة بعمر الرحلة**: بتتفتح لما يتسند مندوب وبتتقفل بالتسليم أو الإلغاء.
 * ده مقصود — قناة دايمة بين عميل ومندوب من غير وسيط بتبقى مساحة تحرّش ومافيش
 * منها سجل تشغيلي مفيد. اللي بعد التسليم مكانه تذكرة دعم.
 *
 * الأدمن بيقرا ومابيكتبش: الدعم بيحتاج يشوف الكلام لما يبقى فيه شكوى، لكن
 * التدخّل في المحادثة بشخصية أحد الطرفين بيلخبط الطرفين.
 */
@Injectable()
export class OrderChatService {
  /** الحالات اللي المحادثة مفتوحة فيها — من إسناد المندوب لحد التسليم. */
  private static readonly OPEN_STATUSES: OrderStatus[] = [
    OrderStatus.CAPTAIN_ASSIGNED,
    OrderStatus.PICKED_UP,
    OrderStatus.ON_THE_WAY,
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TrackingGateway,
  ) {}

  /**
   * بيتأكد إن المستخدم طرف في الطلب ويرجّع دوره في المحادثة.
   *
   * مندوب المشي في التسليم بالتناوب طرف كامل: هو اللي بيوصل للباب، فلو
   * استبعدناه العميل يبقى بيكلّم مندوب مش معاه الطلب.
   */
  private async participant(user: AuthUser, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        customerId: true,
        captainId: true,
        footCaptainId: true,
        orderNumber: true,
      },
    });
    if (!order) throw new NotFoundException('الطلب غير موجود');

    if (user.role === UserRole.CUSTOMER) {
      if (!user.customerId || user.customerId !== order.customerId) {
        throw new ForbiddenException('غير مصرَّح لك بمحادثة هذا الطلب');
      }
      return { order, role: OrderChatRole.CUSTOMER };
    }

    if (user.role === UserRole.CAPTAIN) {
      const isParty =
        !!user.captainId &&
        (user.captainId === order.captainId || user.captainId === order.footCaptainId);
      if (!isParty) throw new ForbiddenException('غير مصرَّح لك بمحادثة هذا الطلب');
      return { order, role: OrderChatRole.CAPTAIN };
    }

    // الأدمن: قراءة بس. `role: null` بيمنع الإرسال في `send`.
    if (user.role === UserRole.ADMIN) return { order, role: null };

    throw new ForbiddenException('غير مصرَّح لك');
  }

  /** رسايل الطلب + حالة المحادثة (مفتوحة/مقفولة). */
  async list(user: AuthUser, orderId: string) {
    const { order } = await this.participant(user, orderId);

    const messages = await this.prisma.orderMessage.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });

    return {
      open: OrderChatService.OPEN_STATUSES.includes(order.status),
      /** null = مافيش مندوب لسه، فمافيش طرف تاني للمحادثة. */
      hasCaptain: !!(order.captainId ?? order.footCaptainId),
      messages: messages.map((m) => ({
        id: m.id,
        senderRole: m.senderRole,
        body: m.body,
        readAt: m.readAt,
        createdAt: m.createdAt,
        /** رسالتي أنا — التطبيق بيحدّد جهة الفقاعة منها. */
        mine: m.senderRole === (user.role === UserRole.CAPTAIN ? 'CAPTAIN' : 'CUSTOMER'),
      })),
    };
  }

  /** إرسال رسالة — العميل أو المندوب بس، والطلب لسه جاري. */
  async send(user: AuthUser, orderId: string, body: string) {
    const { order, role } = await this.participant(user, orderId);
    if (!role) throw new ForbiddenException('الإدارة تقرأ المحادثة ولا تشارك فيها');

    if (!OrderChatService.OPEN_STATUSES.includes(order.status)) {
      // رسالة صريحة بالسبب: «مقفولة» من غير سبب بتخلّي العميل يعيد المحاولة.
      throw new BadRequestException(
        order.status === OrderStatus.DELIVERED || order.status === OrderStatus.CANCELLED
          ? 'تُقفل المحادثة بعد انتهاء الطلب — تواصل مع الدعم'
          : 'تُفتح المحادثة بعد إسناد مندوب للطلب',
      );
    }

    const text = body.trim();
    if (!text) throw new BadRequestException('الرسالة فارغة');

    const message = await this.prisma.orderMessage.create({
      data: { orderId, senderRole: role, senderId: user.userId, body: text },
    });

    const payload = {
      id: message.id,
      orderId,
      senderRole: message.senderRole,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
    };

    this.gateway.emitOrderMessage(
      {
        orderId,
        customerId: order.customerId,
        captainIds: [order.captainId, order.footCaptainId].filter((id): id is string => !!id),
      },
      payload,
    );

    return payload;
  }

  /**
   * تعليم رسايل الطرف التاني كمقروءة.
   *
   * بنعلّم رسايل **الطرف التاني** بس: لو علّمنا الكل، مؤشّر «تمت القراءة» عند
   * المرسل بيبان صح بمجرد إنه فتح الشاشة هو نفسه.
   */
  async markRead(user: AuthUser, orderId: string) {
    const { role } = await this.participant(user, orderId);
    if (!role) return { updated: 0 };

    const otherSide =
      role === OrderChatRole.CUSTOMER ? OrderChatRole.CAPTAIN : OrderChatRole.CUSTOMER;

    const result = await this.prisma.orderMessage.updateMany({
      where: { orderId, senderRole: otherSide, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}
