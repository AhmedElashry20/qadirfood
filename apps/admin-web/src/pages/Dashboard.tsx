// مركز التحكم اللحظي — كل رقم حقيقي من الـ API، والتحديث لايف من غرفة admin
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
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
  Money,
  Pill,
  SectionTitle,
  Skeleton,
  StatusDot,
  cx,
  type Tone,
} from '../components/ui';
import { get } from '../lib/api';
import { DASH, money, num, pct, relativeAr, sar } from '../lib/format';
import { EV, getSocket, useSocketEvent } from '../lib/socket';

// ────────────────────────────────────────────────────────────
// أشكال الـ API الحقيقية — متأكّد منها بـ curl على /api
// ────────────────────────────────────────────────────────────

/** GET /reports/platform — reports.service.ts#platformReport */
interface PlatformReport {
  range: { from: string; to: string };
  orderCount: number;
  deliveredCount: number;
  gmv: number;
  netGmv: number;
  refundedTotal: number;
  revenue: number;
  commissionReversed: number;
  netRevenue: number;
  restaurantDues: number;
  captainCost: number;
  netMargin: number;
  activeCaptains: number;
  activeBranches: number;
}

/** GET /reports/analytics — reports.service.ts#analytics */
interface Analytics {
  range: { from: string; to: string };
  kpis: {
    totalOrders: number;
    deliveredOrders: number;
    cancelledOrders: number;
    completionRate: number;
    cancellationRate: number;
    avgOrderValue: number;
    newCustomers: number;
    avgRestaurantRating: number | null;
    avgCaptainRating: number | null;
    reviewCount: number;
  };
  funnel: Array<{ stage: string; count: number }>;
  statusBreakdown: Array<{ status: string; count: number }>;
  paymentMix: Array<{ method: string; count: number; total: number }>;
  ordersByHour: Array<{ hour: number; orders: number }>;
  topBranches: Array<{ branchId: string; nameAr: string; restaurantAr: string; orders: number; revenue: number }>;
  topItems: Array<{ menuItemId: string; nameAr: string; quantity: number; revenue: number }>;
}

/** GET /reports/timeseries — reports.service.ts#timeseries */
interface Timeseries {
  range: { from: string; to: string };
  bucket: 'hour' | 'day';
  points: Array<{ bucket: string; orders: number; delivered: number; gmv: number; revenue: number }>;
}

/** GET /orders — بذرة الـ feed لما مافيش أحداث لايف لسه */
interface FeedOrder {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  placedAt: string;
  branch: { id: string; nameAr: string };
}

interface OrdersPage {
  data: FeedOrder[];
  total: number;
  page: number;
  pageSize: number;
}

// حمولات السوكيت لغرفة admin — tracking.gateway.ts
interface OrderNewPayload {
  orderId: string;
  orderNumber: string;
  branchId: string;
  total: number;
  itemCount: number;
  placedAt: string;
}

interface OrderStatusPayload {
  orderId: string;
  status: string;
  changedAt: string;
}

interface AdminAlertPayload {
  type?: string;
  branchId?: string;
  message?: string;
  at?: string;
}

// ────────────────────────────────────────────────────────────
// ثوابت العرض
// ────────────────────────────────────────────────────────────

type Range = 'today' | 'week' | 'month';

const RANGES: Array<{ value: Range; label: string; unit: string }> = [
  { value: 'today', label: 'اليوم', unit: 'اليوم' },
  { value: 'week', label: 'الأسبوع', unit: 'الأسبوع' },
  { value: 'month', label: 'الشهر', unit: 'الشهر' },
];

/** ألوان النظام كقيم حرفية — recharts محتاج hex مش كلاسات Tailwind. */
const C = {
  brand: '#FFD200',
  brandDeep: '#E8C400',
  ink: '#1C1C1C',
  ok: '#0BA55B',
  bad: '#E23E3E',
  gold: '#B89A00',
  goldDeep: '#8A7500',
  bar: '#EDE9DC',
  grid: '#EFEDE5',
  muted: '#8A8A8A',
  head: '#8A8368',
} as const;

/** أسماء الحالات بالعربي + اللون — نفس منطق باقي اللوحة. */
const STATUS_AR: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: 'بانتظار القبول', tone: 'warn' },
  ACCEPTED: { label: 'اتقبل', tone: 'brand' },
  PREPARING: { label: 'بيتجهّز', tone: 'brand' },
  READY: { label: 'جاهز', tone: 'brand' },
  CAPTAIN_ASSIGNED: { label: 'اتسند لكابتن', tone: 'brand' },
  PICKED_UP: { label: 'اتستلم من المطعم', tone: 'brand' },
  ON_THE_WAY: { label: 'في الطريق', tone: 'brand' },
  DELIVERED: { label: 'اتسلّم', tone: 'ok' },
  REJECTED: { label: 'مرفوض', tone: 'bad' },
  CANCELLED: { label: 'ملغي', tone: 'bad' },
};

function statusMeta(status: string): { label: string; tone: Tone } {
  return STATUS_AR[status] ?? { label: status, tone: 'neutral' };
}

/** طرق الدفع بالعربي + لون ثابت لكل طريقة عشان الدونات ما يتلخبطش. */
const PAYMENT_AR: Record<string, string> = {
  CASH: 'نقدي',
  MADA: 'مدى',
  APPLE_PAY: 'أبل باي',
  CARD: 'بطاقة',
  WALLET: 'محفظة',
};

const PAYMENT_COLOR: Record<string, string> = {
  CASH: C.ok,
  MADA: C.ink,
  APPLE_PAY: C.head,
  CARD: C.gold,
  WALLET: C.brand,
};

const FUNNEL_COLORS = [C.brand, C.brandDeep, C.gold, C.goldDeep];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** تسمية عمود السلسلة الزمنية حسب نوع التجميع. */
function bucketLabel(bucket: string, kind: 'hour' | 'day'): string {
  const d = new Date(bucket);
  if (Number.isNaN(d.getTime())) return bucket;
  if (kind === 'hour') return `${pad2(d.getHours())}:00`;
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

// ────────────────────────────────────────────────────────────
// الصفحة
// ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [range, setRange] = useState<Range>('today');
  const unit = RANGES.find((r) => r.value === range)?.unit ?? 'اليوم';

  // ── الاستعلامات — كلها تحت مفتاح 'dash' عشان نبطّلها كتلة واحدة ──
  const platform = useQuery({
    queryKey: ['dash', 'platform', range],
    queryFn: () => get<PlatformReport>('/reports/platform', { range }),
  });

  const analytics = useQuery({
    queryKey: ['dash', 'analytics', range],
    queryFn: () => get<Analytics>('/reports/analytics', { range }),
  });

  const series = useQuery({
    queryKey: ['dash', 'timeseries', range],
    queryFn: () => get<Timeseries>('/reports/timeseries', { range }),
  });

  /** آخر الطلبات — بذرة الـ feed عشان ما يفضلش فاضي، ومصدر أسماء الفروع/الأرقام. */
  const recent = useQuery({
    queryKey: ['dash', 'orders'],
    queryFn: () => get<OrdersPage>('/orders', { pageSize: 8 }),
  });

  // ── الحالة اللحظية ──
  const [liveOrders, setLiveOrders] = useState<number | null>(null);
  const [pulse, setPulse] = useState(0); // بيتزوّد مع كل طلب جديد → فلاش على البطاقة
  const [liveFeed, setLiveFeed] = useState<FeedItem[]>([]);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // العدّاد المتفائل بيتزامن مع رقم السيرفر كل ما يجي refetch جديد
  const serverOrders = platform.data?.orderCount ?? null;
  useEffect(() => {
    if (serverOrders !== null) setLiveOrders(serverOrders);
  }, [serverOrders]);

  // خريطة orderId → رقم/فرع عشان نكمّل حمولة status_changed (اللي مافيهاش رقم)
  const ordersRef = useRef<FeedOrder[]>([]);
  ordersRef.current = recent.data?.data ?? [];

  // refetch مخنوق — مرة كل ~٤ ثواني على الأكتر مهما جت أحداث
  const refetchTimer = useRef<number | undefined>(undefined);
  const debouncedRefetch = useCallback(() => {
    if (refetchTimer.current) return;
    refetchTimer.current = window.setTimeout(() => {
      refetchTimer.current = undefined;
      void queryClient.invalidateQueries({ queryKey: ['dash'] });
    }, 4000);
  }, [queryClient]);

  useEffect(() => () => window.clearTimeout(refetchTimer.current), []);

  // ── وصل الأحداث بالتأثيرات ──

  // طلب جديد: نطبّق زيادة متفائلة + فلاش + نضيفه للـ feed + refetch مخنوق
  useSocketEvent<OrderNewPayload>(EV.ORDER_NEW, (p) => {
    setLiveOrders((n) => (n ?? 0) + 1);
    setPulse((n) => n + 1);
    const branchName = ordersRef.current.find((o) => o.branch.id === p.branchId)?.branch.nameAr;
    setLiveFeed((feed) =>
      [
        {
          key: `new-${p.orderId}-${p.placedAt}`,
          orderId: p.orderId,
          kind: 'new' as const,
          orderNumber: p.orderNumber,
          status: 'PENDING',
          total: p.total,
          branchName,
          at: p.placedAt,
        },
        ...feed,
      ].slice(0, 16),
    );
    debouncedRefetch();
  });

  // تغيّر حالة: نكمّل الرقم من الطلبات المحمّلة + نضيفه للـ feed + refetch مخنوق
  useSocketEvent<OrderStatusPayload>(EV.ORDER_STATUS_CHANGED, (p) => {
    const known = ordersRef.current.find((o) => o.id === p.orderId);
    setLiveFeed((feed) =>
      [
        {
          key: `st-${p.orderId}-${p.changedAt}`,
          orderId: p.orderId,
          kind: 'status' as const,
          orderNumber: known?.orderNumber,
          status: p.status,
          branchName: known?.branch.nameAr,
          at: p.changedAt,
        },
        ...feed,
      ].slice(0, 16),
    );
    debouncedRefetch();
  });

  // تنبيه إداري: toast عائم + إزالة تلقائية
  useSocketEvent<AdminAlertPayload>(EV.ADMIN_ALERT, (p) => {
    const id = `${p.type ?? 'ALERT'}-${p.at ?? Date.now()}`;
    const title = p.type === 'BRANCH_OFFLINE' ? 'فرع فقد الاتصال' : (p.message ?? 'تنبيه من المنصة');
    const detail = p.branchId ? `الفرع ${p.branchId}` : p.message && p.type ? p.type : undefined;
    setToasts((list) => [{ id, tone: 'bad' as Tone, title, detail }, ...list].slice(0, 4));
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 6500);
  });

  const dismissToast = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  // ── الـ feed المعروض = أحداث لايف فوق + بذرة آخر الطلبات (من غير تكرار) ──
  const feed = useMemo<FeedItem[]>(() => {
    const liveIds = new Set(liveFeed.map((f) => f.orderId));
    const seed: FeedItem[] = (recent.data?.data ?? [])
      .filter((o) => !liveIds.has(o.id))
      .map((o) => ({
        key: `seed-${o.id}`,
        orderId: o.id,
        kind: 'seed' as const,
        orderNumber: o.orderNumber,
        status: o.status,
        total: o.total,
        branchName: o.branch.nameAr,
        at: o.placedAt,
      }));
    return [...liveFeed, ...seed].slice(0, 16);
  }, [liveFeed, recent.data]);

  // آخر تحديث + مؤشر الجلب
  const isFetching = platform.isFetching || analytics.isFetching || series.isFetching;
  const lastUpdated = Math.max(platform.dataUpdatedAt, analytics.dataUpdatedAt, series.dataUpdatedAt);

  const retryAll = useCallback(() => {
    void platform.refetch();
    void analytics.refetch();
    void series.refetch();
  }, [platform, analytics, series]);

  const k = analytics.data?.kpis;

  return (
    <>
      <style>{KEYFRAMES}</style>

      <TopBar
        title="مركز التحكم"
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
          <div className="flex items-center gap-3">
            <LivePill />
            <span className="whitespace-nowrap text-[11.5px] font-bold text-muted">
              {isFetching ? 'جارِ التحديث…' : lastUpdated ? `آخر تحديث ${relativeAr(new Date(lastUpdated))}` : DASH}
            </span>
          </div>
        }
      />

      <PageBody>
        {/* ── صف المؤشرات ── */}
        {platform.isError || analytics.isError ? (
          <Card>
            <ErrorState message={(platform.error ?? analytics.error)?.message} onRetry={retryAll} />
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <LiveOrdersCard label={`طلبات ${unit}`} value={liveOrders} pulse={pulse} note={`${num(platform.data?.deliveredCount ?? undefined)} مسلّم`} loading={platform.isPending} />

            <HeroKpi
              label="إجمالي المبيعات (GMV)"
              loading={platform.isPending}
              value={<Money value={platform.data?.gmv} size="xl" />}
              note={`صافي ${sar(platform.data?.netGmv)}`}
            />

            <HeroKpi
              label="صافي الإيراد"
              loading={platform.isPending}
              value={<Money value={platform.data?.netRevenue} size="xl" />}
              note={`هامش صافي ${sar(platform.data?.netMargin)}`}
            />

            <HeroKpi
              label="كباتن أونلاين"
              loading={platform.isPending}
              value={<span className="font-num">{num(platform.data?.activeCaptains ?? undefined)}</span>}
              note={`${num(platform.data?.activeBranches ?? undefined)} مطعم مفتوح دلوقتي`}
            />

            <HeroKpi
              label="نسبة الإتمام"
              loading={analytics.isPending}
              value={<span className="font-num">{k ? pct(k.completionRate) : DASH}</span>}
              note={k ? `${num(k.deliveredOrders)} مسلّم من ${num(k.totalOrders)}` : undefined}
            />

            <HeroKpi
              label="متوسط قيمة الطلب"
              loading={analytics.isPending}
              value={<Money value={k?.avgOrderValue} size="xl" />}
              note={k ? `على ${num(k.totalOrders)} طلب` : undefined}
            />

            <HeroKpi
              label="متوسط تقييم المطاعم"
              loading={analytics.isPending}
              value={
                k && k.avgRestaurantRating !== null ? (
                  <span className="inline-flex items-baseline gap-1 font-num">
                    {k.avgRestaurantRating.toFixed(1)}
                    <span className="text-[16px] text-brand">★</span>
                  </span>
                ) : (
                  <span className="font-num text-faint">{DASH}</span>
                )
              }
              note={k && k.reviewCount > 0 ? `من ${num(k.reviewCount)} تقييم` : 'مافيش تقييمات في الفترة'}
            />

            <HeroKpi
              label="عملاء جدد"
              loading={analytics.isPending}
              value={<span className="font-num">{k ? num(k.newCustomers) : DASH}</span>}
              note="أول طلب ليهم في الفترة"
            />
          </div>
        )}

        {/* ── الرسم الرئيسي + الـ feed اللحظي ── */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Card className="flex flex-col lg:col-span-2" padding="lg">
            <SectionTitle
              aside={
                <div className="flex items-center gap-3">
                  <LegendDot color={C.brand}>الطلبات</LegendDot>
                  <LegendDot color={C.ink}>GMV</LegendDot>
                </div>
              }
            >
              حركة {unit}
            </SectionTitle>
            <MainChart query={series} />
          </Card>

          <Card className="flex min-h-0 flex-col" padding="lg">
            <SectionTitle aside={<StatusDot tone="ok" className="text-[11px] font-extrabold text-ok">لايف</StatusDot>}>
              النشاط اللحظي
            </SectionTitle>
            <ActivityFeed feed={feed} loading={recent.isPending} error={recent.error} onRetry={() => void recent.refetch()} />
          </Card>
        </div>

        {/* ── القمع + الذروة + الدفع ── */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Card padding="lg">
            <SectionTitle aside="نسبة التحويل بين المراحل">قمع الطلبات</SectionTitle>
            <FunnelBars query={analytics} />
          </Card>

          <Card className="flex flex-col" padding="lg">
            <SectionTitle aside="الطلبات على مدار اليوم">ساعات الذروة</SectionTitle>
            <PeakHours query={analytics} />
          </Card>

          <Card padding="lg">
            <SectionTitle aside="توزيع طرق الدفع">مزيج الدفع</SectionTitle>
            <PaymentDonut query={analytics} />
          </Card>
        </div>

        {/* ── أفضل المطاعم + أفضل الأصناف ── */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Card padding="lg">
            <SectionTitle aside={`أعلى ${unit} إيراداً`}>🏆 أفضل المطاعم</SectionTitle>
            <TopBranches query={analytics} />
          </Card>

          <Card padding="lg">
            <SectionTitle aside="الأكثر مبيعاً بالكمية">🍽 أفضل الأصناف</SectionTitle>
            <TopItems query={analytics} />
          </Card>
        </div>
      </PageBody>

      <Toasts toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}

// ────────────────────────────────────────────────────────────
// أنواع مساعدة
// ────────────────────────────────────────────────────────────

interface FeedItem {
  key: string;
  orderId: string;
  kind: 'new' | 'status' | 'seed';
  orderNumber?: string;
  status?: string;
  total?: number;
  branchName?: string;
  at: string;
}

interface ToastItem {
  id: string;
  tone: Tone;
  title: string;
  detail?: string;
}

// ────────────────────────────────────────────────────────────
// مؤشر الاتصال «● مباشر»
// ────────────────────────────────────────────────────────────

function LivePill() {
  const [connected, setConnected] = useState(() => getSocket()?.connected ?? false);
  useSocketEvent('connect', () => setConnected(true));
  useSocketEvent('disconnect', () => setConnected(false));
  useEffect(() => {
    setConnected(getSocket()?.connected ?? false);
  }, []);

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-[3px] text-[11.5px] font-extrabold',
        connected ? 'border-ok/30 bg-ok-tint text-ok' : 'border-line bg-chip text-muted',
      )}
    >
      <span className="relative flex h-[7px] w-[7px]">
        {connected ? (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok-bright opacity-75" />
        ) : null}
        <span className={cx('relative inline-flex h-[7px] w-[7px] rounded-full', connected ? 'bg-ok-bright' : 'bg-muted')} />
      </span>
      {connected ? 'مباشر' : 'غير متصل'}
    </span>
  );
}

// ────────────────────────────────────────────────────────────
// بطاقات المؤشرات
// ────────────────────────────────────────────────────────────

/** بطاقة عادية مع حالة تحميل. */
function HeroKpi({ label, value, note, loading }: { label: string; value: ReactNode; note?: string; loading?: boolean }) {
  if (loading) {
    return (
      <Card className="h-[104px]">
        <Skeleton height={12} className="w-1/2" />
        <Skeleton height={26} className="mt-3 w-2/3" />
      </Card>
    );
  }
  return <KpiCard label={label} value={value} note={note} />;
}

/** بطاقة الطلبات الحيّة — سوداء، رقم متحرّك، وفلاش مع كل طلب جديد. */
function LiveOrdersCard({
  label,
  value,
  pulse,
  note,
  loading,
}: {
  label: string;
  value: number | null;
  pulse: number;
  note: string;
  loading?: boolean;
}) {
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (pulse === 0) return;
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 750);
    return () => window.clearTimeout(t);
  }, [pulse]);

  if (loading && value === null) {
    return (
      <Card inverted className="h-[104px]">
        <Skeleton height={12} className="w-1/2" />
        <Skeleton height={26} className="mt-3 w-2/3" />
      </Card>
    );
  }

  return (
    <KpiCard
      inverted
      label={label}
      className={cx('rounded-card', flash && 'dash-flash')}
      badge={
        <StatusDot tone="ok" className="text-[10px] font-extrabold text-ok-bright">
          لايف
        </StatusDot>
      }
      value={<AnimatedNumber value={value} />}
      note={note}
    />
  );
}

/** رقم بيعدّ لهدفه بسلاسة (easeOutCubic) بدل ما ينطّ. */
function AnimatedNumber({ value }: { value: number | null }) {
  // بيبدأ من صفر عشان يعمل count-up أول ما القيمة الحقيقية تجي، وبعدين يتحرّك مع كل تغيير
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (value === null) return;
    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    const start = performance.now();
    const duration = 520;
    let raf = 0;

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(from + (to - from) * eased);
      setDisplay(current);
      fromRef.current = current;
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className="font-num tabular-nums">{num(display)}</span>;
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
// الرسم الرئيسي — طلبات (مساحة متدرّجة) + GMV (خط) بمحورين
// ────────────────────────────────────────────────────────────

function MainChart({ query }: { query: UseQueryResult<Timeseries> }) {
  if (query.isPending) return <Loading rows={1} height={280} />;
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;

  const ts = query.data;
  const points = ts?.points ?? [];

  if (points.length === 0) {
    return (
      <EmptyState
        icon="📈"
        title="مافيش طلبات في الفترة دي"
        description="الرسم بيتبني من السلسلة الزمنية الحقيقية — مافيش تعبئة بأرقام تقديرية."
      />
    );
  }

  const data = points.map((p) => ({
    label: bucketLabel(p.bucket, ts?.bucket ?? 'day'),
    orders: p.orders,
    delivered: p.delivered,
    gmv: p.gmv,
  }));

  return (
    <div className="h-[280px] w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 8, left: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="ordersFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.brand} stopOpacity={0.55} />
              <stop offset="100%" stopColor={C.brand} stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontFamily: 'Outfit', fontSize: 11, fill: C.muted }}
            tickLine={false}
            axisLine={{ stroke: C.grid }}
            minTickGap={12}
          />
          <YAxis
            yAxisId="orders"
            tick={{ fontFamily: 'Outfit', fontSize: 11, fill: C.muted }}
            tickLine={false}
            axisLine={false}
            width={30}
            allowDecimals={false}
          />
          <YAxis
            yAxisId="gmv"
            orientation="right"
            tick={{ fontFamily: 'Outfit', fontSize: 11, fill: C.head }}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v: number) => money(v)}
          />
          <Tooltip cursor={{ stroke: C.grid, strokeWidth: 1 }} content={<MainTooltip />} />
          <Area
            yAxisId="orders"
            type="monotone"
            dataKey="orders"
            name="الطلبات"
            stroke={C.brandDeep}
            strokeWidth={2.5}
            fill="url(#ordersFill)"
            dot={{ r: 2.5, fill: C.brandDeep, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
          <Line
            yAxisId="gmv"
            type="monotone"
            dataKey="gmv"
            name="GMV"
            stroke={C.ink}
            strokeWidth={2.5}
            dot={{ r: 2.5, fill: C.ink, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// حمولة recharts للتلميحات — الحقول اللي بنستعملها بس
interface TipItem {
  value?: number;
  name?: string;
  dataKey?: string | number;
  color?: string;
  payload?: Record<string, unknown>;
}
interface TipProps {
  active?: boolean;
  payload?: TipItem[];
  label?: string | number;
}

function TipShell({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-line bg-surface px-3 py-2 shadow-float" dir="rtl">
      <p className="mb-1 text-[11px] font-black text-ink">{title}</p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function TipRow({ color, label, value }: { color: string; label: string; value: string }) {
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

function MainTooltip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as { orders?: number; delivered?: number; gmv?: number } | undefined;
  return (
    <TipShell title={<span className="font-num" dir="ltr">{label}</span>}>
      <TipRow color={C.brand} label="الطلبات" value={num(row?.orders)} />
      <TipRow color={C.ok} label="المسلّم" value={num(row?.delivered)} />
      <TipRow color={C.ink} label="GMV" value={sar(row?.gmv)} />
    </TipShell>
  );
}

// ────────────────────────────────────────────────────────────
// قمع الطلبات — أعمدة متناقصة + نسبة التحويل بين المراحل
// ────────────────────────────────────────────────────────────

function FunnelBars({ query }: { query: UseQueryResult<Analytics> }) {
  if (query.isPending) return <Loading rows={4} height={40} />;
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;

  const funnel = query.data?.funnel ?? [];
  const top = funnel[0]?.count ?? 0;

  if (top === 0) return <EmptyState icon="🫗" title="مافيش طلبات في الفترة" />;

  return (
    <ul className="flex flex-col gap-3">
      {funnel.map((stage, i) => {
        const width = Math.max((stage.count / top) * 100, stage.count > 0 ? 6 : 2);
        const prev = i > 0 ? funnel[i - 1]?.count ?? 0 : 0;
        const conversion = i > 0 && prev > 0 ? (stage.count / prev) * 100 : null;
        return (
          <li key={stage.stage}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-[12.5px] font-extrabold text-ink">{stage.stage}</span>
              <span className="flex items-center gap-2">
                {conversion !== null ? (
                  <span className="rounded-pill bg-chip px-1.5 font-num text-[10.5px] font-extrabold text-label" dir="ltr">
                    {pct(conversion, 0)}
                  </span>
                ) : null}
                <span className="font-num text-[13px] font-extrabold text-ink" dir="ltr">
                  {num(stage.count)}
                </span>
              </span>
            </div>
            <div className="h-[12px] w-full overflow-hidden rounded-pill bg-soft">
              <div
                className="h-full rounded-pill transition-all"
                style={{ width: `${width}%`, backgroundColor: FUNNEL_COLORS[i] ?? C.gold }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ────────────────────────────────────────────────────────────
// ساعات الذروة — ٢٤ عمود، الأعلى بلون brand
// ────────────────────────────────────────────────────────────

function PeakHours({ query }: { query: UseQueryResult<Analytics> }) {
  if (query.isPending) return <Loading rows={1} height={200} />;
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;

  const hours = query.data?.ordersByHour ?? [];
  const peak = hours.reduce((m, h) => Math.max(m, h.orders), 0);
  const total = hours.reduce((s, h) => s + h.orders, 0);

  if (total === 0) return <EmptyState icon="🕒" title="مافيش طلبات في الفترة" />;

  const peakHour = hours.find((h) => h.orders === peak)?.hour ?? null;

  return (
    <div className="flex flex-1 flex-col">
      <div className="h-[200px] w-full" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={hours} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} barCategoryGap={2}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis
              dataKey="hour"
              tick={{ fontFamily: 'Outfit', fontSize: 10, fill: C.muted }}
              tickLine={false}
              axisLine={{ stroke: C.grid }}
              interval={2}
              tickFormatter={(h: number) => pad2(h)}
            />
            <YAxis
              tick={{ fontFamily: 'Outfit', fontSize: 10, fill: C.muted }}
              tickLine={false}
              axisLine={false}
              width={24}
              allowDecimals={false}
            />
            <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={<HourTooltip />} />
            <Bar dataKey="orders" radius={[4, 4, 0, 0]}>
              {hours.map((h) => (
                <Cell key={h.hour} fill={h.orders === peak && peak > 0 ? C.brand : C.bar} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-center text-[11.5px] font-bold text-muted">
        {peakHour !== null ? (
          <>
            الذروة الساعة{' '}
            <span className="font-num font-extrabold text-ink" dir="ltr">
              {pad2(peakHour)}:00
            </span>{' '}
            بـ <span className="font-num font-extrabold text-ink">{num(peak)}</span> طلب
          </>
        ) : null}
      </p>
    </div>
  );
}

function HourTooltip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <TipShell title={<span className="font-num" dir="ltr">{pad2(Number(label))}:00</span>}>
      <TipRow color={C.brand} label="الطلبات" value={num(payload[0]?.value)} />
    </TipShell>
  );
}

// ────────────────────────────────────────────────────────────
// مزيج الدفع — دونات + مفتاح بالنِّسَب
// ────────────────────────────────────────────────────────────

function PaymentDonut({ query }: { query: UseQueryResult<Analytics> }) {
  if (query.isPending) return <Loading rows={4} height={30} />;
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;

  const mix = query.data?.paymentMix ?? [];
  const totalCount = mix.reduce((s, m) => s + m.count, 0);

  if (totalCount === 0) return <EmptyState icon="💳" title="مافيش مدفوعات في الفترة" />;

  const data = mix.map((m) => ({
    method: m.method,
    label: PAYMENT_AR[m.method] ?? m.method,
    color: PAYMENT_COLOR[m.method] ?? C.muted,
    count: m.count,
    total: m.total,
  }));

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-[150px] w-[150px] shrink-0" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={70}
              paddingAngle={data.length > 1 ? 2 : 0}
              stroke="none"
            >
              {data.map((d) => (
                <Cell key={d.method} fill={d.color} />
              ))}
            </Pie>
            <Tooltip content={<PaymentTooltip totalCount={totalCount} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-num text-[20px] font-extrabold leading-none text-ink">{num(totalCount)}</span>
          <span className="text-[10px] font-bold text-muted">عملية دفع</span>
        </div>
      </div>

      <ul className="flex min-w-0 flex-1 flex-col gap-2">
        {data.map((d) => (
          <li key={d.method} className="flex items-center gap-2">
            <span className="h-[9px] w-[9px] shrink-0 rounded-full" style={{ backgroundColor: d.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[12px] font-extrabold text-ink">{d.label}</span>
            <span className="font-num text-[11px] font-bold text-muted" dir="ltr">
              {pct((d.count / totalCount) * 100, 0)}
            </span>
            <span className="w-[62px] text-end">
              <Money value={d.total} size="sm" hideCurrency />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PaymentTooltip({ active, payload, totalCount }: TipProps & { totalCount: number }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as { label?: string; color?: string; count?: number; total?: number } | undefined;
  if (!d) return null;
  return (
    <TipShell title={d.label ?? DASH}>
      <TipRow color={d.color ?? C.muted} label="عدد العمليات" value={`${num(d.count)} · ${pct(((d.count ?? 0) / totalCount) * 100, 0)}`} />
      <TipRow color={d.color ?? C.muted} label="الإجمالي" value={sar(d.total)} />
    </TipShell>
  );
}

// ────────────────────────────────────────────────────────────
// أفضل المطاعم — أعمدة أفقية بالإيراد
// ────────────────────────────────────────────────────────────

function TopBranches({ query }: { query: UseQueryResult<Analytics> }) {
  if (query.isPending) return <Loading rows={4} height={40} />;
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;

  const branches = query.data?.topBranches ?? [];
  if (branches.length === 0) return <EmptyState icon="🍔" title="مافيش طلبات مسلّمة في الفترة" />;

  const max = Math.max(...branches.map((b) => b.revenue), 0);

  return (
    <ol className="flex flex-col gap-3">
      {branches.map((b, i) => {
        const width = max > 0 ? Math.max((b.revenue / max) * 100, 4) : 4;
        return (
          <li key={b.branchId} className="flex items-center gap-2.5">
            <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-tint font-num text-[11.5px] font-extrabold text-gold-deep">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-[12.5px] font-extrabold text-ink">{b.nameAr}</span>
                <span className="shrink-0 text-ink">
                  <Money value={b.revenue} size="sm" hideCurrency />
                </span>
              </div>
              <div className="h-[7px] w-full overflow-hidden rounded-pill bg-soft">
                <div className="h-full rounded-pill bg-brand transition-all" style={{ width: `${width}%` }} />
              </div>
              <span className="mt-0.5 block truncate text-[10.5px] font-bold text-muted">
                {b.restaurantAr} · <span className="font-num" dir="ltr">{num(b.orders)}</span> طلب
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ────────────────────────────────────────────────────────────
// أفضل الأصناف — قائمة مرتّبة بالكمية + الإيراد
// ────────────────────────────────────────────────────────────

function TopItems({ query }: { query: UseQueryResult<Analytics> }) {
  if (query.isPending) return <Loading rows={4} height={34} />;
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;

  const items = query.data?.topItems ?? [];
  if (items.length === 0) return <EmptyState icon="🍽" title="مافيش أصناف مباعة في الفترة" />;

  return (
    <ol className="flex flex-col">
      {items.map((it, i) => (
        <li key={it.menuItemId} className="flex items-center gap-2.5 border-b border-hair py-2 last:border-0">
          <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-tint font-num text-[11.5px] font-extrabold text-gold-deep">
            {i + 1}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-extrabold text-ink">{it.nameAr}</span>
          <span className="shrink-0 rounded-pill bg-chip px-2 py-px font-num text-[11px] font-extrabold text-label" dir="ltr">
            ×{num(it.quantity)}
          </span>
          <span className="w-[64px] shrink-0 text-end text-ink">
            <Money value={it.revenue} size="sm" hideCurrency />
          </span>
        </li>
      ))}
    </ol>
  );
}

// ────────────────────────────────────────────────────────────
// النشاط اللحظي — بيبثّ order:new / status_changed، وبذرة لما يبقى فاضي
// ────────────────────────────────────────────────────────────

function ActivityFeed({
  feed,
  loading,
  error,
  onRetry,
}: {
  feed: FeedItem[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  if (loading && feed.length === 0) return <Loading rows={5} height={52} />;
  if (error && feed.length === 0) return <ErrorState message={error.message} onRetry={onRetry} />;
  if (feed.length === 0) return <EmptyState icon="🛎" title="مستنيّين أول طلب" description="أول ما طلب يوصل هيظهر هنا فوراً." />;

  return (
    <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto pe-1" style={{ maxHeight: 320 }}>
      {feed.map((item) => {
        const meta = statusMeta(item.status ?? 'PENDING');
        const isLive = item.kind !== 'seed';
        return (
          <li
            key={item.key}
            className={cx(
              'dash-rise flex items-center gap-2.5 rounded-[10px] border px-2.5 py-2',
              isLive ? 'border-brand/30 bg-tint-soft' : 'border-hair bg-soft',
            )}
          >
            <span className="text-[15px] leading-none" aria-hidden>
              {item.kind === 'new' ? '🆕' : item.status === 'DELIVERED' ? '✅' : item.status === 'REJECTED' || item.status === 'CANCELLED' ? '⛔' : '🔔'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-num text-[12px] font-extrabold text-ink" dir="ltr">
                  {item.orderNumber ? `#${item.orderNumber}` : `#${item.orderId.slice(0, 6)}`}
                </span>
                <span className="shrink-0 text-[10px] font-bold text-faint">{relativeAr(item.at)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <Pill tone={meta.tone}>{item.kind === 'new' ? 'طلب جديد' : meta.label}</Pill>
                {typeof item.total === 'number' ? (
                  <Money value={item.total} size="sm" hideCurrency />
                ) : item.branchName ? (
                  <span className="min-w-0 truncate text-[10.5px] font-bold text-muted">{item.branchName}</span>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ────────────────────────────────────────────────────────────
// التنبيهات العائمة (admin:alert)
// ────────────────────────────────────────────────────────────

function Toasts({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 end-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="dash-rise pointer-events-auto flex w-[320px] items-start gap-2.5 rounded-panel border border-bad-line bg-surface p-3 shadow-float"
        >
          <span className="mt-0.5 text-[16px] leading-none" aria-hidden>
            ⚠️
          </span>
          <div className="min-w-0 flex-1">
            <StatusDot tone={t.tone} className="text-[12.5px] font-extrabold text-ink">
              {t.title}
            </StatusDot>
            {t.detail ? <p className="mt-0.5 truncate text-[11px] font-bold text-muted">{t.detail}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            aria-label="إغلاق"
            className="shrink-0 text-[13px] font-bold text-muted hover:text-ink"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// إطارات الحركة — مضمّنة عشان مانلمسش tailwind.config
// ────────────────────────────────────────────────────────────

const KEYFRAMES = `
@keyframes dashFlash {
  0% { box-shadow: 0 0 0 0 rgba(255,210,0,0.0); }
  30% { box-shadow: 0 0 0 4px rgba(255,210,0,0.6); }
  100% { box-shadow: 0 0 0 0 rgba(255,210,0,0.0); }
}
.dash-flash { animation: dashFlash 0.75s ease-out; }
@keyframes dashRise {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}
.dash-rise { animation: dashRise 0.35s ease-out; }
`;
