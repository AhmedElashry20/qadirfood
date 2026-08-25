// الجودة والتقييمات — لوحة تحليلية كاملة على وحدة Quality في الـ API
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { PageBody, TopBar } from '../components/Shell';
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  KpiCard,
  Loading,
  SearchInput,
  SectionTitle,
  Select,
  Skeleton,
  TD,
  TH,
  THead,
  TR,
  Table,
  Toggle,
  cx,
  type SelectOption,
} from '../components/ui';
import { get } from '../lib/api';
import { DASH, num, pct, relativeAr } from '../lib/format';

// ────────────────────────────────────────────────────────────
// أشكال الـ API الحقيقية — apps/api/src/quality/quality.service.ts
// ────────────────────────────────────────────────────────────

type Range = 'today' | 'week' | 'month' | 'all';

interface Summary {
  totalReviews: number;
  avgRestaurant: number | null;
  avgCaptain: number | null;
  lowRated: number;
  lowRatedPct: number;
  commentCount: number;
}

interface StarBucket {
  stars: number;
  count: number;
}

interface WorstBranch {
  id: string;
  nameAr: string;
  rating: number;
  ratingCount: number;
}

interface WorstCaptain {
  id: string;
  name: string;
  rating: number;
  ratingCount: number;
}

interface Complaint {
  id: string;
  restaurantStars: number;
  captainStars: number | null;
  comment: string | null;
  orderNumber: string;
  branch: string | null;
  customer: string;
  createdAt: string;
}

interface TrendBucket {
  bucket: string;
  avgRestaurant: number | null;
  avgCaptain: number | null;
  count: number;
}

/** GET /quality/overview */
interface QualityOverview {
  range: Range;
  summary: Summary;
  restaurantDistribution: StarBucket[];
  captainDistribution: StarBucket[];
  worstBranches: WorstBranch[];
  worstCaptains: WorstCaptain[];
  recentComplaints: Complaint[];
  trend: TrendBucket[];
}

/** GET /quality/reviews — عنصر واحد */
interface QualityReview {
  id: string;
  restaurantStars: number;
  captainStars: number | null;
  comment: string | null;
  orderNumber: string;
  branch: string | null;
  captain: string | null;
  customer: string;
  createdAt: string;
}

// ────────────────────────────────────────────────────────────
// ثوابت العرض
// ────────────────────────────────────────────────────────────

const RANGES: Array<{ value: Range; label: string }> = [
  { value: 'today', label: 'اليوم' },
  { value: 'week', label: 'الأسبوع' },
  { value: 'month', label: 'الشهر' },
  { value: 'all', label: 'الكل' },
];

/** ألوان النظام كقيم حرفية — recharts محتاج hex مش كلاسات Tailwind. */
const C = {
  brandDeep: '#E8C400',
  ink: '#1C1C1C',
  grid: '#EFEDE5',
  muted: '#8A8A8A',
  head: '#8A8368',
  bar: '#EDE9DC',
} as const;

/** لون عمود كل نجمة — ذهبي للعالي، أحمر للـ ١-٢★ (متدرّج). */
const STAR_COLOR: Record<number, string> = {
  5: '#FFD200',
  4: '#E8C400',
  3: '#B89A00',
  2: '#E23E3E',
  1: '#C43030',
};

/** خيارات فلتر النجوم في جدول التقييمات — القيمة الفاضية «كل النجوم». */
const STAR_OPTIONS: SelectOption[] = [
  { value: '5', label: '5 نجوم' },
  { value: '4', label: '4 نجوم' },
  { value: '3', label: '3 نجوم' },
  { value: '2', label: 'نجمتان' },
  { value: '1', label: 'نجمة واحدة' },
];

const SEARCH_DEBOUNCE_MS = 350;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** تسمية عمود الاتجاه — بالساعة لليوم، وباليوم لأي مدى أطول. */
function bucketLabel(iso: string, kind: 'hour' | 'day'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  if (kind === 'hour') return `${pad2(d.getHours())}:00`;
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

// ────────────────────────────────────────────────────────────
// الصفحة
// ────────────────────────────────────────────────────────────

export default function Quality() {
  const [range, setRange] = useState<Range>('week');

  const overview = useQuery({
    queryKey: ['quality', 'overview', range],
    queryFn: () => get<QualityOverview>('/quality/overview', { range }),
  });

  return (
    <>
      <TopBar
        title="⭐ الجودة"
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
          <span className="whitespace-nowrap text-[11.5px] font-bold text-muted">
            {overview.isFetching
              ? 'جارِ التحديث…'
              : overview.dataUpdatedAt
                ? `آخر تحديث ${relativeAr(new Date(overview.dataUpdatedAt))}`
                : ''}
          </span>
        }
      />

      <PageBody>
        {/* ── المؤشرات ── */}
        {overview.isPending ? (
          <div className="grid grid-cols-4 gap-[14px]">
            {Array.from({ length: 4 }, (_, index) => (
              <Card key={index} className="h-[104px]">
                <Skeleton height={12} className="w-1/2" />
                <Skeleton height={26} className="mt-3 w-2/3" />
              </Card>
            ))}
          </div>
        ) : overview.isError ? (
          <Card>
            <ErrorState message={overview.error.message} onRetry={() => void overview.refetch()} />
          </Card>
        ) : overview.data ? (
          <SummaryKpis summary={overview.data.summary} />
        ) : null}

        {/* ── توزيع النجوم — قلب الصفحة ── */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Card padding="lg">
            <SectionTitle aside="٥★ → ١★">توزيع تقييم المطاعم</SectionTitle>
            <StarBreakdown query={overview} dataKey="restaurantDistribution" />
          </Card>

          <Card padding="lg">
            <SectionTitle aside="٥★ → ١★">توزيع تقييم الكباتن</SectionTitle>
            <StarBreakdown query={overview} dataKey="captainDistribution" />
          </Card>
        </div>

        {/* ── الاتجاه + أحدث الشكاوى ── */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Card className="flex flex-col lg:col-span-2" padding="lg">
            <SectionTitle
              aside={
                <div className="flex items-center gap-3">
                  <LegendDot color={C.brandDeep}>المطاعم</LegendDot>
                  <LegendDot color={C.ink}>الكباتن</LegendDot>
                </div>
              }
            >
              اتجاه التقييمات
            </SectionTitle>
            <TrendChart query={overview} range={range} />
          </Card>

          <Card className="flex min-h-0 flex-col" padding="lg">
            <SectionTitle aside="تقييم منخفض + تعليق">💬 أحدث الشكاوى</SectionTitle>
            <ComplaintsFeed query={overview} />
          </Card>
        </div>

        {/* ── أضعف الفروع / أضعف الكباتن ── */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Card padding="lg">
            <SectionTitle aside="الأقل تقييماً">📉 أضعف الفروع</SectionTitle>
            <WorstList
              query={overview}
              select={(d) =>
                d.worstBranches.map((b) => ({ id: b.id, name: b.nameAr, rating: b.rating, ratingCount: b.ratingCount }))
              }
              emptyIcon="🍔"
              emptyTitle="مافيش فروع متقيّمة لسه"
            />
          </Card>

          <Card padding="lg">
            <SectionTitle aside="الأقل تقييماً">📉 أضعف الكباتن</SectionTitle>
            <WorstList
              query={overview}
              select={(d) =>
                d.worstCaptains.map((c) => ({ id: c.id, name: c.name, rating: c.rating, ratingCount: c.ratingCount }))
              }
              emptyIcon="🛵"
              emptyTitle="مافيش كباتن متقيّمين لسه"
            />
          </Card>
        </div>

        {/* ── كل التقييمات ── */}
        <ReviewsSection range={range} />
      </PageBody>
    </>
  );
}

// ────────────────────────────────────────────────────────────
// بطاقات المؤشرات
// ────────────────────────────────────────────────────────────

function SummaryKpis({ summary }: { summary: Summary }) {
  return (
    <div className="grid grid-cols-4 gap-[14px]">
      <RatingKpi label="متوسط تقييم المطاعم" avg={summary.avgRestaurant} reviewCount={summary.totalReviews} />
      <RatingKpi label="متوسط تقييم الكباتن" avg={summary.avgCaptain} reviewCount={summary.totalReviews} />

      <KpiCard
        inverted
        label="إجمالي التقييمات"
        value={num(summary.totalReviews)}
        note={`${num(summary.commentCount)} منها عليه تعليق`}
      />

      <KpiCard
        label="التقييمات المنخفضة"
        value={<span className={cx(summary.lowRated > 0 && 'text-bad-deep')}>{num(summary.lowRated)}</span>}
        note={`${pct(summary.lowRatedPct, 0)} من الإجمالي · نجمتان أو أقل`}
      />
    </div>
  );
}

/** بطاقة متوسط تقييم — بتعرض «—» بأمانة لما مافيش تقييمات بدل صفر وهمي. */
function RatingKpi({ label, avg, reviewCount }: { label: string; avg: number | null; reviewCount: number }) {
  return (
    <KpiCard
      label={label}
      value={
        avg !== null ? (
          <span className="inline-flex items-baseline gap-1 font-num">
            {avg.toFixed(1)}
            <span className="text-[16px] text-brand">★</span>
          </span>
        ) : (
          <span className="font-num text-faint">{DASH}</span>
        )
      }
      note={avg !== null ? `من ${num(reviewCount)} تقييم` : 'مافيش تقييمات في الفترة'}
    />
  );
}

// ────────────────────────────────────────────────────────────
// توزيع النجوم — أعمدة أفقية ٥★ → ١★
// ────────────────────────────────────────────────────────────

function StarBreakdown({
  query,
  dataKey,
}: {
  query: UseQueryResult<QualityOverview>;
  dataKey: 'restaurantDistribution' | 'captainDistribution';
}) {
  if (query.isPending) return <Loading rows={5} height={26} />;
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;

  const dist = query.data?.[dataKey] ?? [];
  const total = dist.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) return <EmptyState icon="⭐" title="مافيش تقييمات في الفترة" />;

  const max = Math.max(...dist.map((d) => d.count));
  const ordered = [...dist].sort((a, b) => b.stars - a.stars);

  return (
    <ul className="flex flex-col gap-2.5">
      {ordered.map((d) => {
        const width = max > 0 ? Math.max((d.count / max) * 100, d.count > 0 ? 4 : 1.5) : 1.5;
        const share = total > 0 ? (d.count / total) * 100 : 0;

        return (
          <li key={d.stars} className="flex items-center gap-3">
            <span
              className={cx(
                'w-[30px] shrink-0 font-num text-[12.5px] font-extrabold',
                d.stars <= 2 ? 'text-bad-deep' : 'text-gold-deep',
              )}
              dir="ltr"
            >
              {d.stars}★
            </span>

            <div className="h-[12px] flex-1 overflow-hidden rounded-pill bg-soft">
              <div
                className="h-full rounded-pill transition-all"
                style={{ width: `${width}%`, backgroundColor: STAR_COLOR[d.stars] }}
              />
            </div>

            <span className="w-[56px] shrink-0 text-end font-num text-[12px] font-extrabold text-ink" dir="ltr">
              {num(d.count)}
            </span>
            <span className="w-[40px] shrink-0 text-end font-num text-[11px] font-bold text-muted" dir="ltr">
              {pct(share, 0)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ────────────────────────────────────────────────────────────
// اتجاه التقييمات — عمود عدد التقييمات (خلفية) + خطّين للمتوسطين
// ────────────────────────────────────────────────────────────

interface TrendPoint {
  label: string;
  restaurant: number | null;
  captain: number | null;
  count: number;
}

function TrendChart({ query, range }: { query: UseQueryResult<QualityOverview>; range: Range }) {
  if (query.isPending) return <Loading rows={1} height={280} />;
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;

  const trend = query.data?.trend ?? [];

  if (trend.length === 0) {
    return (
      <EmptyState
        icon="📈"
        title="مافيش تقييمات في الفترة دي"
        description="الرسم بيتبني من التقييمات الحقيقية — مافيش تعبئة بأرقام تقديرية."
      />
    );
  }

  const kind = range === 'today' ? 'hour' : 'day';
  const data: TrendPoint[] = trend.map((t) => ({
    label: bucketLabel(t.bucket, kind),
    restaurant: t.avgRestaurant,
    captain: t.avgCaptain,
    count: t.count,
  }));

  return (
    <div className="h-[280px] w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontFamily: 'Outfit', fontSize: 11, fill: C.muted }}
            tickLine={false}
            axisLine={{ stroke: C.grid }}
            minTickGap={12}
          />
          <YAxis
            yAxisId="rating"
            domain={[0, 5]}
            ticks={[1, 2, 3, 4, 5]}
            tick={{ fontFamily: 'Outfit', fontSize: 11, fill: C.muted }}
            tickLine={false}
            axisLine={false}
            width={30}
            tickFormatter={(v: number) => `${v}★`}
          />
          <YAxis
            yAxisId="count"
            orientation="right"
            tick={{ fontFamily: 'Outfit', fontSize: 11, fill: C.head }}
            tickLine={false}
            axisLine={false}
            width={30}
            allowDecimals={false}
          />
          <Tooltip cursor={{ stroke: C.grid, strokeWidth: 1 }} content={<TrendTooltip />} />
          <Bar yAxisId="count" dataKey="count" name="عدد التقييمات" fill={C.bar} radius={[4, 4, 0, 0]} barSize={18} />
          <Line
            yAxisId="rating"
            type="monotone"
            dataKey="restaurant"
            name="المطاعم"
            stroke={C.brandDeep}
            strokeWidth={2.5}
            connectNulls
            dot={{ r: 2.5, fill: C.brandDeep, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
          <Line
            yAxisId="rating"
            type="monotone"
            dataKey="captain"
            name="الكباتن"
            stroke={C.ink}
            strokeWidth={2.5}
            connectNulls
            dot={{ r: 2.5, fill: C.ink, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

interface TipProps {
  active?: boolean;
  payload?: Array<{ payload?: TrendPoint }>;
  label?: string | number;
}

function TrendTooltip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div className="rounded-[10px] border border-line bg-surface px-3 py-2 shadow-float" dir="rtl">
      <p className="mb-1 font-num text-[11px] font-black text-ink" dir="ltr">
        {label}
      </p>
      <div className="flex flex-col gap-0.5">
        <TipLine color={C.brandDeep} label="المطاعم" value={row.restaurant != null ? `${row.restaurant.toFixed(1)}★` : DASH} />
        <TipLine color={C.ink} label="الكباتن" value={row.captain != null ? `${row.captain.toFixed(1)}★` : DASH} />
        <TipLine color={C.muted} label="عدد التقييمات" value={num(row.count)} />
      </div>
    </div>
  );
}

function TipLine({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-[11.5px]">
      <span className="inline-flex items-center gap-1.5 font-bold text-muted">
        <span className="h-[8px] w-[8px] rounded-full" style={{ backgroundColor: color }} aria-hidden />
        {label}
      </span>
      <span className="font-num font-extrabold text-ink" dir="ltr">
        {value}
      </span>
    </div>
  );
}

function LegendDot({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-label">
      <span className="h-[9px] w-[9px] rounded-full" style={{ backgroundColor: color }} aria-hidden />
      {children}
    </span>
  );
}

// ────────────────────────────────────────────────────────────
// أحدث الشكاوى — تقييمات منخفضة عليها تعليق، الجزء القابل للتنفيذ
// ────────────────────────────────────────────────────────────

function ComplaintsFeed({ query }: { query: UseQueryResult<QualityOverview> }) {
  if (query.isPending) return <Loading rows={5} height={72} />;
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;

  const items = query.data?.recentComplaints ?? [];

  if (items.length === 0) {
    return (
      <EmptyState
        icon="✅"
        title="مافيش شكاوى في الفترة"
        description="أحدث التقييمات المنخفضة اللي عليها تعليق هتظهر هنا."
      />
    );
  }

  return (
    <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto pe-1" style={{ maxHeight: 340 }}>
      {items.map((c) => (
        <li key={c.id} className="flex flex-col gap-1.5 rounded-[10px] border border-hair bg-soft px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-3 text-[11px] font-bold text-muted">
              <span className="inline-flex items-center gap-1">
                مطعم <StarTag stars={c.restaurantStars} />
              </span>
              {c.captainStars !== null ? (
                <span className="inline-flex items-center gap-1">
                  كابتن <StarTag stars={c.captainStars} />
                </span>
              ) : null}
            </span>
            <span className="shrink-0 text-[10px] font-bold text-faint">{relativeAr(c.createdAt)}</span>
          </div>

          {c.comment ? <p className="text-[12px] font-bold leading-relaxed text-ink">{c.comment}</p> : null}

          <div className="flex items-center justify-between gap-2 text-[10.5px] font-bold text-muted">
            <span className="min-w-0 truncate">
              {c.branch ?? 'بدون فرع'} · {c.customer}
            </span>
            <span className="shrink-0 font-num text-faint" dir="ltr">
              #{c.orderNumber}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ────────────────────────────────────────────────────────────
// أضعف الفروع / الكباتن — قائمة مرتّبة، التقييم أحمر تحت ٤★
// ────────────────────────────────────────────────────────────

interface WorstItem {
  id: string;
  name: string;
  rating: number;
  ratingCount: number;
}

function WorstList({
  query,
  select,
  emptyIcon,
  emptyTitle,
}: {
  query: UseQueryResult<QualityOverview>;
  select: (data: QualityOverview) => WorstItem[];
  emptyIcon: string;
  emptyTitle: string;
}) {
  if (query.isPending) return <Loading rows={4} height={40} />;
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;

  const items = query.data ? select(query.data) : [];
  if (items.length === 0) return <EmptyState icon={emptyIcon} title={emptyTitle} />;

  return (
    <ol className="flex flex-col">
      {items.map((item, index) => {
        const low = item.rating < 4;

        return (
          <li key={item.id} className="flex items-center gap-2.5 border-b border-hair py-2 last:border-0">
            <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-tint font-num text-[11.5px] font-extrabold text-gold-deep">
              {index + 1}
            </span>

            <div className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-extrabold text-ink">{item.name}</span>
              <span className="block font-num text-[11px] font-bold text-muted" dir="ltr">
                {num(item.ratingCount)} تقييم
              </span>
            </div>

            <span
              className={cx('shrink-0 font-num text-[13px] font-extrabold', low ? 'text-bad-deep' : 'text-ink')}
              dir="ltr"
            >
              {item.rating.toFixed(1)}★
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ────────────────────────────────────────────────────────────
// كل التقييمات — جدول مربوط بـ GET /quality/reviews بفلاتر
// ────────────────────────────────────────────────────────────

function ReviewsSection({ range }: { range: Range }) {
  const [stars, setStars] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [hasComment, setHasComment] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // البحث بيتبعت للسيرفر (تعليق أو رقم طلب) — بنأخّره ٣٥٠ms
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const params = useMemo(
    () => ({
      range,
      // «المنخفضة فقط» بتغلب فلتر النجمة المحددة (السيرفر بيفضّل stars على maxStars)
      ...(lowOnly ? { maxStars: 3 } : stars ? { stars: Number(stars) } : {}),
      ...(hasComment ? { hasComment: true } : {}),
      ...(search ? { search } : {}),
    }),
    [range, lowOnly, stars, hasComment, search],
  );

  const reviews = useQuery({
    queryKey: ['quality', 'reviews', params],
    queryFn: () => get<QualityReview[]>('/quality/reviews', params),
  });

  const rows = reviews.data ?? [];
  const filtered = lowOnly || Boolean(stars) || hasComment || Boolean(search);

  return (
    <Card padding="none" className="flex flex-col">
      <div className="shrink-0 p-[14px] pb-0">
        <SectionTitle aside={`${num(rows.length)} نتيجة · أحدث ١٠٠`}>كل التقييمات</SectionTitle>

        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          <Select
            value={stars}
            onChange={setStars}
            options={STAR_OPTIONS}
            placeholder="كل النجوم"
            disabled={lowOnly}
            title="فلترة حسب عدد نجوم المطعم"
          />
          <Toggle checked={lowOnly} onChange={setLowOnly} label="المنخفضة فقط (≤٣)" />
          <Toggle checked={hasComment} onChange={setHasComment} label="عليها تعليق فقط" />
          <SearchInput
            value={searchInput}
            onChange={setSearchInput}
            placeholder="⌕ تعليق / رقم طلب…"
            width={220}
            className="ms-auto"
          />
        </div>
      </div>

      <div className="flex flex-col p-[14px] pt-0">
        <Table gridTemplateColumns="0.9fr 1.1fr 1fr 1fr 0.8fr 0.8fr 1.9fr 0.9fr">
          <THead>
            <TH>رقم الطلب</TH>
            <TH>الفرع</TH>
            <TH>الكابتن</TH>
            <TH>العميل</TH>
            <TH align="center">تقييم المطعم</TH>
            <TH align="center">تقييم الكابتن</TH>
            <TH>التعليق</TH>
            <TH align="end">الوقت</TH>
          </THead>

          {reviews.isPending ? (
            <Loading rows={8} height={44} className="mt-2" />
          ) : reviews.isError ? (
            <ErrorState message={reviews.error.message} onRetry={() => void reviews.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon="⭐"
              title={filtered ? 'مافيش نتائج للفلتر ده' : 'مافيش تقييمات'}
              description={filtered ? 'غيّر الفلاتر أو البحث.' : 'أول ما العملاء يقيّموا الطلبات هتظهر هنا.'}
            />
          ) : (
            rows.map((r) => (
              <TR key={r.id} danger={r.restaurantStars <= 2}>
                <TD numeric>#{r.orderNumber}</TD>
                <TD className={r.branch ? undefined : 'text-faint'}>{r.branch ?? DASH}</TD>
                <TD className={r.captain ? undefined : 'text-faint'}>{r.captain ?? DASH}</TD>
                <TD>{r.customer}</TD>
                <TD align="center">
                  <StarTag stars={r.restaurantStars} />
                </TD>
                <TD align="center">
                  <StarTag stars={r.captainStars} />
                </TD>
                <TD className={r.comment ? undefined : 'text-faint'}>{r.comment ?? DASH}</TD>
                <TD align="end">
                  <span className="text-[11px] font-bold text-muted">{relativeAr(r.createdAt)}</span>
                </TD>
              </TR>
            ))
          )}
        </Table>
      </div>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// وسم النجوم — أحمر للمنخفض، ذهبي للمتوسط، أسود للعالي
// ────────────────────────────────────────────────────────────

function StarTag({ stars }: { stars: number | null }) {
  if (stars === null) {
    return (
      <span className="font-num font-bold text-faint" dir="ltr">
        {DASH}
      </span>
    );
  }

  const tone = stars <= 2 ? 'text-bad-deep' : stars === 3 ? 'text-gold-deep' : 'text-ink';

  return (
    <span className={cx('font-num font-extrabold', tone)} dir="ltr">
      {stars}★
    </span>
  );
}
