// المطاعم والفروع والعمولة والتفعيل
import { useMemo, useState, type ReactNode } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';

import { PageBody, TopBar } from '../components/Shell';
import {
  Card,
  Chip,
  Drawer,
  EmptyState,
  ErrorState,
  Loading,
  MissingDataNote,
  Money,
  Pill,
  SearchInput,
  SectionTitle,
  TD,
  TH,
  THead,
  TR,
  Table,
  cx,
  type Tone,
} from '../components/ui';
import { get } from '../lib/api';
import { DASH, durationAr, ltr, num } from '../lib/format';
import { EV, useSocketEvent } from '../lib/socket';

// ────────────────────────────────────────────────────────────
// أشكال الـ API
// ────────────────────────────────────────────────────────────

type BranchStatus = 'OPEN' | 'BUSY' | 'PAUSED' | 'CLOSED';

interface BranchStatusMeta {
  label: string;
  tone: Tone;
}

const BRANCH_STATUS: Record<BranchStatus, BranchStatusMeta> = {
  OPEN: { label: '● مفتوح', tone: 'ok' },
  BUSY: { label: '● مشغول', tone: 'warn' },
  PAUSED: { label: '● موقوف مؤقتاً', tone: 'warn' },
  CLOSED: { label: '● مغلق', tone: 'bad' },
};

interface OrderRow {
  id: string;
  branch: { id: string; nameAr: string };
}

interface OrdersPage {
  data: OrderRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** GET /restaurants/branches/:id — restaurants.service.ts#findBranch */
interface BranchDetail {
  id: string;
  restaurantId: string;
  nameAr: string;
  nameEn: string;
  city: string;
  address: string;
  status: BranchStatus;
  busyExtraMinutes: number;
  avgPrepMinutes: number;
  deliveryRadiusKm: number;
  deliveryFee: number;
  minOrderTotal: number;
  rating: number;
  ratingCount: number;
  isActive: boolean;
  lat?: number;
  lng?: number;
  restaurant: {
    id: string;
    nameAr: string;
    nameEn: string;
    cuisineAr: string | null;
    contactPhone: string | null;
    commissionRate: number | string;
    isActive: boolean;
  };
  workingHours: Array<{
    id: string;
    weekday: number;
    opensAt: string;
    closesAt: string;
    isClosed: boolean;
    isRamadan: boolean;
  }>;
}

/** ٠ = الأحد … ٦ = السبت (schema.prisma#WorkingHour). */
const WEEKDAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const PAGE_SIZE = 100;

// ────────────────────────────────────────────────────────────
// الصفحة
//
// لا يوجد endpoint أدمن بيرجّع المطاعم أو الفروع (app.module.ts مافيهوش أي
// مسار إداري للمطاعم؛ `/customer/branches` للعميل بس و`/restaurants/nearby`
// محتاج إحداثيات). فبنشتق الفروع المميّزة من الطلبات، وبنكمّل تفاصيل كل فرع
// من `GET /restaurants/branches/:id` — دي مفتوحة لأي دور مسجّل دخول.
// ────────────────────────────────────────────────────────────

export default function Restaurants() {
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const orders = useQuery({
    queryKey: ['orders', 'branches-roster', { pageSize: PAGE_SIZE }],
    queryFn: () => get<OrdersPage>('/orders', { pageSize: PAGE_SIZE }),
  });

  /** الفروع المميّزة + عدد الطلبات لكل فرع في العيّنة المحمّلة. */
  const derived = useMemo(() => {
    const map = new Map<string, { id: string; nameAr: string; orderCount: number }>();

    for (const row of orders.data?.data ?? []) {
      const branch = row.branch;
      if (!branch?.id) continue;

      const entry = map.get(branch.id);
      if (entry) {
        entry.orderCount += 1;
      } else {
        map.set(branch.id, { id: branch.id, nameAr: branch.nameAr, orderCount: 1 });
      }
    }

    return [...map.values()].sort((a, b) => b.orderCount - a.orderCount);
  }, [orders.data]);

  // استعلام مستقل لكل فرع — بيتنفّذوا بالتوازي
  const details = useQueries({
    queries: derived.map((branch) => ({
      queryKey: ['branch', branch.id],
      queryFn: () => get<BranchDetail>(`/restaurants/branches/${branch.id}`),
      staleTime: 60_000,
    })),
  });

  // الفرع بيغيّر حالته من تطبيق المطعم — الحدث بيوصل غرفة admin
  useSocketEvent(EV.BRANCH_STATUS_CHANGED, () => {
    for (const detail of details) void detail.refetch();
  });

  const rows = useMemo(() => {
    const merged = derived.map((branch, index) => ({
      ...branch,
      detail: details[index]?.data,
    }));

    const term = search.trim().toLowerCase();
    if (!term) return merged;

    return merged.filter(
      (row) =>
        row.nameAr.toLowerCase().includes(term) ||
        (row.detail?.restaurant?.nameAr ?? '').toLowerCase().includes(term) ||
        (row.detail?.city ?? '').toLowerCase().includes(term),
    );
  }, [derived, details, search]);

  const openDetail = openId ? details.find((detail) => detail.data?.id === openId)?.data : undefined;
  const detailsLoading = details.some((detail) => detail.isPending);

  return (
    <>
      <TopBar
        title="المطاعم"
        tabs={
          <Chip tone="neutral" count={derived.length}>
            فرع من الطلبات المحمّلة
          </Chip>
        }
        actions={<SearchInput value={search} onChange={setSearch} placeholder="⌕ مطعم / فرع / مدينة…" width={220} />}
      />

      <PageBody>
        <div className="flex flex-1 overflow-hidden">
          <Card padding="none" className="flex flex-1 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-hair p-[14px]">
              <MissingDataNote>
                العمولة، طلبات الانضمام، الإيقاف والتفعيل محتاجين endpoints للأدمن — المعروض هنا من الفروع الظاهرة في
                آخر {ltr(num(PAGE_SIZE))} طلب.
              </MissingDataNote>
            </div>

            <div className="flex flex-1 flex-col overflow-auto p-[14px]">
              <Table gridTemplateColumns="1.6fr 1fr 0.8fr 0.8fr 0.9fr 0.8fr">
                <THead>
                  <TH>المطعم</TH>
                  <TH>الفرع / المدينة</TH>
                  <TH align="end">التقييم</TH>
                  <TH align="end">طلبات (من المحمّل)</TH>
                  <TH align="end">رسوم التوصيل</TH>
                  <TH>الحالة</TH>
                </THead>

                {orders.isPending ? (
                  <Loading rows={8} height={44} className="mt-2" />
                ) : orders.isError ? (
                  <ErrorState message={orders.error.message} onRetry={() => void orders.refetch()} />
                ) : rows.length === 0 ? (
                  <EmptyState
                    icon="🍔"
                    title={search ? 'لا توجد نتائج للبحث' : 'لا توجد فروع في هذه العيّنة'}
                    description={`القائمة مشتقة من فروع آخر ${PAGE_SIZE} طلب — لا يوجد endpoint بيرجّع كل المطاعم.`}
                  />
                ) : (
                  rows.map((row) => {
                    const detail = row.detail;
                    const meta = detail ? BRANCH_STATUS[detail.status] : undefined;

                    return (
                      <TR key={row.id} onClick={detail ? () => setOpenId(row.id) : undefined}>
                        <TD>{detail?.restaurant?.nameAr ?? (detailsLoading ? '…' : DASH)}</TD>

                        <TD>
                          {row.nameAr}
                          {detail?.city ? <span className="text-muted"> · {detail.city}</span> : null}
                        </TD>

                        <TD align="end" numeric>
                          {detail ? (
                            <>
                              {detail.rating}★ <span className="text-faint">· {num(detail.ratingCount)}</span>
                            </>
                          ) : (
                            DASH
                          )}
                        </TD>

                        <TD align="end" numeric>
                          {num(row.orderCount)}
                        </TD>

                        <TD align="end">
                          <Money value={detail?.deliveryFee} size="sm" hideCurrency />
                        </TD>

                        <TD>
                          {meta ? <Pill tone={meta.tone}>{meta.label}</Pill> : <span className="text-faint">{DASH}</span>}
                        </TD>
                      </TR>
                    );
                  })
                )}
              </Table>
            </div>
          </Card>
        </div>
      </PageBody>

      <BranchDrawer branch={openDetail} onClose={() => setOpenId(null)} />
    </>
  );
}

// ────────────────────────────────────────────────────────────
// لوح الفرع
// ────────────────────────────────────────────────────────────

interface BranchDrawerProps {
  branch?: BranchDetail;
  onClose: () => void;
}

function BranchDrawer({ branch, onClose }: BranchDrawerProps) {
  const meta = branch ? BRANCH_STATUS[branch.status] : undefined;

  /** ترتيب الأيام من الأحد للسبت — الـ API مابيضمنش ترتيب. */
  const hours = useMemo(() => {
    if (!branch) return [];
    return WEEKDAYS_AR.map((label, weekday) => ({
      weekday,
      label,
      entries: branch.workingHours.filter((hour) => hour.weekday === weekday),
    }));
  }, [branch]);

  return (
    <Drawer open={Boolean(branch)} onClose={onClose} title={branch?.restaurant?.nameAr ?? 'فرع'} side="start" width={460}>
      {!branch ? null : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[13.5px] font-black text-ink">{branch.nameAr}</span>
            {meta ? <Pill tone={meta.tone}>{meta.label}</Pill> : null}
          </div>

          <dl className="flex flex-col gap-2 rounded-[13px] bg-soft p-3">
            <Row label="المدينة">{branch.city || DASH}</Row>
            <Row label="العنوان">{branch.address || DASH}</Row>
            <Row label="التقييم">
              <span className="font-num" dir="ltr">
                {branch.rating}★
              </span>
              <span className="text-muted"> · {num(branch.ratingCount)} تقييم</span>
            </Row>
            <Row label="رسوم التوصيل">
              <Money value={branch.deliveryFee} size="md" />
            </Row>
            <Row label="أقل قيمة طلب">
              <Money value={branch.minOrderTotal} size="md" />
            </Row>
            <Row label="متوسط وقت التحضير">{durationAr(branch.avgPrepMinutes)}</Row>
            <Row label="نطاق التوصيل">
              <span className="font-num" dir="ltr">
                {branch.deliveryRadiusKm}
              </span>{' '}
              كم
            </Row>
            <Row label="عمولة المنصة">
              <span className="font-num" dir="ltr">
                {branch.restaurant?.commissionRate ?? DASH}%
              </span>
            </Row>
          </dl>

          <MissingDataNote>
            نسبة العمولة معروضة للقراءة بس — تعديلها، وتفعيل/إيقاف الفرع، وطلبات الانضمام كلها محتاجة endpoints للأدمن
            (المتاح دلوقتي هو «PATCH /restaurants/branch/status» لدور MERCHANT بس).
          </MissingDataNote>

          {/* ── أوقات العمل ── */}
          <div>
            <SectionTitle>أوقات العمل</SectionTitle>

            {branch.workingHours.length === 0 ? (
              <p className="text-[12px] font-bold text-muted">مافيش أوقات عمل مسجّلة للفرع ده.</p>
            ) : (
              <ul className="flex flex-col">
                {hours.map((day) => (
                  <li
                    key={day.weekday}
                    className="flex items-start justify-between gap-3 border-b border-hair py-2 text-[12.5px] last:border-0"
                  >
                    <span className="shrink-0 font-extrabold text-label">{day.label}</span>

                    <span className="min-w-0 flex-1 text-end">
                      {day.entries.length === 0 ? (
                        <span className="font-bold text-faint">{DASH}</span>
                      ) : (
                        day.entries.map((entry) => (
                          <span
                            key={entry.id}
                            className={cx(
                              'ms-2 inline-block font-bold',
                              entry.isClosed ? 'text-faint' : 'font-num text-ink',
                            )}
                            dir={entry.isClosed ? undefined : 'ltr'}
                          >
                            {entry.isClosed ? 'مغلق' : `${entry.opensAt} — ${entry.closesAt}`}
                            {entry.isRamadan ? <span className="font-sans text-gold"> (رمضان)</span> : null}
                          </span>
                        ))
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
      <dt className="shrink-0 font-extrabold text-label">{label}</dt>
      <dd className="min-w-0 truncate text-end font-bold text-ink">{children}</dd>
    </div>
  );
}
