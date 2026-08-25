// صلاحيات مفصّلة على مستوى العملية — الطبقة اللي فوق `@Roles`. الدور بيقول
// «ده أدمن»، والصلاحية بتقول «الأدمن ده مسموح له يعمل إيه بالظبط».
//
// القاعدة: `User.permissions` **فاضية = صلاحية كاملة** (سوبر أدمن — نفس السلوك
// القديم عشان الحسابات الموجودة ما تتقفلش). لو فيها عناصر، الموظف مقصور عليها.
// الصلاحيات دي بتتفحص من قاعدة البيانات مش من التوكن، عشان أي تعديل يسري فوراً
// من غير ما الموظف يعمل تسجيل دخول من جديد.

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './index';
import { PERMISSIONS, PERMISSION_KEYS, evaluatePermissions, type PermissionKey } from './permissions-core';

// الكتالوج والمنطق النقي في `permissions-core.ts` (مختبَر بمعزل). هنا الربط بـ NestJS.
export { PERMISSIONS, PERMISSION_KEYS, evaluatePermissions, type PermissionKey };

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermission = (...perms: PermissionKey[]) => SetMetadata(PERMISSIONS_KEY, perms);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) throw new ForbiddenException('غير مصرّح');
    // الصلاحيات المفصّلة بتخص موظفي اللوحة بس — الأدوار التانية بيحكمها `@Roles`.
    if (user.role !== UserRole.ADMIN) return true;

    const row = await this.prisma.user.findUnique({
      where: { id: user.userId },
      select: { permissions: true },
    });
    const { allowed, missing } = evaluatePermissions(row?.permissions ?? [], required);
    if (!allowed) {
      const names = missing.map((p) => PERMISSIONS[p] ?? p).join('، ');
      throw new ForbiddenException(`مالكش صلاحية: ${names}`);
    }
    return true;
  }
}
