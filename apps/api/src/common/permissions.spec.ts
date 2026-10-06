import { describe, it, expect } from 'vitest';
import { evaluatePermissions, PERMISSION_KEYS } from './permissions-core';

// الصلاحيات المفصّلة — القاعدة الحسّاسة: **فاضية = صلاحية كاملة** (سوبر أدمن)،
// عشان الحسابات القديمة ما تتقفلش لما اتفعّل الـ RBAC.
describe('تقييم الصلاحيات (RBAC)', () => {
  it('صلاحيات فارغة = صلاحية كاملة (تمرّ أي مطلوب)', () => {
    expect(evaluatePermissions([], ['payments.refund']).allowed).toBe(true);
    expect(evaluatePermissions([], ['finance.settle', 'users.manage']).allowed).toBe(true);
  });

  it('موظف مقصور: يمرّ ما لديه، ويُرفض ما ليس لديه', () => {
    const granted = ['compliance.review'];
    expect(evaluatePermissions(granted, ['compliance.review']).allowed).toBe(true);
    const denied = evaluatePermissions(granted, ['payments.refund']);
    expect(denied.allowed).toBe(false);
    expect(denied.missing).toContain('payments.refund');
  });

  it('يجب أن يكون كل المطلوب موجوداً (لا بعضه)', () => {
    const r = evaluatePermissions(['payments.refund'], ['payments.refund', 'finance.settle']);
    expect(r.allowed).toBe(false);
    expect(r.missing).toEqual(['finance.settle']);
  });

  it('لا صلاحية مطلوبة على المسار → مسموح (endpoint غير محروس)', () => {
    expect(evaluatePermissions(['compliance.review'], []).allowed).toBe(true);
    expect(evaluatePermissions([], []).allowed).toBe(true);
  });

  it('كل مفاتيح الكتالوج نصّية وفريدة', () => {
    expect(PERMISSION_KEYS.length).toBeGreaterThan(0);
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
  });
});
