// سجل التدقيق — بيسجّل كل إجراء صلاحية بيحرّك فلوس أو بيغيّر حساب.
//
// السبب: الموديولات المالية (استرداد، تسوية، تحويل، اعتماد سحب، مراجعة وثيقة)
// كلها بتدّي الأدمن قدرة يحرّك فلوس، ومكانش فيه أثر لـ«مين عمل إيه». السجل ده
// بيقفل الفجوة دي — append-only، بيتكتب جوه نفس معاملة الإجراء لما ينفع.

import {
  Controller,
  Get,
  Global,
  Injectable,
  Logger,
  Module,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditAction, Prisma, UserRole } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

import { JwtAuthGuard, Roles, RolesGuard, type AuthUser } from '../common';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';

/** اللي بيتنادى بيه `record` — الأكتر انتشاراً هو الأدمن الفاعل. */
export interface AuditActor {
  userId: string;
  role: UserRole;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * بيسجّل إجراء. `tx` اختياري: مرّره عشان السجل يتكتب جوه نفس معاملة الإجراء
   * — لو الإجراء اترجع (rollback)، السجل يترجع معاه، فمفيش سجل لإجراء ماتمّش.
   *
   * الكتابة مابترميش استثناء لبرّه المعاملة: لو التسجيل فشل خارج transaction،
   * مانوقعش الإجراء الأساسي عشان سطر تدقيق — بنسجّل الفشل في اللوج بس.
   */
  async record(
    actor: AuditActor | null,
    action: AuditAction,
    entityType: string,
    entityId: string,
    summaryAr: string,
    metadata?: Record<string, unknown>,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const data = {
      actorId: actor?.userId ?? null,
      actorRole: actor?.role ?? UserRole.ADMIN,
      action,
      entityType,
      entityId,
      summaryAr,
      metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    };

    if (tx) {
      await client.auditLog.create({ data });
      return;
    }
    try {
      await this.prisma.auditLog.create({ data });
    } catch (error) {
      // مانوقعش الإجراء الأساسي عشان سطر تدقيق فشل — بس مانتجاهلوش بصمت:
      // بيتكتب في اللوج عشان يتراجع، لأن سجل تدقيق ناقص خطر في حد ذاته.
      this.logger.error(`فشل كتابة سجل تدقيق (${action} · ${entityType}:${entityId}): ${(error as Error).message}`);
    }
  }

  async list(query: { action?: AuditAction; entityType?: string; entityId?: string; page: number; pageSize: number }) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { fullName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        summaryAr: row.summaryAr,
        metadata: row.metadata,
        actorName: row.actor?.fullName ?? 'النظام',
        actorRole: row.actorRole,
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}

class ListAuditDto {
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'سجل التدقيق — إجراءات الصلاحية المالية' })
  list(@Query() query: ListAuditDto) {
    return this.audit.list({
      action: query.action,
      entityType: query.entityType,
      entityId: query.entityId,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 30,
    });
  }
}

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
