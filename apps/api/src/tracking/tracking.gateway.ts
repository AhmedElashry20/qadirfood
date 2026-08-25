import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { CaptainStatus, UserRole } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { CaptainsService } from '../captains/captains.service';
import { RedisService } from '../redis/redis.service';
import { DispatchService } from '../dispatch/dispatch.service';

/** أسماء الأحداث — لازم تفضل مطابقة لـ packages/shared/src/socket-events.ts حرف بحرف. */
const EV = {
  ORDER_NEW: 'order:new',
  ORDER_CANCELLED_BY_CUSTOMER: 'order:cancelled_by_customer',
  CAPTAIN_ASSIGNED: 'order:captain_assigned',
  CAPTAIN_ARRIVED_AT_BRANCH: 'order:captain_arrived',
  TRIP_OFFER: 'trip:offer',
  TRIP_OFFER_EXPIRED: 'trip:offer_expired',
  TRIP_CANCELLED: 'trip:cancelled',
  ORDER_READY: 'order:ready',
  ORDER_STATUS_CHANGED: 'order:status_changed',
  CAPTAIN_LOCATION: 'captain:location',
  ETA_UPDATED: 'order:eta_updated',
  BRANCH_STATUS_CHANGED: 'branch:status_changed',
  ADMIN_ALERT: 'admin:alert',
  TICKET_NEW: 'ticket:new',
  TICKET_MESSAGE: 'ticket:message',
  TICKET_UPDATED: 'ticket:updated',
  ERROR: 'error',
} as const;

interface SocketUser {
  userId: string;
  role: UserRole;
  branchId?: string;
  captainId?: string;
  customerId?: string;
}

@WebSocketGateway({
  cors: { origin: (process.env.CORS_ORIGINS ?? '*').split(','), credentials: true },
})
export class TrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(TrackingGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Inject(forwardRef(() => DispatchService))
    private readonly dispatch: DispatchService,
    private readonly captains: CaptainsService,
  ) {}

  // ────────────────────────────────────────────────────────────
  // الاتصال والغرف
  // ────────────────────────────────────────────────────────────

  async handleConnection(client: Socket) {
    try {
      const token = (client.handshake.auth?.token ?? client.handshake.headers.authorization?.replace('Bearer ', '')) as
        | string
        | undefined;

      if (!token) throw new Error('لا يوجد رمز مصادقة');

      const payload = this.jwt.verify<SocketUser>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });

      client.data.user = payload;

      // كل عميل بيدخل غرفه تلقائياً حسب دوره
      if (payload.role === UserRole.MERCHANT && payload.branchId) {
        await client.join(`branch:${payload.branchId}`);
      }
      if (payload.role === UserRole.CAPTAIN && payload.captainId) {
        await client.join(`captain:${payload.captainId}`);
      }
      if (payload.role === UserRole.CUSTOMER && payload.customerId) {
        await client.join(`customer:${payload.customerId}`);
      }
      if (payload.role === UserRole.ADMIN) {
        await client.join('admin');
      }

      this.logger.log(`اتصال: ${payload.role} ${payload.userId}`);
    } catch (err) {
      client.emit(EV.ERROR, { message: 'فشل التحقق من الهوية' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const user = client.data.user as SocketUser | undefined;
    if (!user) return;

    // الكابتن قطع الاتصال → يخرج من دائرة الإسناد فوراً وتتقفل ورديته لو مفتوحة.
    if (user.role === UserRole.CAPTAIN && user.captainId) {
      await this.redis.removeCaptainLocation(user.captainId);
      const captain = await this.prisma.captain.findUnique({
        where: { id: user.captainId },
        select: { status: true },
      });
      if (captain?.status === CaptainStatus.ONLINE) {
        await this.captains.endShift(user.captainId);
      }
    }

    // فرع المطعم قطع الاتصال → توقف توجيه طلبات جديدة له + تنبيه الأدمن.
    // ده مش تفصيلة تجميلية: لو الطلبات راحت لفرع مش شايفها، العميل هيستنى على الفاضي.
    if (user.role === UserRole.MERCHANT && user.branchId) {
      const stillConnected = await this.server.in(`branch:${user.branchId}`).fetchSockets();
      if (stillConnected.length === 0) {
        this.logger.warn(`الفرع ${user.branchId} فقد الاتصال — تنبيه الأدمن`);
        this.emitAdminAlert({ type: 'BRANCH_OFFLINE', branchId: user.branchId });
      }
    }
  }

  @SubscribeMessage('join')
  async onJoin(@ConnectedSocket() client: Socket, @MessageBody() body: { rooms: string[] }) {
    const user = client.data.user as SocketUser;
    if (!user) return;
    for (const room of body.rooms ?? []) {
      // **كل غرفة بتتفحص ملكيتها** — من غير الفحص ده أي مستخدم مسجّل يقدر يدخل
      // غرفة `admin` أو غرفة عميل/كابتن/تذكرة تانية ويشوف بياناتهم (وكود الاستلام).
      if (await this.canJoinRoom(user, room)) {
        await client.join(room);
      } else {
        this.logger.warn(`رفض انضمام ${user.role}:${user.userId} لغرفة ${room}`);
      }
    }
  }

  /** فحص ملكية الغرفة — الأدمن بس للغرف الإدارية، وكل واحد لغرفته هو. */
  private async canJoinRoom(user: SocketUser, room: string): Promise<boolean> {
    // غرفة الأدمن ومشتقّاتها — للأدمن بس.
    if (room === 'admin' || room.startsWith('admin')) return user.role === UserRole.ADMIN;

    if (room.startsWith('customer:')) {
      return user.role === UserRole.ADMIN || room.slice('customer:'.length) === user.customerId;
    }
    if (room.startsWith('captain:')) {
      return user.role === UserRole.ADMIN || room.slice('captain:'.length) === user.captainId;
    }
    if (room.startsWith('branch:')) {
      return user.role === UserRole.ADMIN || room.slice('branch:'.length) === user.branchId;
    }
    if (room.startsWith('ticket:')) {
      // العميل صاحب التذكرة بس (أو الأدمن).
      if (user.role === UserRole.ADMIN) return true;
      const t = await this.prisma.supportTicket.findUnique({
        where: { id: room.slice('ticket:'.length) },
        select: { customerId: true },
      });
      return !!t && t.customerId === user.customerId;
    }
    if (room.startsWith('order:')) {
      const order = await this.prisma.order.findUnique({ where: { id: room.slice('order:'.length) } });
      return (
        user.role === UserRole.ADMIN ||
        order?.customerId === user.customerId ||
        order?.captainId === user.captainId ||
        order?.branchId === user.branchId
      );
    }
    // أي غرفة غير معروفة — ممنوعة افتراضياً (fail-closed).
    return false;
  }

  @SubscribeMessage('leave')
  async onLeave(@ConnectedSocket() client: Socket, @MessageBody() body: { rooms: string[] }) {
    for (const room of body.rooms ?? []) await client.leave(room);
  }

  // ────────────────────────────────────────────────────────────
  // الكابتن: بث الموقع كل ٥ ثواني
  // ────────────────────────────────────────────────────────────

  @SubscribeMessage('captain:location_update')
  async onCaptainLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { lat: number; lng: number; heading?: number; speedKmh?: number; orderId?: string },
  ) {
    const user = client.data.user as SocketUser;
    if (user?.role !== UserRole.CAPTAIN || !user.captainId) return;

    // المصدر الحي = Redis. الكتابة في Postgres كل ٥ ثواني هتقتل الداتابيز.
    await this.redis.setCaptainLocation(user.captainId, body.lat, body.lng);

    // العميل بيشوف الكابتن على الخريطة لحظياً — **بس لطلب مسند للكابتن ده فعلاً**.
    // من غير الفحص ده، أي كابتن يقدر يبعت orderId لأي طلب ويحقن موقع مزيّف في
    // شاشة تتبّع عميل مش بتاعه (تشويش/تحرّش).
    if (body.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: body.orderId },
        select: { captainId: true },
      });
      if (order?.captainId === user.captainId) {
        this.server.to(`order:${body.orderId}`).emit(EV.CAPTAIN_LOCATION, {
          captainId: user.captainId,
          orderId: body.orderId,
          location: { lat: body.lat, lng: body.lng },
          heading: body.heading,
          speedKmh: body.speedKmh,
          at: new Date().toISOString(),
        });
      }
    }

    // الأدمن بيشوف كل الكباتن على الخريطة الحية
    this.server.to('admin').emit(EV.CAPTAIN_LOCATION, {
      captainId: user.captainId,
      location: { lat: body.lat, lng: body.lng },
      at: new Date().toISOString(),
    });
  }

  @SubscribeMessage('captain:status_update')
  async onCaptainStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { status: CaptainStatus; lat?: number; lng?: number },
  ) {
    const user = client.data.user as SocketUser;
    if (user?.role !== UserRole.CAPTAIN || !user.captainId) return;

    // بدء/إنهاء الوردية مع تغيير الحالة — عشان «ساعات الاتصال» تبقى صح سواء
    // الكابتن راح أونلاين من السوكيت أو من الـ REST. الدالتين idempotent فمافيش
    // تكرار لو الحالة اتبعتت مرتين.
    if (body.status === CaptainStatus.ONLINE) {
      await this.captains.startShift(user.captainId);
    } else if (body.status === CaptainStatus.OFFLINE) {
      await this.captains.endShift(user.captainId);
    } else {
      await this.prisma.captain.update({
        where: { id: user.captainId },
        data: { status: body.status, lastSeenAt: new Date() },
      });
    }

    if (body.status === CaptainStatus.ONLINE && body.lat && body.lng) {
      await this.redis.setCaptainLocation(user.captainId, body.lat, body.lng);
      await this.prisma.setPoint('captains', 'lastLocation', user.captainId, body.lat, body.lng);
    } else if (body.status === CaptainStatus.OFFLINE) {
      await this.redis.removeCaptainLocation(user.captainId);
    }
  }

  @SubscribeMessage('trip:offer_response')
  async onOfferResponse(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { orderId: string; accepted: boolean },
  ) {
    const user = client.data.user as SocketUser;
    if (user?.role !== UserRole.CAPTAIN || !user.captainId) return;

    const won = await this.dispatch.handleOfferResponse(user.captainId, body.orderId, body.accepted);
    client.emit('trip:offer_result', { orderId: body.orderId, accepted: body.accepted, won });
  }

  @SubscribeMessage('heartbeat')
  onHeartbeat(@ConnectedSocket() client: Socket) {
    client.emit('heartbeat:ack', { at: new Date().toISOString() });
  }

  // ────────────────────────────────────────────────────────────
  // البث من الخدمات
  // ────────────────────────────────────────────────────────────

  /** بث موقع كابتن للوحة الأدمن — بتستخدمه محاكاة الحركة الحيّة. */
  broadcastCaptainLocation(captainId: string, lat: number, lng: number) {
    this.server.to('admin').emit(EV.CAPTAIN_LOCATION, {
      captainId,
      location: { lat, lng },
      at: new Date().toISOString(),
    });
  }

  /**
   * بث موقع كابتن **أثناء رحلة** — للعميل صاحب الطلب (غرفة `order:{id}`)
   * وللأدمن مع بعض. نفس شكل `captain:location_update` الحقيقي بالظبط، فشاشة
   * تتبّع العميل بتحرّك الماركر وتعيد حساب الوصول زي ما الكابتن الحقيقي يبعت.
   */
  broadcastTripLocation(captainId: string, orderId: string, lat: number, lng: number) {
    const at = new Date().toISOString();
    this.server.to(`order:${orderId}`).emit(EV.CAPTAIN_LOCATION, {
      captainId,
      orderId,
      location: { lat, lng },
      at,
    });
    this.server.to('admin').emit(EV.CAPTAIN_LOCATION, {
      captainId,
      location: { lat, lng },
      at,
    });
  }

  /** طلب وارد جديد — ده اللي بيشغّل صوت التنبيه المتكرر في تطبيق المطعم. */
  emitNewOrder(order: any) {
    // لوحة الأدمن محتاجة تشوف الطلبات الجديدة كمان — من غير `admin` هنا
    // الطلب الجديد مايظهرش في اللوحة إلا لما حالته تتغيّر.
    this.server.to([`branch:${order.branchId}`, 'admin']).emit(EV.ORDER_NEW, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      branchId: order.branchId,
      total: Number(order.total),
      itemCount: order.items?.length ?? 0,
      customerNotes: order.customerNotes ?? undefined,
      placedAt: order.placedAt.toISOString(),
      items: (order.items ?? []).map((i: any) => ({
        nameAr: i.nameAr,
        quantity: i.quantity,
        notes: i.notes ?? undefined,
        options: (i.options ?? []).map((o: any) => o.nameAr),
      })),
    });
  }

  emitOrderStatusChanged(order: any) {
    const payload = {
      orderId: order.id,
      status: order.status,
      changedAt: new Date().toISOString(),
      captain: order.captain
        ? {
            id: order.captain.id,
            name: order.captain.user.fullName,
            phone: order.captain.user.phone,
            plateNumber: order.captain.plateNumber ?? undefined,
            rating: Number(order.captain.rating),
          }
        : undefined,
    };

    this.server.to(`order:${order.id}`).emit(EV.ORDER_STATUS_CHANGED, payload);
    this.server.to(`customer:${order.customerId}`).emit(EV.ORDER_STATUS_CHANGED, payload);
    this.server.to(`branch:${order.branchId}`).emit(EV.ORDER_STATUS_CHANGED, payload);
    this.server.to('admin').emit(EV.ORDER_STATUS_CHANGED, payload);
  }

  emitTripOffer(captainId: string, offer: unknown) {
    this.server.to(`captain:${captainId}`).emit(EV.TRIP_OFFER, offer);
  }

  emitTripOfferExpired(captainId: string, orderId: string) {
    this.server.to(`captain:${captainId}`).emit(EV.TRIP_OFFER_EXPIRED, { orderId });
  }

  emitTripCancelled(captainId: string, orderId: string) {
    this.server.to(`captain:${captainId}`).emit(EV.TRIP_CANCELLED, { orderId });
  }

  /** المطعم بيشوف بيانات الكابتن المسند (شاشة ٤). */
  emitCaptainAssigned(order: any) {
    this.server.to(`branch:${order.branchId}`).emit(EV.CAPTAIN_ASSIGNED, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      captain: {
        id: order.captain.id,
        name: order.captain.user.fullName,
        phone: order.captain.user.phone,
        plateNumber: order.captain.plateNumber ?? undefined,
        rating: Number(order.captain.rating),
      },
    });
  }

  /** المطعم ضغط «جاهز» — الكابتن ياخد تنبيه بكود الاستلام. */
  emitOrderReady(captainId: string, order: any) {
    this.server.to(`captain:${captainId}`).emit(EV.ORDER_READY, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      pickupCode: order.pickupCode,
    });
  }

  // ── تذاكر الدعم ──
  /** تذكرة جديدة — بتنبّه موظفي الدعم في اللوحة لحظياً. */
  emitTicketNew(ticket: { id: string; ticketNumber: string; subject: string; priority: string; category: string }) {
    this.server.to('admin').emit(EV.TICKET_NEW, ticket);
  }

  /** رسالة جديدة في تذكرة — للعميل صاحبها (لو من الدعم) وللوحة الدعم. */
  emitTicketMessage(ticketId: string, customerId: string, message: unknown) {
    this.server.to(`ticket:${ticketId}`).emit(EV.TICKET_MESSAGE, message);
    this.server.to(`customer:${customerId}`).emit(EV.TICKET_MESSAGE, message);
    this.server.to('admin').emit(EV.TICKET_MESSAGE, message);
  }

  /** تغيّرت حالة/إسناد التذكرة — تحديث اللوحة والعميل. */
  emitTicketUpdated(ticket: { id: string; customerId: string; status: string }) {
    this.server.to(`customer:${ticket.customerId}`).emit(EV.TICKET_UPDATED, ticket);
    this.server.to('admin').emit(EV.TICKET_UPDATED, ticket);
  }

  emitOrderCancelledToBranch(order: any) {
    this.server.to(`branch:${order.branchId}`).emit(EV.ORDER_CANCELLED_BY_CUSTOMER, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      reason: order.cancelReason,
    });
  }

  emitBranchStatusChanged(branchId: string, status: string, busyExtraMinutes?: number) {
    this.server.to(`branch:${branchId}`).emit(EV.BRANCH_STATUS_CHANGED, { branchId, status, busyExtraMinutes });
    this.server.to('admin').emit(EV.BRANCH_STATUS_CHANGED, { branchId, status, busyExtraMinutes });
  }

  emitAdminAlert(alert: Record<string, unknown>) {
    this.server.to('admin').emit(EV.ADMIN_ALERT, { ...alert, at: new Date().toISOString() });
  }
}
