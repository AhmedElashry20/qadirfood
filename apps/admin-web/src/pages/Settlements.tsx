// المالية والتسويات — تسويات حقيقية من موديول /settlements + تقرير المنصة + الاستردادات
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PageBody, TopBar } from '../components/Shell';
import {
  Button,
  Card,
  Chip,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  KpiCard,
  Loading,
  MissingDataNote,
  Modal,
  Money,
  Pagination,
  Pill,
  Skeleton,
  TD,
  TH,
  THead,
  TR,
  Table,
  TextInput,
  type Tone,
} from '../components/ui';
import { get, patch, post, put } from '../lib/api';
import {
  CAPTAIN_DISTRIBUTION_META,
  type CaptainDistribution,
  type CaptainDistributionPayResult,
  type CompanyPayoutAccount,
  type CompanySettlement,
  type CompanySettlementBreakdown,
  type CompanySettlementDetail,
  type CompanySettlementsPage,
} from '../lib/companies';
import { DASH, dateOnly, dateTime, money, num, sar } from '../lib/format';
import {
  PAYMENT_METHOD_AR,
  REFUND_LIABILITY_META,
  providerNote,
  refundStatusMeta,
  type RefundListItem,
  type RefundStatus,
  type RefundsPage,
} from '../lib/payments';

// ────────────────────────────────────────────────────────────
// أشكال الـ API الحقيقية
// ────────────────────────────────────────────────────────────

/** GET /reports/platform — reports.service.ts#platformReport */
interface PlatformReport {
  range: { from: string; to: string };
  orderCount: number;
  deliveredCount: number;
  gmv: number;
  /// الاستردادات على الطلبات المسلّمة في الفترة.
  refundedTotal: number;
  /// `gmv` ناقص الاستردادات.
  netGmv: number;
  /// اللي المطاعم اتحمّلوه بس (تحمّل NONE/RESTAURANT) — بيتخصم من مستحقاتهم.
  refundedFromRestaurant: number;
  /// إجمالي العمولة على الطلبات المسلّمة — قبل خصم العمولة الراجعة.
  revenue: number;
  /// مجموع `Refund.commissionReversed` — العمولة اللي رجعت للمطاعم مع الاستردادات.
  commissionReversed: number;
  /// `revenue` ناقص `commissionReversed` — ده اللي المنصة كسبته فعلاً.
  netRevenue: number;
  /// مستحقات المطاعم الصح — محسوبة في السيرفر (مبيعاتهم بعد استرداداتهم ناقص صافي العمولة).
  restaurantDues: number;
  captainCost: number;
  netMargin: number;
  activeCaptains: number;
  activeBranches: number;
}

// ────────────────────────────────────────────────────────────
// أشكال التسويات — apps/api/src/settlements/settlements.service.ts
// كل المبالغ أرقام (السيرفر بيعمل Number() على كل Decimal). netPayout ممكن
// يكون سالب — استرداد متأخر على طلب اتسوّى خلاص بيعمل «تسوية عكسية».
// ────────────────────────────────────────────────────────────

type SettlementStatus = 'PENDING' | 'PROCESSING' | 'TRANSFERRED';

interface Settlement {
  id: string;
  restaurantId: string;
  restaurantName: string;
  periodStart: string;
  periodEnd: string;
  grossSales: number;
  commission: number;
  refundsBorne: number;
  commissionReversed: number;
  /** صافي المستحق للمطعم — سالب لو تسوية عكسية (استرجاع فلوس منه). */
  netPayout: number;
  status: SettlementStatus;
  /** آيبان مقنّع «SA44 •••• 2345» — أو null لو المطعم مالوش حساب دفع. */
  payoutRef: string | null;
  /** مرجع الحوالة البنكية — بيتحط بعد التحويل. */
  transferRef: string | null;
  transferredAt: string | null;
  createdAt: string;
}

/** بند في سجل التسوية — مجموع مبالغ البنود = netPayout بالظبط. */
interface SettlementLine {
  id: string;
  type: 'ORDER' | 'REFUND';
  /** موجب للبيع (بيع − عمولة)، سالب للاسترداد (−(المبلغ − العمولة الراجعة)). */
  amount: number;
  descriptionAr: string;
}

type SettlementDetail = Settlement & { lines: SettlementLine[] };

interface SettlementsPage {
  data: Settlement[];
  total: number;
  page: number;
  pageSize: number;
}

/** GET/PUT /settlements/accounts/:restaurantId — الآيبان مقنّع دايماً. */
interface PayoutAccount {
  id: string;
  restaurantId: string;
  bankName: string;
  accountName: string;
  iban: string;
  updatedAt: string;
}

// ────────────────────────────────────────────────────────────
// خرائط العرض
// ────────────────────────────────────────────────────────────

const SETTLEMENT_STATUS_META: Record<SettlementStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'معلّقة', tone: 'warn' },
  PROCESSING: { label: 'قيد التحويل', tone: 'brand' },
  TRANSFERRED: { label: 'محوّلة', tone: 'ok' },
};

const SETTLEMENT_TABS: Array<{ value: '' | SettlementStatus; label: string; tone: Tone }> = [
  { value: '', label: 'الكل', tone: 'neutral' },
  { value: 'PENDING', label: 'معلّقة', tone: 'warn' },
  { value: 'PROCESSING', label: 'قيد التحويل', tone: 'brand' },
  { value: 'TRANSFERRED', label: 'محوّلة', tone: 'ok' },
];

const SETTLEMENTS_PAGE_SIZE = 25;

// ────────────────────────────────────────────────────────────
// مدى تقرير المنصة (المؤشرات فوق) — نفس حساب rangeToDates في السيرفر
// ────────────────────────────────────────────────────────────

type Range = 'today' | 'week' | 'month';

const RANGES: Array<{ value: Range; label: string }> = [
  { value: 'today', label: 'اليوم' },
  { value: 'week', label: 'الأسبوع' },
  { value: 'month', label: 'الشهر' },
];

// ────────────────────────────────────────────────────────────
// تصدير CSV — من صفحة التسويات المحمّلة فعلاً (مافيش endpoint تصدير)
// ────────────────────────────────────────────────────────────

const CSV_HEADERS = [
  'المطعم',
  'بداية الفترة',
  'نهاية الفترة',
  'مبيعات',
  'عمولة',
  'استرجاعات على المطعم',
  'عمولة راجعة',
  'صافي التسوية',
  'الحالة',
  'مرجع الحوالة',
];

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function buildCsv(rows: Settlement[]): string {
  const lines = [CSV_HEADERS.map(csvCell).join(',')];

  for (const row of rows) {
    lines.push(
      [
        row.restaurantName,
        dateOnly(row.periodStart),
        dateOnly(row.periodEnd),
        money(row.grossSales),
        money(-row.commission),
        row.refundsBorne ? money(-row.refundsBorne) : DASH,
        row.commissionReversed ? money(row.commissionReversed) : DASH,
        money(row.netPayout),
        SETTLEMENT_STATUS_META[row.status]?.label ?? row.status,
        row.transferRef ?? DASH,
      ]
        .map(csvCell)
        .join(','),
    );
  }

  return lines.join('\r\n');
}

function downloadCsv(rows: Settlement[]): void {
  // ﻿ = BOM — من غيره إكسل بيفتح العربي بترميز غلط
  const blob = new Blob([`﻿${buildCsv(rows)}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `qadir-settlements-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

// ────────────────────────────────────────────────────────────
// الصفحة
//
// موديول التسويات (POST /settlements/run + القايمة + التحويل + الحسابات
// البنكية) بقى شغّال في الـ API. الناقص الوحيد دلوقتي هو فوترة ZATCA
// الإلكترونية — مافيش جدول فواتير ولا endpoint إصدار.
// ────────────────────────────────────────────────────────────

export default function Settlements() {
  const queryClient = useQueryClient();

  const [range, setRange] = useState<Range>('week');
  const [status, setStatus] = useState<'' | SettlementStatus>('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Settlement | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const report = useQuery({
    queryKey: ['reports', 'platform', range],
    queryFn: () => get<PlatformReport>('/reports/platform', { range }),
  });

  const params = useMemo(
    () => ({ page, pageSize: SETTLEMENTS_PAGE_SIZE, ...(status ? { status } : {}) }),
    [page, status],
  );

  const settlements = useQuery({
    queryKey: ['settlements', 'list', params],
    queryFn: () => get<SettlementsPage>('/settlements', params),
  });

  const rows = settlements.data?.data ?? [];

  // السيرفر بيحسبها صح: مبيعات المطاعم ناقص استرداداتهم هم (تحمّل NONE/RESTAURANT)
  // بس، ناقص صافي العمولة. استرداد المنصة أو الكابتن مابيخصمش من مستحقات المطعم.
  const restaurantDues = report.data?.restaurantDues;

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3_000);
  };

  // دورة تسوية جديدة عبر كل المطاعم — بتلمّ الطلبات المسلّمة غير المسوّاة
  // والاستردادات اللي على المطاعم وتنشئ تسوية لكل مطعم فيه حركة. عمليّة idempotent:
  // تشغيلها من غير حركة جديدة بترجّع generated:0.
  const run = useMutation({
    mutationFn: () => post<{ generated: number; periodEnd: string }>('/settlements/run', {}),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['settlements'] });
      // التسوية بتقفل طلبات واستردادات، فمجاميع تقرير المنصة ممكن تتغيّر
      void queryClient.invalidateQueries({ queryKey: ['reports'] });
      showToast(
        result.generated === 0
          ? 'مفيش حاجة جديدة تتسوّى'
          : `اتعملت ${num(result.generated)} تسوية جديدة`,
      );
    },
  });

  return (
    <>
      <TopBar
        title="المالية والتسويات"
        tabs={RANGES.map((option) => (
          <Chip
            key={option.value}
            tone={option.value === range ? 'brand' : 'neutral'}
            active={option.value === range}
            onClick={() => setRange(option.value)}
          >
            {option.label}
          </Chip>
        ))}
        actions={
          <>
            <Button
              variant="dark"
              size="sm"
              icon="⬇"
              disabled={rows.length === 0}
              title={rows.length ? 'تصدير صفحة التسويات المعروضة' : 'مافيش صفوف للتصدير'}
              onClick={() => downloadCsv(rows)}
            >
              تصدير كشوف
            </Button>
            <Button
              variant="brand"
              size="sm"
              icon="⚙"
              loading={run.isPending}
              title="بيلمّ الطلبات المسلّمة غير المسوّاة والاستردادات على المطاعم وينشئ تسوية لكل مطعم"
              onClick={() => run.mutate()}
            >
              بدء دورة تسوية
            </Button>
          </>
        }
      />

      <PageBody>
        <MissingDataNote>
          موديول التسويات بقى شغّال: دورة تسوية عبر كل المطاعم، سجل بنود لكل تسوية، حالة التحويل البنكي، والحسابات
          البنكية للمطاعم. الناقص الوحيد هو فوترة <span className="num">ZATCA</span> الإلكترونية — مافيش جدول فواتير
          ولا endpoint إصدار لسه.
        </MissingDataNote>

        {/* ── المؤشرات ── */}
        {report.isPending ? (
          <div className="grid grid-cols-3 gap-[14px]">
            {Array.from({ length: 3 }, (_, index) => (
              <Card key={index} className="h-[112px]">
                <Skeleton height={12} className="w-1/2" />
                <Skeleton height={26} className="mt-3 w-2/3" />
              </Card>
            ))}
          </div>
        ) : report.isError ? (
          <Card>
            <ErrorState message={report.error.message} onRetry={() => void report.refetch()} />
          </Card>
        ) : (
          <div className="grid grid-cols-3 gap-[14px]">
            <KpiCard
              inverted
              label="مستحقات المطاعم"
              value={<Money value={restaurantDues} size="xl" />}
              note={
                report.data?.refundedFromRestaurant
                  ? `مبيعاتهم ناقص عمولة المنصة · مخصوم منها ${sar(report.data.refundedFromRestaurant)} استرداد على المطاعم بس`
                  : `مبيعاتهم ناقص عمولة المنصة · مافيش استرداد على المطاعم في الفترة`
              }
            />

            {/* القيمة الكبيرة هي الصافي — ده اللي المنصة كسبته فعلاً بعد العمولة
                اللي رجعت مع الاستردادات. الإجمالي بيفضل باين في الملاحظة عشان
                المحاسب يقدر يوصل من رقم لرقم من غير ما يفتح التقرير. */}
            <KpiCard
              label="عمولات المنصة (صافي)"
              value={<Money value={report.data?.netRevenue} size="xl" />}
              note={
                report.data?.commissionReversed
                  ? `إجمالي ${sar(report.data.revenue)} ناقص ${sar(
                      report.data.commissionReversed,
                    )} عمولة رجعت مع الاستردادات · ${num(report.data.deliveredCount)} طلب مسلّم`
                  : `إجمالي ${sar(report.data?.revenue)} · مافيش عمولة رجعت في الفترة · ${num(
                      report.data?.deliveredCount,
                    )} طلب مسلّم`
              }
            />

            <KpiCard
              label="فواتير ZATCA"
              value={DASH}
              note="ربط ZATCA مش موجود في الـ API — مافيش جدول فواتير ولا endpoint إصدار."
            />
          </div>
        )}

        {/* ── التسويات ── */}
        {/* الصفحة فيها جدولين — التمرير في PageBody مش جوّه كل بطاقة */}
        <Card padding="none" className="flex shrink-0 flex-col">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-hair p-[14px]">
            <h2 className="me-auto text-[14.5px] font-black text-ink">
              التسويات
              {settlements.data ? (
                <span className="ms-1.5 font-num text-[11.5px] font-bold text-muted">{num(settlements.data.total)}</span>
              ) : null}
            </h2>

            {SETTLEMENT_TABS.map((tab) => (
              <Chip
                key={tab.value || 'all'}
                tone={tab.tone}
                active={status === tab.value}
                onClick={() => {
                  setStatus(tab.value);
                  setPage(1);
                }}
              >
                {tab.label}
              </Chip>
            ))}
          </div>

          <div className="flex flex-col p-[14px]">
            <Table gridTemplateColumns="1.5fr 1.1fr 0.9fr 0.9fr 0.9fr 1.1fr 0.9fr">
              <THead>
                <TH>المطعم</TH>
                <TH>الفترة</TH>
                <TH align="end">مبيعات</TH>
                <TH align="end">العمولة</TH>
                <TH align="end">استرجاعات</TH>
                <TH align="end">صافي التسوية</TH>
                <TH>الحالة</TH>
              </THead>

              {settlements.isPending ? (
                <Loading rows={6} height={44} className="mt-2" />
              ) : settlements.isError ? (
                <ErrorState message={settlements.error.message} onRetry={() => void settlements.refetch()} />
              ) : rows.length === 0 ? (
                <EmptyState
                  icon="💰"
                  title="مافيش تسويات في الفلتر ده"
                  description="ابدأ دورة تسوية من الزر فوق، أو غيّر الحالة من الشرائح."
                />
              ) : (
                rows.map((row) => {
                  const meta = SETTLEMENT_STATUS_META[row.status];
                  const reversal = row.netPayout < 0;

                  return (
                    <TR
                      key={row.id}
                      selected={selected?.id === row.id}
                      danger={reversal}
                      onClick={() => setSelected(row)}
                    >
                      <TD>
                        <span className="font-extrabold">{row.restaurantName}</span>
                        {reversal ? (
                          <span className="mt-0.5 block text-[10.5px] font-extrabold leading-tight text-bad-deep">
                            تسوية عكسية
                          </span>
                        ) : null}
                      </TD>

                      <TD>
                        <bdi className="block font-num text-[11.5px] font-bold text-ink" dir="ltr">
                          {dateOnly(row.periodEnd)}
                        </bdi>
                        <bdi className="block font-num text-[10.5px] font-bold text-muted" dir="ltr">
                          من {dateOnly(row.periodStart)}
                        </bdi>
                      </TD>

                      <TD align="end">
                        <Money value={row.grossSales} size="sm" hideCurrency />
                      </TD>

                      <TD align="end" className="text-bad">
                        <Money value={-row.commission} size="sm" hideCurrency />
                      </TD>

                      <TD align="end" muted={!row.refundsBorne} className={row.refundsBorne ? 'text-bad' : undefined}>
                        {row.refundsBorne ? <Money value={-row.refundsBorne} size="sm" hideCurrency /> : DASH}
                      </TD>

                      <TD align="end">
                        <Money
                          value={row.netPayout}
                          size="sm"
                          hideCurrency
                          className={reversal ? 'text-bad-deep' : undefined}
                        />
                      </TD>

                      <TD>
                        <Pill tone={meta.tone}>{meta.label}</Pill>
                      </TD>
                    </TR>
                  );
                })
              )}
            </Table>

            {settlements.data ? (
              <Pagination
                page={page}
                pageSize={settlements.data.pageSize}
                total={settlements.data.total}
                onChange={setPage}
              />
            ) : null}

            {run.isError ? (
              <p className="mt-2 rounded-[10px] border border-bad-line bg-bad-row px-3 py-2 text-[12px] font-bold text-bad-deep">
                {run.error.message}
              </p>
            ) : null}

            <MissingDataNote className="pt-2">
              التسوية بتقفل الطلبات المسلّمة اللي لسه ماتسوّتش. استرداد متأخر على طلب اتسوّى خلاص بيعمل «تسوية عكسية»
              بصافي سالب — استرجاع فلوس من المطعم. مرجع الحوالة بيتسجّل يدوي وقت التحويل.
            </MissingDataNote>
          </div>
        </Card>

        {/* ── تسويات الشركات ── */}
        {/* ستريم تاني «فلوس طالعة لشريك» زي تسويات المطاعم — بيتحط جنبها قبل الاستردادات */}
        <CompanySettlementsCard />

        {/* ── الاستردادات ── */}
        <RefundsCard />
      </PageBody>

      <SettlementDetailDrawer settlement={selected} onClose={() => setSelected(null)} showToast={showToast} />

      {toast ? (
        <div className="fixed bottom-6 start-6 z-[60] rounded-[12px] bg-ink px-4 py-3 text-[12.5px] font-extrabold text-white shadow-float">
          ✓ {toast}
        </div>
      ) : null}
    </>
  );
}

// ────────────────────────────────────────────────────────────
// لوح تفاصيل التسوية — GET /settlements/:id
// بيعرض المجاميع + سجل البنود (اللي مجموعه = netPayout) + محرّر الحساب البنكي
// + إجراء التحويل.
// ────────────────────────────────────────────────────────────

interface SettlementDetailDrawerProps {
  settlement: Settlement | null;
  onClose: () => void;
  showToast: (message: string) => void;
}

function SettlementDetailDrawer({ settlement, onClose, showToast }: SettlementDetailDrawerProps) {
  const [transferOpen, setTransferOpen] = useState(false);

  // كل ما التسوية المختارة تتغيّر نقفل نافذة التحويل — عشان ماتفضلش مفتوحة على تسوية تانية
  useEffect(() => {
    setTransferOpen(false);
  }, [settlement?.id]);

  const detail = useQuery({
    queryKey: ['settlements', 'detail', settlement?.id],
    queryFn: () => get<SettlementDetail>(`/settlements/${settlement?.id}`),
    enabled: Boolean(settlement),
  });

  if (!settlement) return null;

  // الـ detail فيه نفس حقول الملخّص + البنود — نعتمد عليه ونرجع لصف القايمة لحد ما يوصل
  const data: Settlement = detail.data ?? settlement;
  const meta = SETTLEMENT_STATUS_META[data.status];
  const reversal = data.netPayout < 0;
  const transferred = data.status === 'TRANSFERRED';

  const linesSum = detail.data
    ? Number(detail.data.lines.reduce((sum, line) => sum + line.amount, 0).toFixed(2))
    : null;

  return (
    <Drawer
      open
      onClose={onClose}
      width={460}
      title={
        <span className="flex items-center gap-2">
          <span className="truncate">{data.restaurantName}</span>
          <Pill tone={meta.tone}>{meta.label}</Pill>
        </span>
      }
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            إغلاق
          </Button>
          <Button
            variant="brand"
            size="sm"
            disabled={transferred}
            title={transferred ? 'التسوية متحوّلة خلاص' : undefined}
            onClick={() => setTransferOpen(true)}
          >
            {transferred ? 'تم التحويل ✓' : 'تسجيل تحويل'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {/* ── الملخّص ── */}
        <dl className="flex flex-col gap-2 rounded-[13px] bg-soft p-3">
          <Fact label="الفترة">
            <bdi className="font-num text-[11.5px]" dir="ltr">
              {dateOnly(data.periodStart)} — {dateOnly(data.periodEnd)}
            </bdi>
          </Fact>

          <Fact label="مبيعات الطلبات">
            <Money value={data.grossSales} size="sm" />
          </Fact>

          <Fact label="عمولة المنصة">
            <Money value={-data.commission} size="sm" className="text-bad" />
          </Fact>

          {data.refundsBorne ? (
            <Fact label="استرجاعات على المطعم">
              <Money value={-data.refundsBorne} size="sm" className="text-bad" />
            </Fact>
          ) : null}

          {data.commissionReversed ? (
            <Fact label="عمولة راجعة للمطعم">
              <Money value={data.commissionReversed} size="sm" className="text-ok" />
            </Fact>
          ) : null}

          <div className="my-0.5 border-t border-hair" />

          <Fact label="صافي التسوية">
            <span className="flex items-center gap-1.5">
              {reversal ? <Pill tone="bad">تسوية عكسية</Pill> : null}
              <Money value={data.netPayout} size="md" className={reversal ? 'text-bad-deep' : undefined} />
            </span>
          </Fact>
        </dl>

        {reversal ? (
          <MissingDataNote>
            الصافي سالب — دي تسوية عكسية على استرداد اتعمل بعد ما الطلب اتسوّى. المبلغ ده بيتحصّل من المطعم مش بيتدفعله.
          </MissingDataNote>
        ) : null}

        {/* ── سجل البنود ── */}
        <div>
          <p className="mb-1.5 text-[12.5px] font-black text-ink">
            سجل البنود
            {detail.data ? (
              <span className="ms-1.5 font-num text-[11px] text-muted">({num(detail.data.lines.length)})</span>
            ) : null}
          </p>

          {detail.isPending ? (
            <Loading rows={3} height={34} />
          ) : detail.isError ? (
            <p className="rounded-[10px] border border-bad-line bg-bad-row px-3 py-2 text-[11.5px] font-bold text-bad-deep">
              تعذّر تحميل البنود: {detail.error.message}
            </p>
          ) : detail.data && detail.data.lines.length ? (
            <>
              <ul className="flex flex-col gap-1.5">
                {detail.data.lines.map((line) => {
                  const negative = line.amount < 0;
                  return (
                    <li
                      key={line.id}
                      className="flex items-center justify-between gap-2 rounded-[10px] border border-hair px-2.5 py-2"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Pill tone={line.type === 'REFUND' ? 'bad' : 'neutral'}>
                          {line.type === 'REFUND' ? 'استرداد' : 'بيع'}
                        </Pill>
                        <span className="min-w-0 truncate text-[11.5px] font-bold text-ink" title={line.descriptionAr}>
                          {line.descriptionAr}
                        </span>
                      </span>
                      <Money
                        value={line.amount}
                        size="sm"
                        hideCurrency
                        className={negative ? 'shrink-0 text-bad-deep' : 'shrink-0'}
                      />
                    </li>
                  );
                })}
              </ul>

              {/* مجموع البنود لازم يطابق الصافي — بنبيّنه صراحةً عشان الأدمن يشوف الرقم جاي منين */}
              <div className="mt-1.5 flex items-center justify-between gap-2 rounded-[10px] bg-soft px-2.5 py-2">
                <span className="text-[11.5px] font-extrabold text-label">مجموع البنود = صافي التسوية</span>
                <Money
                  value={linesSum}
                  size="sm"
                  hideCurrency
                  className={linesSum !== null && linesSum < 0 ? 'text-bad-deep' : undefined}
                />
              </div>
            </>
          ) : (
            <p className="text-[11.5px] font-bold text-faint">مافيش بنود.</p>
          )}
        </div>

        {/* ── التحويل ── */}
        {transferred ? (
          <dl className="flex flex-col gap-2 rounded-[13px] bg-soft p-3">
            <Fact label="مرجع الحوالة">
              <bdi className="font-num text-[11.5px] font-extrabold" dir="ltr">
                {data.transferRef ?? DASH}
              </bdi>
            </Fact>
            <Fact label="وقت التحويل">
              <bdi className="font-num text-[11.5px]" dir="ltr">
                {data.transferredAt ? dateTime(data.transferredAt) : DASH}
              </bdi>
            </Fact>
          </dl>
        ) : null}

        {/* ── الحساب البنكي للمطعم ── */}
        <PayoutAccountSection restaurantId={data.restaurantId} showToast={showToast} />
      </div>

      <TransferModal
        settlement={transferOpen ? data : null}
        onClose={() => setTransferOpen(false)}
        showToast={showToast}
      />
    </Drawer>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
      <dt className="shrink-0 font-extrabold text-label">{label}</dt>
      <dd className="min-w-0 truncate text-end font-bold text-ink">{children}</dd>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// نافذة تسجيل التحويل — PATCH /settlements/:id/transfer
// المرجع إلزامي. لو المطعم مالوش حساب دفع (payoutRef فاضي) بنحذّر لكن التحويل
// لسه مسموح — المحاسب ممكن يكون حوّل بطريقة تانية.
// ────────────────────────────────────────────────────────────

interface TransferModalProps {
  settlement: Settlement | null;
  onClose: () => void;
  showToast: (message: string) => void;
}

function TransferModal({ settlement, onClose, showToast }: TransferModalProps) {
  const queryClient = useQueryClient();
  const [transferRef, setTransferRef] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setTransferRef('');
    setLocalError(null);
  }, [settlement?.id]);

  const transfer = useMutation({
    mutationFn: (ref: string) =>
      patch<Settlement>(`/settlements/${settlement?.id}/transfer`, { transferRef: ref }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settlements'] });
      showToast('اتسجّل تحويل التسوية');
      onClose();
    },
    onError: (error: Error) => setLocalError(error.message),
  });

  if (!settlement) return null;

  const submit = () => {
    const trimmed = transferRef.trim();
    if (!trimmed) {
      setLocalError('مرجع الحوالة مطلوب');
      return;
    }
    setLocalError(null);
    transfer.mutate(trimmed);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`تسجيل تحويل — ${settlement.restaurantName}`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            رجوع
          </Button>
          <Button variant="brand" size="sm" loading={transfer.isPending} onClick={submit}>
            تأكيد التحويل
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <dl className="flex flex-col gap-2 rounded-[13px] bg-soft p-3 text-[12.5px]">
          <Fact label="صافي التسوية">
            <Money value={settlement.netPayout} size="md" className={settlement.netPayout < 0 ? 'text-bad-deep' : undefined} />
          </Fact>
          <Fact label="حساب الدفع">
            {settlement.payoutRef ? (
              <bdi className="font-num text-[11.5px]" dir="ltr">
                {settlement.payoutRef}
              </bdi>
            ) : (
              <span className="text-bad-deep">مافيش حساب مسجّل</span>
            )}
          </Fact>
        </dl>

        {!settlement.payoutRef ? (
          <p className="rounded-[10px] border border-bad-line bg-bad-row px-3 py-2 text-[11.5px] font-bold leading-relaxed text-bad-deep">
            ⚠️ المطعم ده مالوش حساب دفع مسجّل — أضف الحساب من لوح التفاصيل قبل ما تحوّل، أو أكّد إنك حوّلت بطريقة تانية.
          </p>
        ) : null}

        {settlement.netPayout < 0 ? (
          <MissingDataNote>
            صافي التسوية سالب (تسوية عكسية) — ده مبلغ مفروض يتحصّل من المطعم مش يتدفعله. اتأكد قبل ما تسجّل التحويل.
          </MissingDataNote>
        ) : null}

        <Field
          label="مرجع الحوالة البنكية"
          required
          hint="الرقم اللي رجع من البنك — بيتخزّن في سجل التسوية كإثبات للتحويل."
          error={localError}
        >
          <TextInput
            latin
            value={transferRef}
            onChange={(event) => setTransferRef(event.target.value)}
            placeholder="مثلاً: TRF-2026-00123"
            maxLength={120}
            autoFocus
          />
        </Field>
      </div>
    </Modal>
  );
}

// ────────────────────────────────────────────────────────────
// الحساب البنكي للمطعم — GET/PUT /settlements/accounts/:restaurantId
// الـ GET بيرجّع body فاضي (مش JSON null) لو مافيش حساب — فبنعامل أي رد مش
// object على إنه «مافيش حساب».
// ────────────────────────────────────────────────────────────

function PayoutAccountSection({
  restaurantId,
  showToast,
}: {
  restaurantId: string;
  showToast: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const account = useQuery({
    queryKey: ['settlements', 'account', restaurantId],
    // السيرفر بيرجّع { account: X | null } — كائن صريح مش جسم فاضي.
    queryFn: async () => {
      const res = await get<{ account: PayoutAccount | null }>(`/settlements/accounts/${restaurantId}`);
      return res.account;
    },
  });

  return (
    <div className="rounded-[13px] border border-line p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-black text-ink">الحساب البنكي للمطعم</p>
        {!editing ? (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            {account.data ? 'تعديل' : 'إضافة حساب'}
          </Button>
        ) : null}
      </div>

      {account.isPending ? (
        <Loading rows={2} height={28} />
      ) : account.isError ? (
        <p className="rounded-[10px] border border-bad-line bg-bad-row px-3 py-2 text-[11.5px] font-bold text-bad-deep">
          تعذّر تحميل الحساب: {account.error.message}
        </p>
      ) : editing ? (
        <PayoutAccountForm
          restaurantId={restaurantId}
          current={account.data ?? null}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void queryClient.invalidateQueries({ queryKey: ['settlements', 'account', restaurantId] });
            showToast('اتحفظ الحساب البنكي');
          }}
        />
      ) : account.data ? (
        <dl className="flex flex-col gap-2">
          <Fact label="البنك">{account.data.bankName}</Fact>
          <Fact label="اسم الحساب">{account.data.accountName}</Fact>
          <Fact label="الآيبان">
            <bdi className="font-num text-[11.5px] font-extrabold" dir="ltr">
              {account.data.iban}
            </bdi>
          </Fact>
        </dl>
      ) : (
        <p className="text-[11.5px] font-bold text-faint">
          مافيش حساب دفع مسجّل — التسويات الجديدة هتفضل من غير مرجع حساب لحد ما تضيفه.
        </p>
      )}
    </div>
  );
}

interface PayoutAccountFormProps {
  restaurantId: string;
  current: PayoutAccount | null;
  onCancel: () => void;
  onSaved: () => void;
}

function PayoutAccountForm({ restaurantId, current, onCancel, onSaved }: PayoutAccountFormProps) {
  const [bankName, setBankName] = useState(current?.bankName ?? '');
  const [accountName, setAccountName] = useState(current?.accountName ?? '');
  // الآيبان المخزّن مقنّع — ماينفعش يتبعت زي ما هو، فبنبدأ فاضي ونطلب واحد كامل
  const [iban, setIban] = useState('');
  const [localError, setLocalError] = useState<{ field: 'bankName' | 'accountName' | 'iban'; message: string } | null>(
    null,
  );

  const save = useMutation({
    mutationFn: (body: { bankName: string; accountName: string; iban: string }) =>
      put<PayoutAccount>(`/settlements/accounts/${restaurantId}`, body),
    onSuccess: onSaved,
  });

  const submit = () => {
    const b = bankName.trim();
    const a = accountName.trim();
    const i = iban.trim().replace(/\s+/g, '').toUpperCase();

    if (!b) return setLocalError({ field: 'bankName', message: 'اسم البنك مطلوب' });
    if (!a) return setLocalError({ field: 'accountName', message: 'اسم الحساب مطلوب' });
    if (!i) return setLocalError({ field: 'iban', message: 'الآيبان مطلوب' });

    setLocalError(null);
    save.mutate({ bankName: b, accountName: a, iban: i });
  };

  return (
    <div className="flex flex-col gap-2.5">
      <Field label="اسم البنك" required error={localError?.field === 'bankName' ? localError.message : null}>
        <TextInput
          value={bankName}
          onChange={(event) => setBankName(event.target.value)}
          placeholder="مثلاً: مصرف الراجحي"
          maxLength={120}
          autoFocus
        />
      </Field>

      <Field label="اسم صاحب الحساب" required error={localError?.field === 'accountName' ? localError.message : null}>
        <TextInput
          value={accountName}
          onChange={(event) => setAccountName(event.target.value)}
          placeholder="الاسم زي ما هو في البنك"
          maxLength={160}
        />
      </Field>

      <Field
        label="الآيبان"
        required
        hint={
          current
            ? `الحالي ${current.iban} — اكتب الآيبان كامل عشان يتغيّر. لازم يكون سعودي (SA + ٢٢ رقم).`
            : 'لازم يكون سعودي صحيح — SA وبعده ٢٢ رقم.'
        }
        error={localError?.field === 'iban' ? localError.message : save.isError ? save.error.message : null}
      >
        <TextInput
          latin
          value={iban}
          onChange={(event) => setIban(event.target.value)}
          placeholder="SA0000000000000000000000"
          maxLength={40}
        />
      </Field>

      <div className="flex items-center justify-end gap-2 pt-0.5">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          إلغاء
        </Button>
        <Button variant="brand" size="sm" loading={save.isPending} onClick={submit}>
          حفظ الحساب
        </Button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// تسويات الشركات — POST /company-settlements/run + القايمة + التفاصيل + التحويل
//
// «المنصة بتدفع للشركة»: أجور كباتن الشركة على الرحلات المسلّمة بتتجمّع في
// تسوية واحدة، والمنصة بتحوّل الصافي (إجمالي الأجور ناقص عمولة المنصة).
// نفس بنية تسويات المطاعم فوق — بنفس خريطة الحالة (SETTLEMENT_STATUS_META)
// والتبويبات (SETTLEMENT_TABS)، الحالات متطابقة.
// ────────────────────────────────────────────────────────────

const COMPANY_SETTLEMENTS_PAGE_SIZE = 20;

function CompanySettlementsCard() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'' | SettlementStatus>('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<CompanySettlement | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const params = useMemo(
    () => ({ page, pageSize: COMPANY_SETTLEMENTS_PAGE_SIZE, ...(status ? { status } : {}) }),
    [page, status],
  );

  const settlements = useQuery({
    queryKey: ['company-settlements', 'list', params],
    queryFn: () => get<CompanySettlementsPage>('/company-settlements', params),
  });

  const rows = settlements.data?.data ?? [];

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3_000);
  };

  // دورة تسوية شركات — بتجمّع رحلات كباتن الشركات المسلّمة غير المسوّاة في تسوية
  // لكل شركة فيها حركة. idempotent: من غير حركة جديدة بترجّع generated:0.
  const run = useMutation({
    mutationFn: () => post<{ generated: number; periodEnd: string }>('/company-settlements/run', {}),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['company-settlements'] });
      showToast(
        result.generated === 0
          ? 'مفيش حاجة جديدة تتسوّى'
          : `اتعملت ${num(result.generated)} تسوية شركة جديدة`,
      );
    },
  });

  return (
    <Card padding="none" className="flex shrink-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-hair p-[14px]">
        <h2 className="me-auto text-[14.5px] font-black text-ink">
          تسويات الشركات
          {settlements.data ? (
            <span className="ms-1.5 font-num text-[11.5px] font-bold text-muted">{num(settlements.data.total)}</span>
          ) : null}
        </h2>

        {SETTLEMENT_TABS.map((tab) => (
          <Chip
            key={tab.value || 'all'}
            tone={tab.tone}
            active={status === tab.value}
            onClick={() => {
              setStatus(tab.value);
              setPage(1);
            }}
          >
            {tab.label}
          </Chip>
        ))}

        <Button
          variant="brand"
          size="sm"
          icon="⚙"
          loading={run.isPending}
          title="بيلمّ رحلات كباتن الشركات المسلّمة غير المسوّاة وينشئ تسوية لكل شركة فيها حركة"
          onClick={() => run.mutate()}
        >
          بدء دورة تسوية شركات
        </Button>
      </div>

      <div className="flex flex-col p-[14px]">
        <Table gridTemplateColumns="1.5fr 1.1fr 0.7fr 0.95fr 0.9fr 1.1fr 0.9fr">
          <THead>
            <TH>الشركة</TH>
            <TH>الفترة</TH>
            <TH align="end">رحلات</TH>
            <TH align="end">إجمالي الأجور</TH>
            <TH align="end">العمولة</TH>
            <TH align="end">صافي التسوية</TH>
            <TH>الحالة</TH>
          </THead>

          {settlements.isPending ? (
            <Loading rows={6} height={44} className="mt-2" />
          ) : settlements.isError ? (
            <ErrorState message={settlements.error.message} onRetry={() => void settlements.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon="🚚"
              title="مافيش تسويات شركات في الفلتر ده"
              description="ابدأ دورة تسوية شركات من الزر فوق، أو غيّر الحالة من الشرائح."
            />
          ) : (
            rows.map((row) => {
              const meta = SETTLEMENT_STATUS_META[row.status];

              return (
                <TR key={row.id} selected={selected?.id === row.id} onClick={() => setSelected(row)}>
                  <TD>
                    <span className="font-extrabold">{row.companyName}</span>
                  </TD>

                  <TD>
                    <bdi className="block font-num text-[11.5px] font-bold text-ink" dir="ltr">
                      {dateOnly(row.periodEnd)}
                    </bdi>
                    <bdi className="block font-num text-[10.5px] font-bold text-muted" dir="ltr">
                      من {dateOnly(row.periodStart)}
                    </bdi>
                  </TD>

                  <TD align="end" numeric>
                    {num(row.tripCount)}
                  </TD>

                  <TD align="end">
                    <Money value={row.grossPayout} size="sm" hideCurrency />
                  </TD>

                  <TD align="end" className="text-bad">
                    <Money value={-row.commission} size="sm" hideCurrency />
                  </TD>

                  <TD align="end">
                    <Money value={row.netPayout} size="sm" hideCurrency />
                  </TD>

                  <TD>
                    <Pill tone={meta.tone}>{meta.label}</Pill>
                  </TD>
                </TR>
              );
            })
          )}
        </Table>

        {settlements.data ? (
          <Pagination
            page={page}
            pageSize={settlements.data.pageSize}
            total={settlements.data.total}
            onChange={setPage}
          />
        ) : null}

        {run.isError ? (
          <p className="mt-2 rounded-[10px] border border-bad-line bg-bad-row px-3 py-2 text-[12px] font-bold text-bad-deep">
            {run.error.message}
          </p>
        ) : null}

        <MissingDataNote className="pt-2">
          التسوية بتجمّع أجور كباتن الشركة على الرحلات المسلّمة اللي لسه ماتسوّتش، والمنصة بتحوّل الصافي (الأجور ناقص
          عمولة المنصة) للشركة. مرجع الحوالة بيتسجّل يدوي وقت التحويل. الطرف التاني — توزيع الشركة على كل مندوب — بيتسجّل
          من «توزيع على المناديب» جوّه تفاصيل التسوية.
        </MissingDataNote>
      </div>

      <CompanySettlementDetailDrawer settlement={selected} onClose={() => setSelected(null)} showToast={showToast} />

      {toast ? (
        <div className="fixed bottom-6 start-6 z-[60] rounded-[12px] bg-ink px-4 py-3 text-[12.5px] font-extrabold text-white shadow-float">
          ✓ {toast}
        </div>
      ) : null}
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// لوح تفاصيل تسوية الشركة — GET /company-settlements/:id
// بيعرض المجاميع + سجل الأجور (اللي مجموعه = grossPayout، مش الصافي) +
// برهنة «المجموع = الأجور − العمولة = الصافي» + محرّر الحساب البنكي + التحويل.
// ────────────────────────────────────────────────────────────

interface CompanySettlementDetailDrawerProps {
  settlement: CompanySettlement | null;
  onClose: () => void;
  showToast: (message: string) => void;
}

function CompanySettlementDetailDrawer({ settlement, onClose, showToast }: CompanySettlementDetailDrawerProps) {
  const [transferOpen, setTransferOpen] = useState(false);

  useEffect(() => {
    setTransferOpen(false);
  }, [settlement?.id]);

  const detail = useQuery({
    queryKey: ['company-settlements', 'detail', settlement?.id],
    queryFn: () => get<CompanySettlementDetail>(`/company-settlements/${settlement?.id}`),
    enabled: Boolean(settlement),
  });

  if (!settlement) return null;

  const data: CompanySettlement = detail.data ?? settlement;
  const meta = SETTLEMENT_STATUS_META[data.status];
  const transferred = data.status === 'TRANSFERRED';

  // مجموع بنود الأجور بيطابق إجمالي الأجور (grossPayout) — العمولة بتتخصم بعده.
  const linesSum = detail.data
    ? Number(detail.data.lines.reduce((sum, line) => sum + line.amount, 0).toFixed(2))
    : null;

  return (
    <Drawer
      open
      onClose={onClose}
      width={460}
      title={
        <span className="flex items-center gap-2">
          <span className="truncate">{data.companyName}</span>
          <Pill tone={meta.tone}>{meta.label}</Pill>
        </span>
      }
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            إغلاق
          </Button>
          <Button
            variant="brand"
            size="sm"
            disabled={transferred}
            title={transferred ? 'التسوية متحوّلة خلاص' : undefined}
            onClick={() => setTransferOpen(true)}
          >
            {transferred ? 'تم التحويل ✓' : 'تسجيل تحويل'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {/* ── الملخّص ── */}
        <dl className="flex flex-col gap-2 rounded-[13px] bg-soft p-3">
          <Fact label="الفترة">
            <bdi className="font-num text-[11.5px]" dir="ltr">
              {dateOnly(data.periodStart)} — {dateOnly(data.periodEnd)}
            </bdi>
          </Fact>

          <Fact label="عدد الرحلات">
            <bdi className="font-num text-[11.5px]" dir="ltr">
              {num(data.tripCount)}
            </bdi>
          </Fact>

          <Fact label="إجمالي الأجور">
            <Money value={data.grossPayout} size="sm" />
          </Fact>

          <Fact label="عمولة المنصة">
            <Money value={-data.commission} size="sm" className="text-bad" />
          </Fact>

          <div className="my-0.5 border-t border-hair" />

          <Fact label="صافي التسوية">
            <Money value={data.netPayout} size="md" />
          </Fact>
        </dl>

        {/* ── سجل الأجور ── */}
        <div>
          <p className="mb-1.5 text-[12.5px] font-black text-ink">
            سجل الأجور
            {detail.data ? (
              <span className="ms-1.5 font-num text-[11px] text-muted">({num(detail.data.lines.length)})</span>
            ) : null}
          </p>

          {detail.isPending ? (
            <Loading rows={3} height={34} />
          ) : detail.isError ? (
            <p className="rounded-[10px] border border-bad-line bg-bad-row px-3 py-2 text-[11.5px] font-bold text-bad-deep">
              تعذّر تحميل البنود: {detail.error.message}
            </p>
          ) : detail.data && detail.data.lines.length ? (
            <>
              <ul className="flex flex-col gap-1.5">
                {detail.data.lines.map((line) => (
                  <li
                    key={line.id}
                    className="flex items-center justify-between gap-2 rounded-[10px] border border-hair px-2.5 py-2"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Pill tone="neutral">رحلة</Pill>
                      <span className="min-w-0 truncate text-[11.5px] font-bold text-ink" title={line.descriptionAr}>
                        {line.descriptionAr}
                      </span>
                    </span>
                    <Money value={line.amount} size="sm" hideCurrency className="shrink-0" />
                  </li>
                ))}
              </ul>

              {/* البرهنة: مجموع البنود = إجمالي الأجور، وناقص عمولة المنصة = الصافي.
                  بنبيّن الخطوتين صراحةً عشان الأدمن يشوف الصافي جاي منين. */}
              <div className="mt-1.5 flex flex-col gap-1.5 rounded-[10px] bg-soft px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11.5px] font-extrabold text-label">مجموع البنود = إجمالي الأجور</span>
                  <Money value={linesSum} size="sm" hideCurrency />
                </div>
                <div className="flex items-center justify-between gap-2 text-bad">
                  <span className="text-[11.5px] font-extrabold">− عمولة المنصة</span>
                  <Money value={-data.commission} size="sm" hideCurrency />
                </div>
                <div className="border-t border-hair" />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11.5px] font-black text-ink">= صافي التسوية</span>
                  <Money value={data.netPayout} size="sm" hideCurrency />
                </div>
              </div>
            </>
          ) : (
            <p className="text-[11.5px] font-bold text-faint">مافيش بنود.</p>
          )}
        </div>

        {/* ── التحويل ── */}
        {transferred ? (
          <dl className="flex flex-col gap-2 rounded-[13px] bg-soft p-3">
            <Fact label="مرجع الحوالة">
              <bdi className="font-num text-[11.5px] font-extrabold" dir="ltr">
                {data.transferRef ?? DASH}
              </bdi>
            </Fact>
            <Fact label="وقت التحويل">
              <bdi className="font-num text-[11.5px]" dir="ltr">
                {data.transferredAt ? dateTime(data.transferredAt) : DASH}
              </bdi>
            </Fact>
          </dl>
        ) : null}

        {/* ── الحساب البنكي للشركة ── */}
        <CompanyPayoutAccountSection companyId={data.companyId} showToast={showToast} />

        {/* ── توزيع الشركة على المناديب (النص التاني من الموديل) ── */}
        <CompanyCaptainDistributionSection settlementId={data.id} showToast={showToast} />
      </div>

      <CompanyTransferModal
        settlement={transferOpen ? data : null}
        onClose={() => setTransferOpen(false)}
        showToast={showToast}
      />
    </Drawer>
  );
}

// ────────────────────────────────────────────────────────────
// نافذة تسجيل التحويل — PATCH /company-settlements/:id/transfer
// المرجع إلزامي. لو الشركة مالهاش حساب دفع (payoutRef فاضي) بنحذّر لكن التحويل
// لسه مسموح — المحاسب ممكن يكون حوّل بطريقة تانية.
// ────────────────────────────────────────────────────────────

interface CompanyTransferModalProps {
  settlement: CompanySettlement | null;
  onClose: () => void;
  showToast: (message: string) => void;
}

function CompanyTransferModal({ settlement, onClose, showToast }: CompanyTransferModalProps) {
  const queryClient = useQueryClient();
  const [transferRef, setTransferRef] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setTransferRef('');
    setLocalError(null);
  }, [settlement?.id]);

  const transfer = useMutation({
    mutationFn: (ref: string) =>
      patch<CompanySettlement>(`/company-settlements/${settlement?.id}/transfer`, { transferRef: ref }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['company-settlements'] });
      showToast('اتسجّل تحويل التسوية');
      onClose();
    },
    onError: (error: Error) => setLocalError(error.message),
  });

  if (!settlement) return null;

  const submit = () => {
    const trimmed = transferRef.trim();
    if (!trimmed) {
      setLocalError('مرجع الحوالة مطلوب');
      return;
    }
    setLocalError(null);
    transfer.mutate(trimmed);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`تسجيل تحويل — ${settlement.companyName}`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            رجوع
          </Button>
          <Button variant="brand" size="sm" loading={transfer.isPending} onClick={submit}>
            تأكيد التحويل
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <dl className="flex flex-col gap-2 rounded-[13px] bg-soft p-3 text-[12.5px]">
          <Fact label="صافي التسوية">
            <Money value={settlement.netPayout} size="md" />
          </Fact>
          <Fact label="حساب الدفع">
            {settlement.payoutRef ? (
              <bdi className="font-num text-[11.5px]" dir="ltr">
                {settlement.payoutRef}
              </bdi>
            ) : (
              <span className="text-bad-deep">مافيش حساب مسجّل</span>
            )}
          </Fact>
        </dl>

        {!settlement.payoutRef ? (
          <p className="rounded-[10px] border border-bad-line bg-bad-row px-3 py-2 text-[11.5px] font-bold leading-relaxed text-bad-deep">
            ⚠️ الشركة دي مالهاش حساب دفع مسجّل — أضف الحساب من لوح التفاصيل قبل ما تحوّل، أو أكّد إنك حوّلت بطريقة تانية.
          </p>
        ) : null}

        <Field
          label="مرجع الحوالة البنكية"
          required
          hint="الرقم اللي رجع من البنك — بيتخزّن في سجل التسوية كإثبات للتحويل."
          error={localError}
        >
          <TextInput
            latin
            value={transferRef}
            onChange={(event) => setTransferRef(event.target.value)}
            placeholder="مثلاً: TRF-2026-00123"
            maxLength={120}
            autoFocus
          />
        </Field>
      </div>
    </Modal>
  );
}

// ────────────────────────────────────────────────────────────
// الحساب البنكي للشركة — GET/PUT /company-settlements/accounts/:companyId
// الـ GET بيرجّع { account: X | null } — لازم نقرا res.account زي حساب المطعم.
// ────────────────────────────────────────────────────────────

function CompanyPayoutAccountSection({
  companyId,
  showToast,
}: {
  companyId: string;
  showToast: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const account = useQuery({
    queryKey: ['company-settlements', 'account', companyId],
    // السيرفر بيرجّع { account: X | null } — كائن صريح، بنقرا res.account.
    queryFn: async () => {
      const res = await get<{ account: CompanyPayoutAccount | null }>(`/company-settlements/accounts/${companyId}`);
      return res.account;
    },
  });

  return (
    <div className="rounded-[13px] border border-line p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-black text-ink">الحساب البنكي للشركة</p>
        {!editing ? (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            {account.data ? 'تعديل' : 'إضافة حساب'}
          </Button>
        ) : null}
      </div>

      {account.isPending ? (
        <Loading rows={2} height={28} />
      ) : account.isError ? (
        <p className="rounded-[10px] border border-bad-line bg-bad-row px-3 py-2 text-[11.5px] font-bold text-bad-deep">
          تعذّر تحميل الحساب: {account.error.message}
        </p>
      ) : editing ? (
        <CompanyPayoutAccountForm
          companyId={companyId}
          current={account.data ?? null}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void queryClient.invalidateQueries({ queryKey: ['company-settlements', 'account', companyId] });
            showToast('اتحفظ الحساب البنكي');
          }}
        />
      ) : account.data ? (
        <dl className="flex flex-col gap-2">
          <Fact label="البنك">{account.data.bankName}</Fact>
          <Fact label="اسم الحساب">{account.data.accountName}</Fact>
          <Fact label="الآيبان">
            <bdi className="font-num text-[11.5px] font-extrabold" dir="ltr">
              {account.data.iban}
            </bdi>
          </Fact>
        </dl>
      ) : (
        <p className="text-[11.5px] font-bold text-faint">
          مافيش حساب دفع مسجّل — التسويات الجديدة هتفضل من غير مرجع حساب لحد ما تضيفه.
        </p>
      )}
    </div>
  );
}

interface CompanyPayoutAccountFormProps {
  companyId: string;
  current: CompanyPayoutAccount | null;
  onCancel: () => void;
  onSaved: () => void;
}

function CompanyPayoutAccountForm({ companyId, current, onCancel, onSaved }: CompanyPayoutAccountFormProps) {
  const [bankName, setBankName] = useState(current?.bankName ?? '');
  const [accountName, setAccountName] = useState(current?.accountName ?? '');
  // الآيبان المخزّن مقنّع — ماينفعش يتبعت زي ما هو، فبنبدأ فاضي ونطلب واحد كامل
  const [iban, setIban] = useState('');
  const [localError, setLocalError] = useState<{ field: 'bankName' | 'accountName' | 'iban'; message: string } | null>(
    null,
  );

  const save = useMutation({
    mutationFn: (body: { bankName: string; accountName: string; iban: string }) =>
      put<CompanyPayoutAccount>(`/company-settlements/accounts/${companyId}`, body),
    onSuccess: onSaved,
  });

  const submit = () => {
    const b = bankName.trim();
    const a = accountName.trim();
    const i = iban.trim().replace(/\s+/g, '').toUpperCase();

    if (!b) return setLocalError({ field: 'bankName', message: 'اسم البنك مطلوب' });
    if (!a) return setLocalError({ field: 'accountName', message: 'اسم الحساب مطلوب' });
    if (!i) return setLocalError({ field: 'iban', message: 'الآيبان مطلوب' });

    setLocalError(null);
    save.mutate({ bankName: b, accountName: a, iban: i });
  };

  return (
    <div className="flex flex-col gap-2.5">
      <Field label="اسم البنك" required error={localError?.field === 'bankName' ? localError.message : null}>
        <TextInput
          value={bankName}
          onChange={(event) => setBankName(event.target.value)}
          placeholder="مثلاً: مصرف الراجحي"
          maxLength={120}
          autoFocus
        />
      </Field>

      <Field label="اسم صاحب الحساب" required error={localError?.field === 'accountName' ? localError.message : null}>
        <TextInput
          value={accountName}
          onChange={(event) => setAccountName(event.target.value)}
          placeholder="الاسم زي ما هو في البنك"
          maxLength={160}
        />
      </Field>

      <Field
        label="الآيبان"
        required
        hint={
          current
            ? `الحالي ${current.iban} — اكتب الآيبان كامل عشان يتغيّر. لازم يكون سعودي (SA + ٢٢ رقم).`
            : 'لازم يكون سعودي صحيح — SA وبعده ٢٢ رقم.'
        }
        error={localError?.field === 'iban' ? localError.message : save.isError ? save.error.message : null}
      >
        <TextInput
          latin
          value={iban}
          onChange={(event) => setIban(event.target.value)}
          placeholder="SA0000000000000000000000"
          maxLength={40}
        />
      </Field>

      <div className="flex items-center justify-end gap-2 pt-0.5">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          إلغاء
        </Button>
        <Button variant="brand" size="sm" loading={save.isPending} onClick={submit}>
          حفظ الحساب
        </Button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// توزيع الشركة على المناديب — GET /company-settlements/:id/breakdown
//
// النص التاني من موديل فلوس الشركة: بعد ما المنصة تدفع للشركة (فوق)، الشركة
// بتدفع لكل مندوب نصيبه من التسوية وتسجّله. مجموع حصص المناديب = إجمالي الأجور
// (grossPayout) بالظبط. الصف اللي لسه PENDING فيه زر «سجّل الدفع» بيفتح نافذة
// مرجع اختياري وبيعمل PATCH .../distributions/:id/pay.
// ────────────────────────────────────────────────────────────

function CompanyCaptainDistributionSection({
  settlementId,
  showToast,
}: {
  settlementId: string;
  showToast: (message: string) => void;
}) {
  const [paying, setPaying] = useState<CaptainDistribution | null>(null);

  const breakdown = useQuery({
    queryKey: ['company-settlements', 'breakdown', settlementId],
    queryFn: () => get<CompanySettlementBreakdown>(`/company-settlements/${settlementId}/breakdown`),
    enabled: Boolean(settlementId),
  });

  const captains = breakdown.data?.captains ?? [];
  // مجموع حصص المناديب لازم يطابق إجمالي الأجور — بنبيّنه صراحةً زي مجموع البنود فوق.
  const sharesSum = breakdown.data
    ? Number(captains.reduce((sum, captain) => sum + captain.grossAmount, 0).toFixed(2))
    : null;

  return (
    <div className="rounded-[13px] border border-line p-3">
      <p className="mb-2 text-[12.5px] font-black text-ink">
        توزيع على المناديب
        {breakdown.data ? (
          <span className="ms-1.5 font-num text-[11px] text-muted">({num(captains.length)})</span>
        ) : null}
      </p>

      {breakdown.isPending ? (
        <Loading rows={2} height={40} />
      ) : breakdown.isError ? (
        <p className="rounded-[10px] border border-bad-line bg-bad-row px-3 py-2 text-[11.5px] font-bold text-bad-deep">
          تعذّر تحميل التوزيع: {breakdown.error.message}
        </p>
      ) : captains.length ? (
        <>
          <ul className="flex flex-col gap-1.5">
            {captains.map((captain) => {
              const meta = CAPTAIN_DISTRIBUTION_META[captain.status];
              const paid = captain.status === 'PAID';

              return (
                <li
                  key={captain.distributionId}
                  className="flex flex-col gap-2 rounded-[10px] border border-hair px-2.5 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="block truncate text-[12px] font-extrabold text-ink" title={captain.captainName}>
                        {captain.captainName}
                      </span>
                      <bdi className="block font-num text-[10.5px] font-bold text-muted" dir="ltr">
                        {captain.captainPhone}
                      </bdi>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <Money value={captain.grossAmount} size="sm" hideCurrency />
                      <span className="text-[10px] font-bold text-muted">
                        <bdi className="font-num" dir="ltr">
                          {num(captain.tripCount)}
                        </bdi>{' '}
                        رحلة
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <Pill tone={meta.tone}>{meta.label}</Pill>
                    {paid ? null : (
                      <Button variant="outline" size="sm" onClick={() => setPaying(captain)}>
                        سجّل الدفع
                      </Button>
                    )}
                  </div>

                  {paid ? (
                    <dl className="flex flex-col gap-1 border-t border-hair pt-1.5 text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <dt className="shrink-0 font-extrabold text-label">مرجع الدفع</dt>
                        <dd className="min-w-0 truncate text-end">
                          <bdi className="font-num font-extrabold" dir="ltr">
                            {captain.reference ?? DASH}
                          </bdi>
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <dt className="shrink-0 font-extrabold text-label">وقت الدفع</dt>
                        <dd className="min-w-0 truncate text-end">
                          <bdi className="font-num" dir="ltr">
                            {captain.paidAt ? dateTime(captain.paidAt) : DASH}
                          </bdi>
                        </dd>
                      </div>
                    </dl>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {/* مجموع حصص المناديب = إجمالي الأجور — متساويين بالبناء (كل حصّة قبل العمولة). */}
          {sharesSum !== null ? (
            <div className="mt-1.5 flex items-center justify-between gap-2 rounded-[10px] bg-soft px-2.5 py-2">
              <span className="text-[11.5px] font-extrabold text-label">مجموع حصص المناديب = إجمالي الأجور</span>
              <Money value={sharesSum} size="sm" hideCurrency />
            </div>
          ) : null}

          <MissingDataNote className="pt-2">
            ده بيسجّل دفع الشركة للمندوب للمتابعة بس — طرف المندوب في تطبيق الكباتن (اللي بيوريه «شركتك حوّلتلك كذا») لسه
            ماتعملش.
          </MissingDataNote>
        </>
      ) : (
        <p className="text-[11.5px] font-bold text-faint">مافيش مناديب في التوزيع.</p>
      )}

      <CaptainPayModal distribution={paying} onClose={() => setPaying(null)} showToast={showToast} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// نافذة تسجيل دفع الشركة للمندوب — PATCH /company-settlements/distributions/:id/pay
// المرجع اختياري (body { reference? }). بعد النجاح بنبطّل الكاش تحت
// ['company-settlements'] — ده بيشمل الـ breakdown والقايمة. 409 «اتسجّل مدفوع
// خلاص» بتتعرض جوّه النافذة.
// ────────────────────────────────────────────────────────────

interface CaptainPayModalProps {
  distribution: CaptainDistribution | null;
  onClose: () => void;
  showToast: (message: string) => void;
}

function CaptainPayModal({ distribution, onClose, showToast }: CaptainPayModalProps) {
  const queryClient = useQueryClient();
  const [reference, setReference] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setReference('');
    setLocalError(null);
  }, [distribution?.distributionId]);

  const pay = useMutation({
    mutationFn: (ref: string) =>
      patch<CaptainDistributionPayResult>(
        `/company-settlements/distributions/${distribution?.distributionId}/pay`,
        ref ? { reference: ref } : {},
      ),
    onSuccess: (result) => {
      // ['company-settlements'] بيبطّل الـ breakdown (المفتاح تحته) والقايمة مع بعض.
      void queryClient.invalidateQueries({ queryKey: ['company-settlements'] });
      showToast(`اتسجّل الدفع لـ ${result.captainName}`);
      onClose();
    },
    onError: (error: Error) => setLocalError(error.message),
  });

  if (!distribution) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title={`تسجيل دفع — ${distribution.captainName}`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            رجوع
          </Button>
          <Button variant="brand" size="sm" loading={pay.isPending} onClick={() => pay.mutate(reference.trim())}>
            تأكيد الدفع
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <dl className="flex flex-col gap-2 rounded-[13px] bg-soft p-3 text-[12.5px]">
          <Fact label="المندوب">{distribution.captainName}</Fact>
          <Fact label="رقم الموبايل">
            <bdi className="font-num text-[11.5px]" dir="ltr">
              {distribution.captainPhone}
            </bdi>
          </Fact>
          <Fact label="عدد الرحلات">
            <bdi className="font-num text-[11.5px]" dir="ltr">
              {num(distribution.tripCount)}
            </bdi>
          </Fact>
          <Fact label="حصّة المندوب">
            <Money value={distribution.grossAmount} size="md" />
          </Fact>
        </dl>

        <Field
          label="مرجع الدفع"
          hint="اختياري — رقم الحوالة/التحويل اللي الشركة دفعت بيه للمندوب، بيتخزّن كإثبات."
          error={localError}
        >
          <TextInput
            latin
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="مثلاً: PAY-2026-00042"
            maxLength={120}
            autoFocus
          />
        </Field>

        <MissingDataNote>
          ده بيسجّل إن الشركة دفعت للمندوب حصّته — للمتابعة بس. طرف المندوب في تطبيق الكباتن لسه ماتعملش.
        </MissingDataNote>
      </div>
    </Modal>
  );
}

// ────────────────────────────────────────────────────────────
// الاستردادات — GET /payments/refunds
//
// مكانها هنا مش في صفحة لوحدها: الاسترداد قرار مالي، والمحاسب اللي بيقفل
// الكاش المعلّق بيقعد في الشاشة دي أصلاً.
// ────────────────────────────────────────────────────────────

const REFUND_TABS: Array<{ value: '' | RefundStatus; label: string; tone: Tone }> = [
  { value: '', label: 'الكل', tone: 'neutral' },
  { value: 'AWAITING_APPROVAL', label: 'بانتظار موافقة', tone: 'warn' },
  { value: 'PENDING', label: 'قيد التنفيذ', tone: 'warn' },
  { value: 'COMPLETED', label: 'تم الاسترداد', tone: 'ok' },
  { value: 'REJECTED', label: 'مرفوضة', tone: 'bad' },
  { value: 'FAILED', label: 'فشل', tone: 'bad' },
];

const REFUNDS_PAGE_SIZE = 25;

function RefundsCard() {
  const [status, setStatus] = useState<'' | RefundStatus>('');
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // الاسترداد اللي بنرفض الموافقة عليه — بيفتح نافذة السبب (السبب إلزامي).
  const [rejecting, setRejecting] = useState<RefundListItem | null>(null);
  const queryClient = useQueryClient();

  const params = useMemo(
    () => ({ page, pageSize: REFUNDS_PAGE_SIZE, ...(status ? { status } : {}) }),
    [page, status],
  );

  const refunds = useQuery({
    queryKey: ['refunds', 'list', params],
    queryFn: () => get<RefundsPage>('/payments/refunds', params),
  });

  const rows = refunds.data?.data ?? [];

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3_000);
  };

  const afterChange = () => {
    void queryClient.invalidateQueries({ queryKey: ['refunds'] });
    // الاسترداد بيغيّر حالة دفع الطلب، والمجاميع في التقرير
    void queryClient.invalidateQueries({ queryKey: ['payments'] });
    void queryClient.invalidateQueries({ queryKey: ['reports'] });
  };

  // تسوية الكاش: البوابة عمرها ما هتقفل الصف ده، فالمحاسب بيقفله بإيده بعد
  // ما يسلّم العميل فلوسه.
  const settle = useMutation({
    mutationFn: (id: string) => patch<RefundListItem>(`/payments/refunds/${id}/settle`),
    onSuccess: () => {
      afterChange();
      showToast('اتسجّلت تسوية الاسترداد');
    },
    onError: (error: Error) => setFailure(error.message),
  });

  const retry = useMutation({
    mutationFn: (id: string) => post<RefundListItem>(`/payments/refunds/${id}/retry`),
    onSuccess: () => {
      afterChange();
      showToast('اتبعتت المحاولة تاني');
    },
    onError: (error: Error) => setFailure(error.message),
  });

  // موافقة أدمن تاني على استرداد كبير — بعدها بيتنفّذ زي أي استرداد عادي.
  // السيرفر بيرفض 403 لو اللي بيوافق هو نفسه اللي طلبه (فصل مهام) — بنعرض
  // رسالته العربية زي ما هي؛ الحل إن أدمن تاني (reviewer) يدخل ويوافق.
  const approve = useMutation({
    mutationFn: (id: string) => post<RefundListItem>(`/payments/refunds/${id}/approve`),
    onSuccess: () => {
      afterChange();
      showToast('اتوافق على الاسترداد واتنفّذ');
    },
    onError: (error: Error) => setFailure(error.message),
  });

  // تنبيه البوابة بيتعرض مرة واحدة تحت الجدول بدل ما يتكرر في كل صف
  const providers = useMemo(() => [...new Set(rows.map((row) => row.provider))], [rows]);

  return (
    <Card padding="none" className="flex shrink-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-hair p-[14px]">
        <h2 className="me-auto text-[14.5px] font-black text-ink">
          الاستردادات
          {refunds.data ? <span className="ms-1.5 font-num text-[11.5px] font-bold text-muted">{num(refunds.data.total)}</span> : null}
        </h2>

        {REFUND_TABS.map((tab) => (
          <Chip
            key={tab.value || 'all'}
            tone={tab.tone}
            active={status === tab.value}
            onClick={() => {
              setStatus(tab.value);
              setPage(1);
            }}
          >
            {tab.label}
          </Chip>
        ))}
      </div>

      <div className="flex flex-col p-[14px]">
        <Table gridTemplateColumns="0.9fr 0.8fr 1.1fr 1.5fr 0.9fr 0.9fr 1.1fr">
          <THead>
            <TH>الطلب</TH>
            <TH align="end">المبلغ</TH>
            <TH>التحمّل</TH>
            <TH>السبب</TH>
            <TH>الدفع</TH>
            <TH>نفّذه</TH>
            <TH>الحالة</TH>
          </THead>

          {refunds.isPending ? (
            <Loading rows={5} height={44} className="mt-2" />
          ) : refunds.isError ? (
            <ErrorState message={refunds.error.message} onRetry={() => void refunds.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon="↩️"
              title="مافيش استردادات في الفلتر ده"
              description="غيّر الحالة من الشرائح فوق. الاسترداد بيتعمل من لوح تفاصيل الطلب في صفحة «الطلبات»."
            />
          ) : (
            rows.map((row) => {
              const meta = refundStatusMeta(row);
              const liability = REFUND_LIABILITY_META[row.liability];

              return (
                <TR key={row.id} muted={row.status === 'FAILED' || row.status === 'REJECTED'}>
                  <TD>
                    <bdi className="font-num font-extrabold" dir="ltr">
                      #{row.orderNumber}
                    </bdi>
                    <span className="block font-num text-[11px] font-bold text-muted" dir="ltr">
                      {dateTime(row.createdAt)}
                    </span>
                  </TD>

                  <TD align="end">
                    <Money value={-row.amount} size="sm" hideCurrency className="text-bad-deep" />
                  </TD>

                  {/* التحمّل + نتيجته المالية — العمولة الراجعة هي الأثر الوحيد
                      الظاهر في الأرقام، فبتتكتب تحت الشريحة مباشرة. */}
                  <TD className="overflow-visible whitespace-normal">
                    {liability ? (
                      <Pill tone={liability.tone} title={liability.note}>
                        {liability.label}
                      </Pill>
                    ) : (
                      <Pill tone="neutral">{row.liability}</Pill>
                    )}

                    {row.commissionReversed > 0 ? (
                      <span className="mt-1 block text-[10.5px] font-extrabold leading-tight text-ok">
                        رجعت عمولة {sar(row.commissionReversed)}
                      </span>
                    ) : null}
                  </TD>

                  <TD>
                    <span className="block truncate text-[12px]" title={row.reasonAr}>
                      {row.reasonAr}
                    </span>
                    {row.failReason ? (
                      <span className="block truncate text-[11px] font-bold text-bad-deep" title={row.failReason}>
                        {row.failReason}
                      </span>
                    ) : null}
                  </TD>

                  <TD>
                    {PAYMENT_METHOD_AR[row.paymentMethod] ?? row.paymentMethod}
                    {row.providerRefId ? (
                      <bdi className="block font-num text-[10.5px] text-muted" dir="ltr">
                        {row.providerRefId}
                      </bdi>
                    ) : null}
                  </TD>

                  <TD muted={!row.createdByName}>{row.createdByName ?? DASH}</TD>

                  <TD className="overflow-visible whitespace-normal">
                    <Pill tone={meta.tone}>{meta.label}</Pill>
                    {meta.note ? (
                      <span className="mt-1 block text-[10.5px] font-bold leading-tight text-faint">{meta.note}</span>
                    ) : null}

                    {row.status === 'AWAITING_APPROVAL' ? (
                      // فصل مهام: اللي بيوافق لازم يكون غير اللي طلب — لو نفسه بيرجع 403
                      // ورسالته بتبان تحت الجدول. الحل إن أدمن تاني (reviewer) يدخل ويوافق.
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Button
                          variant="brand"
                          size="sm"
                          disabled={approve.isPending}
                          onClick={() => approve.mutate(row.id)}
                        >
                          موافقة
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setRejecting(row)}>
                          رفض
                        </Button>
                      </div>
                    ) : row.status === 'PENDING' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-1.5"
                        disabled={settle.isPending}
                        onClick={() => settle.mutate(row.id)}
                      >
                        تأكيد التسوية
                      </Button>
                    ) : row.status === 'FAILED' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-1.5"
                        disabled={retry.isPending}
                        onClick={() => retry.mutate(row.id)}
                      >
                        إعادة المحاولة
                      </Button>
                    ) : null}
                  </TD>
                </TR>
              );
            })
          )}
        </Table>

        {refunds.data ? (
          <Pagination page={page} pageSize={refunds.data.pageSize} total={refunds.data.total} onChange={setPage} />
        ) : null}

        {failure ? (
          <p className="mt-2 rounded-[10px] border border-bad-line bg-bad-row px-3 py-2 text-[12px] font-bold text-bad-deep">
            {failure}
          </p>
        ) : null}

        {providers.map((provider) => {
          const note = providerNote(provider);
          return note ? (
            <MissingDataNote key={provider} className="pt-2">
              ⚠️ {note}
            </MissingDataNote>
          ) : null;
        })}
      </div>

      <RefundRejectModal
        refund={rejecting}
        onClose={() => setRejecting(null)}
        onRejected={() => {
          afterChange();
          showToast('اترفضت الموافقة على الاسترداد');
        }}
      />

      {toast ? (
        <div className="fixed bottom-6 start-6 z-[60] rounded-[12px] bg-ink px-4 py-3 text-[12.5px] font-extrabold text-white shadow-float">
          ✓ {toast}
        </div>
      ) : null}
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// نافذة رفض الموافقة على استرداد — POST /payments/refunds/:id/reject
// السبب إلزامي (body { reason }). نفس حرّاس الموافقة: 403 لو اللي بيرفض هو
// اللي طلب الاسترداد، 400 لو مش مستني موافقة — رسايله العربية بتتعرض زي ما هي.
// ────────────────────────────────────────────────────────────

interface RefundRejectModalProps {
  refund: RefundListItem | null;
  onClose: () => void;
  onRejected: () => void;
}

function RefundRejectModal({ refund, onClose, onRejected }: RefundRejectModalProps) {
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setReason('');
    setLocalError(null);
  }, [refund?.id]);

  const reject = useMutation({
    mutationFn: (body: { reason: string }) => post<RefundListItem>(`/payments/refunds/${refund?.id}/reject`, body),
    onSuccess: () => {
      onRejected();
      onClose();
    },
    onError: (error: Error) => setLocalError(error.message),
  });

  if (!refund) return null;

  const submit = () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setLocalError('سبب الرفض مطلوب');
      return;
    }
    setLocalError(null);
    reject.mutate({ reason: trimmed });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`رفض الموافقة — طلب #${refund.orderNumber}`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            رجوع
          </Button>
          <Button variant="danger" size="sm" loading={reject.isPending} onClick={submit}>
            تأكيد الرفض
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <dl className="flex flex-col gap-2 rounded-[13px] bg-soft p-3 text-[12.5px]">
          <Fact label="المبلغ">
            <Money value={refund.amount} size="md" />
          </Fact>
          <Fact label="السبب الأصلي">{refund.reasonAr}</Fact>
        </dl>

        <Field
          label="سبب الرفض"
          required
          hint="بيتسجّل مع الاسترداد وبيبان في القايمة وسجل التدقيق."
          error={localError}
        >
          <TextInput
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="مثلاً: المبلغ كبير ومحتاج مراجعة مدير"
            maxLength={300}
            autoFocus
          />
        </Field>

        <MissingDataNote>
          الرفض بيوقف الاسترداد نهائياً — ماينفّذش ولا فلوس بتتحرّك. لو عايز تنفّذه، سيبه لأدمن تاني يوافق بدل ما يرفض.
        </MissingDataNote>
      </div>
    </Modal>
  );
}
