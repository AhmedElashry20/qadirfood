// شركات الأسطول — الشركة بتوفّر مناديب (كباتن) للمنصة، وبتدير مناديبها من لوحة
// خاصة بيها. المنصة بتتحاسب مع الشركة كطرف (زي المطعم): مستحقات مناديبها
// بتتجمّع وتتحوّل للشركة، والشركة بتوزّع (تسويات الشركة — مرحلة تانية).
//
// النطاق (scoping) هو جوهر الموديول: مستخدم الشركة بيشوف/يدير مناديب شركته بس،
// وممنوع يوصل لأي كابتن تابع لشركة تانية أو مستقل.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CompanyStatus, Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import type { AuthUser } from '../common';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AssignCaptainDto,
  CreateCompanyDto,
  CreateCompanyUserDto,
  UpdateCompanyDto,
} from './companies.dto';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  // ────────────────────────────────────────────────────────────
  // النطاق — أساس الأمان
  // ────────────────────────────────────────────────────────────

  /**
   * بيرجّع الـ companyId اللي الطلب مسموح يشتغل عليه.
   * الأدمن ممكن يمرّر أي شركة (أو كلهم لو null). مستخدم الشركة مقفول على شركته
   * — لو حاول يمرّر شركة تانية بنرفض صراحةً.
   */
  private scopeCompanyId(user: AuthUser, requested?: string): string | undefined {
    if (user.role === UserRole.ADMIN) return requested;
    if (user.role === UserRole.COMPANY) {
      if (!user.companyId) throw new ForbiddenException('الجلسة مش مربوطة بشركة');
      if (requested && requested !== user.companyId) {
        throw new ForbiddenException('مش مسموح لك بشركة تانية');
      }
      return user.companyId;
    }
    throw new ForbiddenException('غير مصرح');
  }

  // ────────────────────────────────────────────────────────────
  // الأدمن — إدارة الشركات
  // ────────────────────────────────────────────────────────────

  async create(dto: CreateCompanyDto) {
    const company = await this.prisma.company.create({
      data: {
        nameAr: dto.nameAr,
        nameEn: dto.nameEn,
        contactPhone: dto.contactPhone,
        commissionRate: dto.commissionRate ?? 0,
      },
    });
    return this.mapCompany(company, 0);
  }

  async update(id: string, dto: UpdateCompanyDto) {
    await this.getOrThrow(id);
    const company = await this.prisma.company.update({
      where: { id },
      data: {
        ...(dto.nameAr !== undefined ? { nameAr: dto.nameAr } : {}),
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
        ...(dto.contactPhone !== undefined ? { contactPhone: dto.contactPhone } : {}),
        ...(dto.commissionRate !== undefined ? { commissionRate: dto.commissionRate } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
    const count = await this.prisma.captain.count({ where: { companyId: id } });
    return this.mapCompany(company, count);
  }

  async list(user: AuthUser, page = 1, pageSize = 20) {
    // مستخدم الشركة بيشوف شركته بس؛ الأدمن الكل.
    const where = user.role === UserRole.COMPANY ? { id: user.companyId } : {};

    const [rows, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        include: { _count: { select: { captains: true, users: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.company.count({ where }),
    ]);

    return {
      data: rows.map((c) => ({ ...this.mapCompany(c, c._count.captains), userCount: c._count.users })),
      total,
      page,
      pageSize,
    };
  }

  async detail(user: AuthUser, id: string) {
    this.scopeCompanyId(user, id);
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: { _count: { select: { captains: true, users: true } } },
    });
    if (!company) throw new NotFoundException('الشركة غير موجودة');
    return { ...this.mapCompany(company, company._count.captains), userCount: company._count.users };
  }

  /** الشركة الحالية لمستخدم الشركة — «GET /companies/me». */
  async me(user: AuthUser) {
    if (user.role !== UserRole.COMPANY || !user.companyId) {
      throw new ForbiddenException('ده مسار مستخدمي الشركات');
    }
    return this.detail(user, user.companyId);
  }

  // ────────────────────────────────────────────────────────────
  // ربط المناديب — الأدمن بس
  // ────────────────────────────────────────────────────────────

  /**
   * ربط كابتن بشركة (أو فكّه لو `companyId` = null).
   *
   * الكابتن بيتبع شركة واحدة بس. الربط بيغيّر وجهة مستحقاته: من محفظته المباشرة
   * لتسوية الشركة (المرحلة الجاية). عشان كده الأدمن بس اللي يعمله — قرار مالي.
   */
  async assignCaptain(dto: AssignCaptainDto) {
    const captain = await this.prisma.captain.findUnique({ where: { id: dto.captainId } });
    if (!captain) throw new NotFoundException('الكابتن غير موجود');

    if (dto.companyId) {
      await this.getOrThrow(dto.companyId);
    }

    const updated = await this.prisma.captain.update({
      where: { id: dto.captainId },
      data: { companyId: dto.companyId ?? null },
      include: { user: { select: { fullName: true } }, company: { select: { nameAr: true } } },
    });

    return {
      captainId: updated.id,
      fullName: updated.user.fullName,
      companyId: updated.companyId,
      companyName: updated.company?.nameAr ?? null,
    };
  }

  // ────────────────────────────────────────────────────────────
  // مستخدمو لوحة الشركة — الأدمن بس
  // ────────────────────────────────────────────────────────────

  /** إنشاء حساب دخول للوحة الشركة. */
  async createUser(companyId: string, dto: CreateCompanyUserDto) {
    await this.getOrThrow(companyId);

    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { phone: dto.phone }] },
    });
    if (existing) throw new ConflictException('فيه مستخدم بنفس الإيميل أو الجوال');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        role: UserRole.COMPANY,
        companiesOf: { create: { companyId } },
      },
    });

    return { id: user.id, fullName: user.fullName, email: user.email, phone: user.phone };
  }

  async listUsers(user: AuthUser, companyId: string) {
    this.scopeCompanyId(user, companyId);
    const rows = await this.prisma.companyUser.findMany({
      where: { companyId },
      include: { user: { select: { id: true, fullName: true, email: true, phone: true, isActive: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      id: r.user.id,
      fullName: r.user.fullName,
      email: r.user.email,
      phone: r.user.phone,
      isActive: r.user.isActive,
    }));
  }

  // ────────────────────────────────────────────────────────────
  // مساعدات
  // ────────────────────────────────────────────────────────────

  private async getOrThrow(id: string) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('الشركة غير موجودة');
    return company;
  }

  private mapCompany(
    company: { id: string; nameAr: string; nameEn: string | null; contactPhone: string | null; commissionRate: Prisma.Decimal; status: CompanyStatus; createdAt: Date },
    captainCount: number,
  ) {
    return {
      id: company.id,
      nameAr: company.nameAr,
      nameEn: company.nameEn,
      contactPhone: company.contactPhone,
      commissionRate: Number(company.commissionRate),
      status: company.status,
      captainCount,
      createdAt: company.createdAt.toISOString(),
    };
  }
}
