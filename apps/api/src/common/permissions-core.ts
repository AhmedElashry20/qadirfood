// الجزء النقي من الصلاحيات — من غير أي اعتماد على NestJS أو Prisma، عشان
// يتّختبر بسرعة وبمعزل. الجارد والديكوريتر في `permissions.ts` بيستوردوا من هنا.

/** كتالوج الصلاحيات — المفتاح بيتخزّن، والوصف بيظهر في اللوحة. */
export const PERMISSIONS = {
  'orders.cancel': 'إلغاء الطلبات',
  'payments.refund': 'استرداد المبالغ',
  'finance.settle': 'اعتماد التسويات والتحويلات',
  'compliance.review': 'مراجعة الوثائق والتحقق بالوجه',
  'users.manage': 'إدارة المستخدمين والصلاحيات',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

/**
 * منطق التحقق من الصلاحيات — **`granted` فاضية = صلاحية كاملة** (سوبر أدمن)،
 * وإلا لازم كل `required` يبقى ضمن `granted`.
 */
export function evaluatePermissions(
  granted: string[],
  required: string[],
): { allowed: boolean; missing: PermissionKey[] } {
  if (!required.length) return { allowed: true, missing: [] };
  if (!granted.length) return { allowed: true, missing: [] }; // فاضية = صلاحية كاملة
  const missing = required.filter((p) => !granted.includes(p)) as PermissionKey[];
  return { allowed: missing.length === 0, missing };
}
