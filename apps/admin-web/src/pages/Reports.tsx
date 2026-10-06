// التقارير وBI — مؤشرات المنصة + اشتقاقات أمينة من عيّنة الطلبات
import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

import { PageBody, TopBar } from '../components/Shell';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  KpiCard,
  Loading,
  MissingDataNote,
  Money,
  SectionTitle,
  Skeleton,
  cx,
} from '../components/ui';
import { get } from '../lib/api';
import { DASH, dateOnly, durationAr, ltr, money, num, pct } from '../lib/format';

// ────────────────────────────────────────────────────────────
// أشكال الـ API الحقيقية
// ────────────────────────────────────────────────────────────

/** GET /reports/platform — apps/api/src/reports/reports.service.ts#platformReport */
interface PlatformReport {
  range: { from: string; to: string };
  orderCount: number;
  deliveredCount: number;
  gmv: number;
  /** إجمالي العمولة قبل خصم اللي رجع منها مع الاستردادات. */
  revenue: number;
  /** العمولة اللي رجعت للمطاعم مع استردادات الفترة (تحمّل NONE/RESTAURANT). */
  commissionReversed: number;
  /** `revenue` ناقص `commissionReversed` — كسب المنصة الفعلي. */
  netRevenue: number;
  captainCost: number;
  /** `netRevenue` ناقص `captainCost` — مبني على الصافي مش الإجمالي. */
  netMargin: number;
  activeCaptains: number;
  activeBranches: number;
}

type OrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'READY'
  | 'CAPTAIN_ASSIGNED'
  | 'PICKED_UP'
  | 'ON_THE_WAY'
  | 'DELIVERED'
  | 'REJECTED'
  | 'CANCELLED';

/** GET /orders — mapOrder بيرجّع الطلب كامل، فالحقول المالية موجودة في القائمة. */
interface ReportOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  total: number;
  commission: number;
  captainPayout: number;
  placedAt: string;
  deliveredAt: string | null;
  cancelledAt: string | null;
  rejectReason: string | null;
  cancelReason: string | null;
  branch: { id: string; nameAr: string };
  captain: { id: string; user: { fullName: string } } | null;
}

interface OrdersPage {
  data: ReportOrder[];
  total: number;
  page: number;
  pageSize: number;
}

// ────────────────────────────────────────────────────────────
// المدى الزمني
//
// «GET /reports/platform» بيدعم today | week | month بس (Range في
// reports.module.ts) — مافيش تجميع يومي/أسبوعي/شهري بدلاء عن كده،
// فالشرائح بتتسمّى باللي الـ API بيعرفه فعلاً.
// ────────────────────────────────────────────────────────────

type Range = 'today' | 'week' | 'month';

const RANGES: Array<{ value: Range; label: string }> = [
  { value: 'today', label: 'اليوم' },
  { value: 'week', label: 'الأسبوع' },
  { value: 'month', label: 'الشهر' },
];

/** نفس حساب rangeToDates في السيرفر — عشان عيّنة الطلبات تطابق التقرير. */
function rangeToFrom(range: Range): string {
  const date = new Date();
  if (range === 'today') date.setHours(0, 0, 0, 0);
  else if (range === 'week') date.setDate(date.getDate() - 7);
  else date.setMonth(date.getMonth() - 1);
  return date.toISOString();
}

/** أقصى ما بيسمح بيه ListOrdersDto (orders.service.ts#list بيعمل Math.min). */
const SAMPLE_SIZE = 100;

const SAMPLE_NOTE = 'محسوبة من آخر ١٠٠ طلب';

const WEEKDAYS_AR = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

// ────────────────────────────────────────────────────────────
// اشتقاقات — كلها من صفوف حقيقية، من غير أي رقم مخترع
// ────────────────────────────────────────────────────────────

interface Derived {
  /** متوسط (deliveredAt − placedAt) بالدقايق على الطلبات المسلّمة. */
  avgDeliveryMinutes: number | null;
  deliveredWithTimes: number;
  cancellationRate: number | null;
  cancelledCount: number;
  rejectedCount: number;
  /** ساعة اليوم (٠-٢٣) اللي فيها أكتر عدد طلبات. */
  peakHour: number | null;
  peakHourCount: number;
  topBranches: Array<{ id: string; nameAr: string; revenue: number; orders: number }>;
  topCaptains: Array<{ id: string; fullName: string; payout: number; orders: number }>;
  cancelReasons: Array<{ reason: string; count: number }>;
}

function derive(orders: ReportOrder[]): Derived {
  const deliveryDurations: number[] = [];
  const hours = new Array<number>(24).fill(0);
  const branchMap = new Map<string, { id: string; nameAr: string; revenue: number; orders: number }>();
  const captainMap = new Map<string, { id: string; fullName: string; payout: number; orders: number }>();
  const reasonMap = new Map<string, number>();

  let cancelledCount = 0;
  let rejectedCount = 0;

  for (const order of orders) {
    const placed = new Date(order.placedAt);
    if (!Number.isNaN(placed.getTime())) hours[placed.getHours()] += 1;

    if (order.status === 'CANCELLED') cancelledCount += 1;
    if (order.status === 'REJECTED') rejectedCount += 1;

    if (order.status === 'CANCELLED' || order.status === 'REJECTED') {
      // rejectReason إلزامي عند الرفض (schema.prisma#Order) — والإلغاء بيستخدم cancelReason
      const reason = order.rejectReason?.trim() || order.cancelReason?.trim() || 'من غير سبب مسجّل';
      reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1);
    }

    if (order.status !== 'DELIVERED') continue;

    if (order.deliveredAt) {
      const delivered = new Date(order.deliveredAt);
      const minutes = (delivered.getTime() - placed.getTime()) / 60_000;
      if (Number.isFinite(minutes) && minutes > 0) deliveryDurations.push(minutes);
    }

    const branch = branchMap.get(order.branch.id);
    if (branch) {
      branch.revenue += order.total;
      branch.orders += 1;
    } else {
      branchMap.set(order.branch.id, {
        id: order.branch.id,
        nameAr: order.branch.nameAr,
        revenue: order.total,
        orders: 1,
      });
    }

    if (order.captain) {
      const captain = captainMap.get(order.captain.id);
      if (captain) {
        captain.payout += order.captainPayout;
        captain.orders += 1;
      } else {
        captainMap.set(order.captain.id, {
          id: order.captain.id,
          fullName: order.captain.user.fullName,
          payout: order.captainPayout,
          orders: 1,
        });
      }
    }
  }

  const peakHourCount = Math.max(...hours);
  const peakHour = orders.length && peakHourCount > 0 ? hours.indexOf(peakHourCount) : null;

  return {
    avgDeliveryMinutes: deliveryDurations.length
      ? deliveryDurations.reduce((sum, value) => sum + value, 0) / deliveryDurations.length
      : null,
    deliveredWithTimes: deliveryDurations.length,
    cancellationRate: orders.length ? (cancelledCount / orders.length) * 100 : null,
    cancelledCount,
    rejectedCount,
    peakHour,
    peakHourCount,
    topBranches: [...branchMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 3),
    topCaptains: [...captainMap.values()].sort((a, b) => b.orders - a.orders).slice(0, 3),
    cancelReasons: [...reasonMap.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
  };
}

interface DayBucket {
  key: string;
  label: string;
  sales: number;
  orders: number;
}

/** آخر ٧ أيام بالترتيب، والأيام اللي مافيهاش طلبات بتفضل بصفر — مش بتختفي. */
function bucketByDay(orders: ReportOrder[]): DayBucket[] {
  const buckets: DayBucket[] = [];
  const index = new Map<string, DayBucket>();

  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - offset);

    const bucket: DayBucket = {
      key: dateOnly(date),
      label: WEEKDAYS_AR[date.getDay()],
      sales: 0,
      orders: 0,
    };
    buckets.push(bucket);
    index.set(bucket.key, bucket);
  }

  for (const order of orders) {
    if (order.status !== 'DELIVERED') continue;
    const bucket = index.get(dateOnly(order.placedAt));
    if (!bucket) continue;
    bucket.sales += order.total;
    bucket.orders += 1;
  }

  return buckets;
}

// ────────────────────────────────────────────────────────────
// تصدير CSV — من الصفوف المحمّلة فعلاً (لا يوجد endpoint تصدير)
// ────────────────────────────────────────────────────────────

const CSV_HEADERS = ['اليوم', 'مبيعات مسلّمة', 'عدد الطلبات المسلّمة'];

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function downloadCsv(buckets: DayBucket[]): void {
  const lines = [CSV_HEADERS.map(csvCell).join(',')];
  for (const bucket of buckets) {
    lines.push([bucket.key, money(bucket.sales), String(bucket.orders)].map(csvCell).join(','));
  }

  // ﻿ = BOM — من غيره إكسل بيفتح العربي بترميز غلط
  const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `qadir-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

// ────────────────────────────────────────────────────────────
// الصفحة
// ────────────────────────────────────────────────────────────

export default function Reports() {
  const [range, setRange] = useState<Range>('today');

  const report = useQuery({
    queryKey: ['reports', 'platform', range],
    queryFn: () => get<PlatformReport>('/reports/platform', { range }),
  });

  /** عيّنة الفترة المختارة — منها بتتحسب المؤشرات المشتقة والقوائم. */
  const sample = useQuery({
    queryKey: ['orders', 'reports-sample', range],
    queryFn: () => get<OrdersPage>('/orders', { pageSize: SAMPLE_SIZE, from: rangeToFrom(range) }),
  });

  /** الرسم دايماً ٧ أيام — مستقل عن الشريحة المختارة. */
  const week = useQuery({
    queryKey: ['orders', 'reports-week'],
    queryFn: () => {
      const from = new Date();
      from.setDate(from.getDate() - 6);
      from.setHours(0, 0, 0, 0);
      return get<OrdersPage>('/orders', { pageSize: SAMPLE_SIZE, from: from.toISOString() });
    },
  });

  const derived = useMemo(() => derive(sample.data?.data ?? []), [sample.data]);
  const buckets = useMemo(() => bucketByDay(week.data?.data ?? []), [week.data]);

  const sampleCount = sample.data?.data.length ?? 0;
  const truncated = (sample.data?.total ?? 0) > sampleCount;

  return (
    <>
      <TopBar
        title="التقارير وBI"
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
              disabled={!week.data}
              title="تصدير مبيعات آخر ٧ أيام المحسوبة في الصفحة"
              onClick={() => downloadCsv(buckets)}
            >
              Excel
            </Button>
            <Button variant="outline" size="sm" icon="⬇" disabled title="لا يوجد endpoint لتوليد PDF في الـ API">
              PDF
            </Button>
          </>
        }
      />

      <PageBody>
        <MissingDataNote>
          الفلتر بيدعم <span className="num">today</span> / <span className="num">week</span> /{' '}
          <span className="num">month</span> بس — التجميع اليومي/الأسبوعي/الشهري كسلسلة زمنية محتاج
          «GET /reports/platform/timeseries». وتصدير PDF محتاج endpoint خاص بيه.
        </MissingDataNote>

        {/* ── المؤشرات ── */}
        {report.isPending || sample.isPending ? (
          <div className="grid grid-cols-4 gap-[14px]">
            {Array.from({ length: 4 }, (_, index) => (
              <Card key={index} className="h-[112px]">
                <Skeleton height={12} className="w-1/2" />
                <Skeleton height={26} className="mt-3 w-2/3" />
              </Card>
            ))}
          </div>
        ) : report.isError || sample.isError ? (
          <Card>
            <ErrorState
              message={(report.error ?? sample.error)?.message}
              onRetry={() => {
                void report.refetch();
                void sample.refetch();
              }}
            />
          </Card>
        ) : (
          <div className="grid grid-cols-4 gap-[14px]">
            {/* من الـ endpoint مباشرة — مش اشتقاق */}
            <KpiCard
              inverted
              label="مبيعات الفترة"
              value={<Money value={report.data?.gmv} size="xl" />}
              note={`${num(report.data?.deliveredCount)} طلب مسلّم · من GET /reports/platform`}
            />

            <KpiCard
              label="متوسط زمن التوصيل"
              value={derived.avgDeliveryMinutes === null ? DASH : durationAr(derived.avgDeliveryMinutes)}
              note={
                derived.avgDeliveryMinutes === null
                  ? 'لا توجد طلبات مسلَّمة بطوابع وقت في العيّنة'
                  : `${SAMPLE_NOTE} · ${ltr(num(derived.deliveredWithTimes))} طلب مسلّم`
              }
            />

            <KpiCard
              label="معدل الإلغاء"
              value={derived.cancellationRate === null ? DASH : pct(derived.cancellationRate)}
              note={`${SAMPLE_NOTE} · ${ltr(num(derived.cancelledCount))} ملغي و${ltr(
                num(derived.rejectedCount),
              )} مرفوض`}
            />

            <KpiCard
              label="ساعة الذروة"
              value={
                derived.peakHour === null ? (
                  DASH
                ) : (
                  <span dir="ltr">
                    {String(derived.peakHour).padStart(2, '0')}:00
                  </span>
                )
              }
              note={
                derived.peakHour === null
                  ? 'لا توجد طلبات في العيّنة'
                  : `${SAMPLE_NOTE} · ${ltr(num(derived.peakHourCount))} طلب في الساعة دي`
              }
            />
          </div>
        )}

        {truncated ? (
          <MissingDataNote>
            العيّنة مقصوصة على {ltr(num(SAMPLE_SIZE))} طلب من إجمالي {ltr(num(sample.data?.total))} في الفترة —
            «GET /orders» بيقصّ الـ pageSize على ١٠٠. المؤشرات المشتقة دي تقريبية لحد ما التجميع يتعمل في السيرفر.
          </MissingDataNote>
        ) : null}

        {/* ── الرسم ── */}
        <Card padding="lg">
          <SectionTitle aside="مبيعات الطلبات المسلّمة — من الطلبات المحمّلة">مبيعات آخر ٧ أيام</SectionTitle>

          {week.isPending ? (
            <Loading rows={1} height={180} />
          ) : week.isError ? (
            <ErrorState message={week.error.message} onRetry={() => void week.refetch()} />
          ) : (
            <SalesBars buckets={buckets} />
          )}
        </Card>

        {/* ── القوائم ── */}
        <div className="grid grid-cols-3 gap-3">
          <Card padding="lg">
            <SectionTitle aside={SAMPLE_NOTE}>🏆 أفضل المطاعم</SectionTitle>

            {sample.isPending ? (
              <Loading rows={3} height={34} />
            ) : derived.topBranches.length === 0 ? (
              <EmptyState icon="🍔" title="لا توجد طلبات مسلَّمة في العيّنة" />
            ) : (
              <ol className="flex flex-col">
                {derived.topBranches.map((branch, index) => (
                  <RankRow key={branch.id} rank={index + 1} name={branch.nameAr} sub={`${num(branch.orders)} طلب`}>
                    <Money value={branch.revenue} size="sm" hideCurrency />
                  </RankRow>
                ))}
              </ol>
            )}
          </Card>

          <Card padding="lg">
            <SectionTitle aside={SAMPLE_NOTE}>🥇 أفضل الكباتن</SectionTitle>

            {sample.isPending ? (
              <Loading rows={3} height={34} />
            ) : derived.topCaptains.length === 0 ? (
              <EmptyState icon="🛵" title="لا يوجد كباتن في العيّنة" />
            ) : (
              <ol className="flex flex-col">
                {derived.topCaptains.map((captain, index) => (
                  <RankRow
                    key={captain.id}
                    rank={index + 1}
                    name={captain.fullName}
                    sub={`${num(captain.orders)} توصيلة`}
                  >
                    <Money value={captain.payout} size="sm" hideCurrency />
                  </RankRow>
                ))}
              </ol>
            )}
          </Card>

          <Card padding="lg">
            <SectionTitle aside={SAMPLE_NOTE}>أسباب الإلغاء</SectionTitle>

            {sample.isPending ? (
              <Loading rows={3} height={34} />
            ) : derived.cancelReasons.length === 0 ? (
              <EmptyState icon="✓" title="لا يوجد إلغاء ولا رفض في العيّنة" />
            ) : (
              <CancelReasons reasons={derived.cancelReasons} />
            )}
          </Card>
        </div>
      </PageBody>
    </>
  );
}

// ────────────────────────────────────────────────────────────
// الرسم — أعمدة بـ div، مش مكتبة
// أعلى يوم بلون brand والباقي bar (نفس ما التصميم عامل).
// ────────────────────────────────────────────────────────────

function SalesBars({ buckets }: { buckets: DayBucket[] }) {
  const max = Math.max(...buckets.map((bucket) => bucket.sales), 0);

  if (max === 0) {
    return (
      <EmptyState
        icon="📊"
        title="لا توجد مبيعات مسلَّمة في آخر ٧ أيام"
        description="الأعمدة مبنية على الطلبات المحمَّلة فعلاً — دون تعبئة بأرقام تقديرية."
      />
    );
  }

  return (
    <div className="flex h-[190px] items-end gap-3">
      {buckets.map((bucket) => {
        const isMax = bucket.sales === max;
        const height = Math.max((bucket.sales / max) * 100, bucket.sales > 0 ? 4 : 1);

        return (
          <div key={bucket.key} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <span className="font-num text-[11px] font-extrabold text-muted" dir="ltr">
              {bucket.sales > 0 ? money(bucket.sales) : DASH}
            </span>

            <div
              title={`${bucket.key} · ${num(bucket.orders)} طلب`}
              className={cx('w-full rounded-t-[8px] transition-all', isMax ? 'bg-brand' : 'bg-bar')}
              style={{ height: `${height}%` }}
            />

            <span className="text-[11px] font-extrabold text-label">{bucket.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// صف ترتيب — الرقم ذهبي زي التصميم
// ────────────────────────────────────────────────────────────

interface RankRowProps {
  rank: number;
  name: string;
  sub: string;
  children: ReactNode;
}

function RankRow({ rank, name, sub, children }: RankRowProps) {
  return (
    <li className="flex items-center gap-2.5 border-b border-hair py-2 last:border-0">
      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-tint font-num text-[11.5px] font-extrabold text-gold-deep">
        {rank}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-extrabold text-ink">{name}</span>
        <span className="block truncate font-num text-[11px] font-bold text-muted" dir="ltr">
          {sub}
        </span>
      </span>

      <span className="shrink-0 text-ink">{children}</span>
    </li>
  );
}

// ────────────────────────────────────────────────────────────
// أسباب الإلغاء — أعمدة أفقية ١٠٠٪
// ────────────────────────────────────────────────────────────

function CancelReasons({ reasons }: { reasons: Array<{ reason: string; count: number }> }) {
  const total = reasons.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <ul className="flex flex-col gap-2.5">
      {reasons.map((entry) => {
        const share = (entry.count / total) * 100;

        return (
          <li key={entry.reason}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-[12px] font-extrabold text-ink">{entry.reason}</span>
              <span className="shrink-0 font-num text-[11.5px] font-extrabold text-muted" dir="ltr">
                {pct(share, 0)}
              </span>
            </div>

            <div className="h-[7px] w-full overflow-hidden rounded-pill bg-bar">
              <div className="h-full rounded-pill bg-bad" style={{ width: `${share}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
