import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  Prisma,
  TicketSenderRole,
  TicketStatus,
  UserRole,
  type SupportTicket,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { TrackingGateway } from '../tracking/tracking.gateway';
import { ListTicketsQueryDto, RaiseTicketDto, ReplyTicketDto, UpdateTicketDto } from './support.dto';
import type { AuthUser } from '../common';

@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TrackingGateway,
  ) {}

  // ── العميل بيفتح تذكرة ──
  async raise(customerId: string, dto: RaiseTicketDto) {
    if (dto.orderId) {
      const order = await this.prisma.order.findFirst({
        where: { id: dto.orderId, customerId },
        select: { id: true },
      });
      if (!order) throw new BadRequestException('الطلب ليس طلبك أو غير موجود');
    }

    const ticket = await this.prisma.$transaction(async (tx) => {
      const ticketNumber = await this.nextTicketNumber(tx);
      const created = await tx.supportTicket.create({
        data: {
          ticketNumber,
          customerId,
          orderId: dto.orderId,
          category: dto.category,
          subject: dto.subject.trim(),
          status: TicketStatus.OPEN,
          messages: {
            create: { senderRole: TicketSenderRole.CUSTOMER, senderId: null, body: dto.body.trim() },
          },
        },
      });
      return created;
    });

    this.gateway.emitTicketNew({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      priority: ticket.priority,
      category: ticket.category,
    });

    return this.detailById(ticket.id, false);
  }

  // ── تذاكر العميل ──
  async myTickets(customerId: string) {
    const tickets = await this.prisma.supportTicket.findMany({
      where: { customerId },
      orderBy: { lastMessageAt: 'desc' },
      include: { order: { select: { orderNumber: true } } },
    });
    return tickets.map((t) => this.toListRow(t, null));
  }

  // ── الأدمن: روستر + فلاتر ──
  async list(query: ListTicketsQueryDto) {
    const where: Prisma.SupportTicketWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.category) where.category = query.category;
    if (query.priority) where.priority = query.priority;
    if (query.search?.trim()) {
      const s = query.search.trim();
      where.OR = [
        { ticketNumber: { contains: s, mode: 'insensitive' } },
        { subject: { contains: s, mode: 'insensitive' } },
        { order: { orderNumber: { contains: s, mode: 'insensitive' } } },
        { customer: { user: { fullName: { contains: s, mode: 'insensitive' } } } },
      ];
    }

    const tickets = await this.prisma.supportTicket.findMany({
      where,
      orderBy: [{ status: 'asc' }, { lastMessageAt: 'desc' }],
      include: {
        order: { select: { orderNumber: true } },
        customer: { select: { user: { select: { fullName: true, phone: true } } } },
        assignedTo: { select: { fullName: true } },
      },
    });
    return tickets.map((t) =>
      this.toListRow(t, {
        customerName: t.customer.user.fullName,
        customerPhone: t.customer.user.phone,
        assignee: t.assignedTo?.fullName ?? null,
      }),
    );
  }

  // ── عدّادات التبويبات ──
  async stats() {
    const grouped = await this.prisma.supportTicket.groupBy({ by: ['status'], _count: true });
    const counts: Record<string, number> = {};
    for (const s of Object.values(TicketStatus)) counts[s] = 0;
    for (const g of grouped) counts[g.status] = g._count;
    // بلا إسناد — مؤشر مهم لفريق الدعم.
    const unassigned = await this.prisma.supportTicket.count({
      where: { assignedToId: null, status: { not: TicketStatus.CLOSED } },
    });
    return { counts, unassigned, total: Object.values(counts).reduce((a, b) => a + b, 0) };
  }

  // ── تفاصيل تذكرة + المحادثة ──
  async detail(viewer: AuthUser, id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('التذكرة غير موجودة');

    const isAdmin = viewer.role === UserRole.ADMIN;
    if (!isAdmin && ticket.customerId !== viewer.customerId) {
      throw new ForbiddenException('هذه التذكرة ليست تذكرتك');
    }
    return this.detailById(id, isAdmin);
  }

  // ── رد على تذكرة ──
  async reply(viewer: AuthUser, id: string, dto: ReplyTicketDto) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('التذكرة غير موجودة');

    const isAdmin = viewer.role === UserRole.ADMIN;
    if (!isAdmin && ticket.customerId !== viewer.customerId) {
      throw new ForbiddenException('هذه التذكرة ليست تذكرتك');
    }
    if (ticket.status === TicketStatus.CLOSED) {
      throw new BadRequestException('التذكرة مقفولة — افتح تذكرة جديدة');
    }
    // العميل مايكتبش ملاحظات داخلية.
    const internal = isAdmin ? !!dto.internal : false;

    await this.prisma.$transaction(async (tx) => {
      await tx.ticketMessage.create({
        data: {
          ticketId: id,
          senderRole: isAdmin ? TicketSenderRole.AGENT : TicketSenderRole.CUSTOMER,
          senderId: viewer.userId,
          body: dto.body.trim(),
          internal,
        },
      });
      // الملاحظة الداخلية مابتغيّرش حالة التذكرة. الرد الظاهر بيغيّرها:
      //   • رد الدعم → بانتظار رد العميل (PENDING)
      //   • رد العميل → رجعت مفتوحة (OPEN)
      const nextStatus = internal
        ? undefined
        : isAdmin
          ? TicketStatus.PENDING
          : TicketStatus.OPEN;
      await tx.supportTicket.update({
        where: { id },
        data: { lastMessageAt: new Date(), ...(nextStatus ? { status: nextStatus } : {}) },
      });
    });

    const message = {
      ticketId: id,
      senderRole: isAdmin ? TicketSenderRole.AGENT : TicketSenderRole.CUSTOMER,
      body: dto.body.trim(),
      internal,
      at: new Date().toISOString(),
    };
    // الملاحظة الداخلية للأدمن بس — مانبعتهاش لغرفة العميل.
    if (internal) {
      this.gateway.emitTicketNew({
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        priority: ticket.priority,
        category: ticket.category,
      });
    } else {
      this.gateway.emitTicketMessage(id, ticket.customerId, message);
    }

    return this.detailById(id, isAdmin);
  }

  // ── الأدمن: تغيير حالة/أولوية/إسناد ──
  async update(admin: AuthUser, id: string, dto: UpdateTicketDto) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('التذكرة غير موجودة');

    const changes: string[] = [];
    const data: Prisma.SupportTicketUpdateInput = {};

    if (dto.status && dto.status !== ticket.status) {
      data.status = dto.status;
      if (dto.status === TicketStatus.CLOSED) data.resolvedAt = new Date();
      changes.push(`الحالة → ${dto.status}`);
    }
    if (dto.priority && dto.priority !== ticket.priority) {
      data.priority = dto.priority;
      changes.push(`الأولوية → ${dto.priority}`);
    }
    if (dto.assignedToId !== undefined && dto.assignedToId !== ticket.assignedToId) {
      if (dto.assignedToId) {
        const agent = await this.prisma.user.findFirst({
          where: { id: dto.assignedToId, role: UserRole.ADMIN },
          select: { fullName: true },
        });
        if (!agent) throw new BadRequestException('الموظف المسند لازم يكون أدمن');
        data.assignedTo = { connect: { id: dto.assignedToId } };
        changes.push(`الإسناد → ${agent.fullName}`);
      } else {
        data.assignedTo = { disconnect: true };
        changes.push('فك الإسناد');
      }
    }

    if (!changes.length) return this.detailById(id, true);

    await this.prisma.$transaction(async (tx) => {
      await tx.supportTicket.update({ where: { id }, data });
      // رسالة نظام بتوثّق التغيير في المحادثة نفسها.
      await tx.ticketMessage.create({
        data: {
          ticketId: id,
          senderRole: TicketSenderRole.SYSTEM,
          senderId: admin.userId,
          body: changes.join(' · '),
          internal: false,
        },
      });
    });

    const fresh = await this.prisma.supportTicket.findUniqueOrThrow({ where: { id } });
    this.gateway.emitTicketUpdated({ id, customerId: fresh.customerId, status: fresh.status });
    return this.detailById(id, true);
  }

  // ── مساعدات ──

  private async detailById(id: string, includeInternal: boolean) {
    const ticket = await this.prisma.supportTicket.findUniqueOrThrow({
      where: { id },
      include: {
        order: { select: { orderNumber: true, total: true } },
        customer: { select: { user: { select: { fullName: true, phone: true } } } },
        assignedTo: { select: { id: true, fullName: true } },
        messages: {
          where: includeInternal ? {} : { internal: false },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      customer: { name: ticket.customer.user.fullName, phone: ticket.customer.user.phone },
      order: ticket.order ? { orderNumber: ticket.order.orderNumber, total: Number(ticket.order.total) } : null,
      assignedTo: ticket.assignedTo ?? null,
      createdAt: ticket.createdAt.toISOString(),
      lastMessageAt: ticket.lastMessageAt.toISOString(),
      resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
      messages: ticket.messages.map((m) => ({
        id: m.id,
        senderRole: m.senderRole,
        body: m.body,
        internal: m.internal,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  private toListRow(
    t: SupportTicket & { order?: { orderNumber: string } | null },
    admin: { customerName: string; customerPhone: string; assignee: string | null } | null,
  ) {
    return {
      id: t.id,
      ticketNumber: t.ticketNumber,
      subject: t.subject,
      category: t.category,
      priority: t.priority,
      status: t.status,
      orderNumber: t.order?.orderNumber ?? null,
      createdAt: t.createdAt.toISOString(),
      lastMessageAt: t.lastMessageAt.toISOString(),
      ...(admin ? { customerName: admin.customerName, customerPhone: admin.customerPhone, assignee: admin.assignee } : {}),
    };
  }

  private async nextTicketNumber(tx: Prisma.TransactionClient): Promise<string> {
    const count = await tx.supportTicket.count();
    return `T-${1000 + count}`;
  }
}
