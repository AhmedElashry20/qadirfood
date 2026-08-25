/**
 * أنواع شركات الأسطول + خرائط العرض.
 *
 * مشتركة بين صفحة «الشركات» (القايمة + لوح التفاصيل) و«الكباتن» (عمود الشركة +
 * فلتر الشركة + تعيين المندوب) — متحطّة في lib عشان الأنواع وخريطة الحالة
 * ماتتكتبش مرتين وتتفرّع بعدين.
 *
 * المصدر: apps/api/src/companies/companies.service.ts
 * commissionRate نسبة مئوية (حصّة المنصة من مستحقات كباتن الشركة)، وكل التواريخ
 * نصوص ISO.
 */
import type { Tone } from '../components/ui';

export type CompanyStatus = 'ACTIVE' | 'SUSPENDED';

/** GET /companies — صف القايمة. `userCount` بيرجع في القايمة والتفاصيل بس مش في POST/PATCH. */
export interface Company {
  id: string;
  nameAr: string;
  nameEn: string | null;
  contactPhone: string | null;
  /** نسبة مئوية — حصّة المنصة من مستحقات كباتن الشركة. */
  commissionRate: number;
  status: CompanyStatus;
  captainCount: number;
  userCount?: number;
  createdAt: string;
}

export interface CompaniesPage {
  data: Company[];
  total: number;
  page: number;
  pageSize: number;
}

/** GET /companies/:id/users */
export interface CompanyUser {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  isActive: boolean;
}

/** رد POST /companies/assign-captain. */
export interface AssignCaptainResult {
  captainId: string;
  fullName: string;
  companyId: string | null;
  companyName: string | null;
}

export const COMPANY_STATUS_META: Record<CompanyStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'نشطة', tone: 'ok' },
  SUSPENDED: { label: 'موقوفة', tone: 'bad' },
};

// ────────────────────────────────────────────────────────────
// تسويات الشركات — «المنصة بتدفع للشركة».
//
// المصدر: apps/api/src/company-settlements/company-settlements.service.ts
// أجور كباتن الشركة على الرحلات المسلّمة بتتجمّع في تسوية واحدة للشركة،
// والمنصة بتدفع الصافي (إجمالي الأجور ناقص عمولة المنصة). كل المبالغ أرقام
// (السيرفر بيعمل Number() على كل Decimal). خريطة الحالة نفسها بتاعة تسويات
// المطاعم (SETTLEMENT_STATUS_META في صفحة المالية) — الحالات متطابقة.
// ────────────────────────────────────────────────────────────

export type CompanySettlementStatus = 'PENDING' | 'PROCESSING' | 'TRANSFERRED';

/** صف/تفاصيل تسوية شركة — GET /company-settlements. */
export interface CompanySettlement {
  id: string;
  companyId: string;
  companyName: string;
  periodStart: string;
  periodEnd: string;
  /** مجموع أجور كباتن الشركة على رحلات الفترة — بيساوي مجموع البنود بالظبط. */
  grossPayout: number;
  /** حصّة المنصة — بتتخصم من الإجمالي. */
  commission: number;
  /** صافي المستحق للشركة = grossPayout ناقص commission. */
  netPayout: number;
  tripCount: number;
  status: CompanySettlementStatus;
  /** آيبان مقنّع «SA98 •••• 1111» — أو null لو الشركة مالهاش حساب دفع. */
  payoutRef: string | null;
  /** مرجع الحوالة البنكية — بيتحط بعد التحويل. */
  transferRef: string | null;
  transferredAt: string | null;
  createdAt: string;
}

/** بند في تسوية الشركة — أجر كابتن على رحلة. مجموع البنود = grossPayout بالظبط. */
export interface CompanySettlementLine {
  id: string;
  orderId: string;
  captainId: string;
  amount: number;
  descriptionAr: string;
}

export type CompanySettlementDetail = CompanySettlement & { lines: CompanySettlementLine[] };

export interface CompanySettlementsPage {
  data: CompanySettlement[];
  total: number;
  page: number;
  pageSize: number;
}

/** GET/PUT /company-settlements/accounts/:companyId — الآيبان مقنّع دايماً. */
export interface CompanyPayoutAccount {
  id: string;
  companyId: string;
  bankName: string;
  accountName: string;
  iban: string;
  updatedAt: string;
}

// ────────────────────────────────────────────────────────────
// توزيع تسوية الشركة على المناديب — «الشركة بتدفع لكل مندوب».
//
// المصدر: apps/api/src/company-settlements/company-settlements.service.ts
// النص التاني من موديل فلوس الشركة: بعد ما المنصة تدفع للشركة، الشركة بتدفع
// لكل كابتن نصيبه من التسوية وتسجّله. مجموع grossAmount لكل الكباتن = grossPayout
// بالظبط. كل المبالغ أرقام (السيرفر بيعمل Number() على كل Decimal).
// ────────────────────────────────────────────────────────────

export type CaptainDistributionStatus = 'PENDING' | 'PAID';

/** صف توزيع على مندوب — نصيب كابتن من تسوية الشركة. جزء من GET .../breakdown. */
export interface CaptainDistribution {
  distributionId: string;
  captainId: string;
  captainName: string;
  captainPhone: string;
  tripCount: number;
  /** إجمالي أجر الكابتن في التسوية دي — قبل عمولة المنصة. */
  grossAmount: number;
  status: CaptainDistributionStatus;
  /** مرجع دفع الشركة للمندوب — بيتحط بعد ما يتسجّل الدفع. */
  reference: string | null;
  paidAt: string | null;
}

/** GET /company-settlements/:id/breakdown — توزيع تسوية الشركة على المناديب. */
export interface CompanySettlementBreakdown {
  settlementId: string;
  grossPayout: number;
  commission: number;
  netPayout: number;
  captains: CaptainDistribution[];
}

/** رد PATCH /company-settlements/distributions/:distributionId/pay. */
export interface CaptainDistributionPayResult {
  distributionId: string;
  captainId: string;
  captainName: string;
  amount: number;
  status: 'PAID';
  reference: string | null;
  paidAt: string;
}

/** خريطة حالة التوزيع على المندوب — نغمة الشريحة. */
export const CAPTAIN_DISTRIBUTION_META: Record<CaptainDistributionStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'بانتظار الدفع', tone: 'warn' },
  PAID: { label: 'مدفوع', tone: 'ok' },
};
