import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma, TicketStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.module';
import { CreateStaffDto, UpdateStaffDto } from './team.dto';
import type { AuthUser } from '../common';
import { PERMISSIONS, PERMISSION_KEYS, type PermissionKey } from '../common/permissions';

interface Actor {
  userId: string;
  role: AuthUser['role'];
}

@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── سرد موظفي اللوحة (ADMIN) + عدد التذاكر المسندة المفتوحة ──
  async list() {
    const staff = await this.prisma.user.findMany({
      where: { role: UserRole.ADMIN },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        isActive: true,
        createdAt: true,
        permissions: true,
        _count: {
          select: {
            assignedTickets: { where: { status: { not: TicketStatus.CLOSED } } },
          },
        },
      },
    });
    return staff.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      phone: u.phone,
      isActive: u.isActive,
      createdAt: u.createdAt.toISOString(),
      openTickets: u._count.assignedTickets,
      permissions: u.permissions,
      // فاضية = صلاحية كاملة (سوبر أدمن) — اللوحة بتعرض ده صريح.
      fullAccess: u.permissions.length === 0,
    }));
  }

  // ── ضبط صلاحيات موظف ──
  async setPermissions(actor: Actor, id: string, permissions: string[]) {
    const target = await this.prisma.user.findFirst({ where: { id, role: UserRole.ADMIN } });
    if (!target) throw new NotFoundException('الموظف غير موجود');

    const unknown = permissions.filter((p) => !PERMISSION_KEYS.includes(p as PermissionKey));
    if (unknown.length) throw new BadRequestException(`صلاحيات غير معروفة: ${unknown.join('، ')}`);

    const unique = [...new Set(permissions)];

    // منع **تصعيد الصلاحيات على النفس**. مين عنده `users.manage` بيقدر يعدّل
    // صلاحيات الموظفين — لكن ده مايخوّلوش يرفّع نفسه. أهم ثغرة كانت: `[]` =
    // «صلاحية كاملة»، والحارس القديم كان بيتخطّاها لو المصفوفة فاضية، فأدمن
    // مقيّد كان يدّي نفسه صلاحية كاملة بـ setPermissions(self, []).
    if (id === actor.userId) {
      const current = target.permissions; // صلاحيات المستخدم الحالية (هو نفسه)
      const currentlyFull = current.length === 0; // فاضي = كامل
      const wantFull = unique.length === 0;

      if (wantFull) {
        // ترقية نفسك لكامل ممنوعة إلا لو إنت أصلاً كامل (يبقى مافيش تصعيد).
        if (!currentlyFull) {
          throw new ForbiddenException('لا يمكنك منح نفسك صلاحية كاملة — يلزم مسؤول آخر');
        }
      } else {
        // لازم تحتفظ بإدارة المستخدمين عشان ماتقفلش نفسك برّه الإدارة.
        if (!unique.includes('users.manage')) {
          throw new ForbiddenException('ماينفعش تشيل صلاحية «إدارة المستخدمين» من نفسك');
        }
        // ومايصحّش تضيف لنفسك صلاحية معندكش (تصعيد) — إلا لو إنت أصلاً كامل.
        if (!currentlyFull) {
          const escalated = unique.filter((p) => !current.includes(p));
          if (escalated.length) {
            throw new ForbiddenException(`ماينفعش تدّي نفسك صلاحيات جديدة: ${escalated.join('، ')}`);
          }
        }
      }
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: { permissions: unique },
      select: { id: true, fullName: true, permissions: true },
    });

    await this.audit.record(
      actor,
      AuditAction.STAFF_UPDATE,
      'user',
      id,
      unique.length
        ? `ضبط صلاحيات ${updated.fullName}: ${unique.join('، ')}`
        : `${updated.fullName} بقى بصلاحية كاملة (بدون قيود)`,
      { permissions: unique },
    );

    return { ...updated, fullAccess: unique.length === 0 };
  }

  /** كتالوج الصلاحيات المتاحة — اللوحة بتبني منه قايمة التبديل. */
  catalog() {
    return PERMISSION_KEYS.map((key) => ({ key, label: PERMISSIONS[key] }));
  }

  // ── إضافة موظف لوحة جديد (بيقدر يدخل بإيميل/كلمة مرور) ──
  async create(actor: Actor, dto: CreateStaffDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          fullName: dto.fullName.trim(),
          email: dto.email.toLowerCase().trim(),
          phone: dto.phone.trim(),
          passwordHash,
          role: UserRole.ADMIN,
        },
        select: { id: true, fullName: true, email: true, phone: true, isActive: true, createdAt: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = (err.meta?.target as string[])?.join(', ') ?? 'البيانات';
        throw new BadRequestException(`مستخدم بنفس ${target.includes('email') ? 'الإيميل' : 'رقم الجوال'} موجود بالفعل`);
      }
      throw err;
    }

    await this.audit.record(
      actor,
      AuditAction.STAFF_CREATE,
      'user',
      user.id,
      `إضافة موظف لوحة: ${user.fullName} (${user.email})`,
      { email: user.email },
    );

    return { ...user, createdAt: user.createdAt.toISOString(), openTickets: 0 };
  }

  // ── تعديل موظف: تفعيل/تعطيل، اسم، إعادة كلمة مرور ──
  async update(actor: Actor, id: string, dto: UpdateStaffDto) {
    const target = await this.prisma.user.findFirst({ where: { id, role: UserRole.ADMIN } });
    if (!target) throw new NotFoundException('الموظف غير موجود');

    // منع تعطيل النفس — عشان الأدمن مايقفلش دخوله بنفسه بالغلط.
    if (dto.isActive === false && id === actor.userId) {
      throw new ForbiddenException('ماينفعش تعطّل حسابك بنفسك');
    }

    const changes: string[] = [];
    const data: Prisma.UserUpdateInput = {};
    if (dto.fullName !== undefined && dto.fullName.trim() !== target.fullName) {
      data.fullName = dto.fullName.trim();
      changes.push('الاسم');
    }
    if (dto.isActive !== undefined && dto.isActive !== target.isActive) {
      data.isActive = dto.isActive;
      changes.push(dto.isActive ? 'تفعيل' : 'تعطيل');
    }
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
      changes.push('إعادة كلمة المرور');
    }

    if (!changes.length) throw new BadRequestException('لا يوجد تغيير');

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: { id: true, fullName: true, email: true, phone: true, isActive: true, createdAt: true },
    });

    await this.audit.record(
      actor,
      AuditAction.STAFF_UPDATE,
      'user',
      id,
      `تعديل موظف ${updated.fullName}: ${changes.join(' · ')}`,
      { changes },
    );

    return { ...updated, createdAt: updated.createdAt.toISOString() };
  }
}
