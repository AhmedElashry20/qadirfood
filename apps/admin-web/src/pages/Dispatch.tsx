// طابور التوزيع — مشتق من الطلبات، مش من endpoint dispatch (مافيش)
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { PageBody, TopBar } from '../components/Shell';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Loading,
  MissingDataNote,
  Money,
  Pill,
  SectionTitle,
  StatusDot,
  cx,
  type Tone,
} from '../components/ui';
import { get } from '../lib/api';
import { DASH, durationAr, ltr, num, relativeAr } from '../lib/format';
import { EV, useSocketEvent } from '../lib/socket';

// ────────────────────────────────────────────────────────────
// أشكال الـ API
// ────────────────────────────────────────────────────────────

type OrderStatus = 'ACCEPTED' | 'PREPARING' | 'READY';

/** الحالات اللي الطلب فيها مستني كابتن — قبل CAPTAIN_ASSIGNED. */
const QUEUE_STATUSES: OrderStatus[] = ['READY', 'ACCEPTED', 'PREPARING'];

interface QueueOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  total: number;
  placedAt: string;
  captainId: string | null;
  captain: { id: string } | null;
  items: Array<{ id: string }>;
  branch: { id: string; nameAr: string; lat: number | null; lng: number | null };
  address: { label: string; district: string | null; lat: number | null; lng: number | null };
}

interface OrdersPage {
  data: QueueOrder[];
  total: number;
  page: number;
  pageSize: number;
}

/** حمولة `captain:location` لغرفة admin — tracking.gateway.ts#onCaptainLocation. */
interface CaptainLocationPayload {
  captainId: string;
  location: { lat: number; lng: number };
  at: string;
}

interface LiveCaptain {
  captainId: string;
  lat: number;
  lng: number;
  at: string;
}

// ────────────────────────────────────────────────────────────
// إعدادات التوزيع الآلي — القيم الافتراضية في السيرفر
// apps/api/src/dispatch/dispatch.service.ts:
//   CAPTAIN_SEARCH_RADIUS_KM ?? 7   ·   TRIP_OFFER_TIMEOUT_SECONDS ?? 30
// مافيش endpoint بيقرا ولا بيكتب الإعدادات دي، فهي معروضة كنص ثابت.
// ────────────────────────────────────────────────────────────

const SEARCH_RADIUS_KM = 7;
const OFFER_TIMEOUT_SECONDS = 30;

/** بعد ٥ دقايق في الطابور، الطلب بيتحسب متأخر. */
const SLA_BREACH_MINUTES = 5;

const PAGE_SIZE = 100;

// ────────────────────────────────────────────────────────────
// المسافة — هافرسين، نفس اللي السيرفر بيستخدمه في PostGIS
// ────────────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;

const toRad = (degrees: number): number => (degrees * Math.PI) / 180;

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// ────────────────────────────────────────────────────────────
// الصفحة
// ────────────────────────────────────────────────────────────

export default function Dispatch() {
  const [live, setLive] = useState<Record<string, LiveCaptain>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /** ساعة بتدق كل ثانية — عشان عدّاد الـ SLA يتحرّك. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useSocketEvent<CaptainLocationPayload>(EV.CAPTAIN_LOCATION, (payload) => {
    if (!payload?.captainId || !payload.location) return;

    setLive((current) => ({
      ...current,
      [payload.captainId]: {
        captainId: payload.captainId,
        lat: payload.location.lat,
        lng: payload.location.lng,
        at: payload.at ?? new Date().toISOString(),
      },
    }));
  });

  /**
   * مافيش `GET /dispatch/queue`. بنشتق الطابور: الطلبات اللي المطعم قبلها
   * (ACCEPTED/PREPARING/READY) ولسه من غير كابتن. ده بالظبط نفس شرط
   * DispatchService.dispatchNow في السيرفر.
   */
  const orders = useQuery({
    queryKey: ['orders', 'dispatch-queue', QUEUE_STATUSES],
    queryFn: () => get<OrdersPage>('/orders', { status: QUEUE_STATUSES, pageSize: PAGE_SIZE }),
  });

  const refetch = useCallback(() => {
    void orders.refetch();
  }, [orders]);

  useSocketEvent(EV.ORDER_STATUS_CHANGED, refetch);
  useSocketEvent(EV.CAPTAIN_ASSIGNED, refetch);

  /** الأقدم أولاً — الطلب اللي مستني من زمان هو الأولوية. */
  const queue = useMemo(
    () =>
      (orders.data?.data ?? [])
        .filter((order) => !order.captainId && !order.captain)
        .sort((a, b) => new Date(a.placedAt).getTime() - new Date(b.placedAt).getTime()),
    [orders.data],
  );

  const selected = useMemo(
    () => queue.find((order) => order.id === selectedId) ?? queue[0],
    [queue, selectedId],
  );

  const captains = useMemo(() => Object.values(live), [live]);

  /** الكباتن الحيّين مرتبين بالمسافة لفرع الطلب المحدد. */
  const nearest = useMemo(() => {
    const branch = selected?.branch;
    if (!branch || typeof branch.lat !== 'number' || typeof branch.lng !== 'number') {
      return captains.map((captain) => ({ captain, distanceKm: null as number | null }));
    }

    return captains
      .map((captain) => ({
        captain,
        distanceKm: haversineKm(branch.lat as number, branch.lng as number, captain.lat, captain.lng),
      }))
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  }, [captains, selected]);

  return (
    <>
      <TopBar
        title="التوزيع"
        tabs={
          <Chip tone="bad" count={queue.length}>
            غير مسند
          </Chip>
        }
        actions={
          <span className="text-[11.5px] font-bold text-muted">
            {orders.isFetching ? 'جارِ التحديث…' : 'الطابور مشتق من الطلبات'}
          </span>
        }
      />

      <PageBody>
        <div className="flex flex-1 overflow-hidden">
          <Card padding="none" className="flex flex-1 overflow-hidden">
            {/* ── الطابور ── */}
            <div className="flex w-[460px] shrink-0 flex-col overflow-hidden border-s border-line bg-soft">
              <div className="shrink-0 border-b border-line p-[14px]">
                <SectionTitle
                  className="mb-2"
                  aside={
                    <span className="num" dir="ltr">
                      {num(queue.length)}
                    </span>
                  }
                >
                  طابور الإسناد
                </SectionTitle>
                <MissingDataNote>
                  الإسناد اليدوي وإعادة المحاولة محتاجين endpoints في الـ API — التوزيع الآلي شغّال في السيرفر
                  (DispatchService) بس مافيش واجهة تتحكم فيه.
                </MissingDataNote>
              </div>

              <div className="flex flex-1 flex-col gap-2 overflow-auto p-[14px]">
                {orders.isPending ? (
                  <Loading rows={5} height={92} />
                ) : orders.isError ? (
                  <ErrorState message={orders.error.message} onRetry={() => void orders.refetch()} />
                ) : queue.length === 0 ? (
                  <EmptyState
                    icon="✅"
                    title="مافيش طلبات مستنية إسناد"
                    description="كل الطلبات المقبولة من المطاعم عندها كابتن دلوقتي."
                  />
                ) : (
                  queue.map((order) => (
                    <QueueCard
                      key={order.id}
                      order={order}
                      now={now}
                      selected={order.id === selected?.id}
                      onSelect={() => setSelectedId(order.id)}
                    />
                  ))
                )}
              </div>
            </div>

            {/* ── الكباتن الأقرب ── */}
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex flex-1 flex-col overflow-auto p-[16px]">
                <SectionTitle
                  aside={
                    selected ? (
                      <span>
                        بالنسبة لـ{' '}
                        <span className="num text-ink" dir="ltr">
                          #{selected.orderNumber}
                        </span>{' '}
                        · {selected.branch?.nameAr ?? DASH}
                      </span>
                    ) : undefined
                  }
                >
                  الكباتن الأقرب
                </SectionTitle>

                {nearest.length === 0 ? (
                  <EmptyState
                    icon="🛵"
                    title="مافيش endpoint يرجّع قائمة الكباتن"
                    description={
                      <>
                        <span className="block">
                          الـ API مافيهوش «GET /captains» ولا endpoint ترشيح للإسناد — المصدر الوحيد للكباتن في اللوحة
                          هو بث «captain:location» لغرفة admin.
                        </span>
                        <span className="mt-2 block">
                          أول ما كابتن يبعت موقعه، هيظهر هنا مرتب بالمسافة للفرع — للعرض بس، من غير زر إسناد.
                        </span>
                      </>
                    }
                  />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {nearest.map(({ captain, distanceKm }) => {
                      const outOfRange = distanceKm !== null && distanceKm > SEARCH_RADIUS_KM;

                      return (
                        <li
                          key={captain.captainId}
                          className="flex items-center gap-3 rounded-[12px] border border-line bg-surface px-3 py-2.5"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ok text-[16px]">
                            🛵
                          </span>

                          <div className="min-w-0 flex-1">
                            {/* الاسم مش متاح من بث الموقع — المعرّف بس. */}
                            <p className="truncate font-num text-[12px] font-extrabold text-ink" dir="ltr">
                              {captain.captainId}
                            </p>
                            <p className="text-[11px] font-bold text-muted">آخر موقع {relativeAr(captain.at)}</p>
                          </div>

                          <div className="shrink-0 text-end">
                            <p className={cx('font-num text-[13px] font-extrabold', outOfRange ? 'text-bad' : 'text-ink')} dir="ltr">
                              {distanceKm === null ? DASH : `${distanceKm.toFixed(1)} كم`}
                            </p>
                            {outOfRange ? <p className="text-[10.5px] font-bold text-bad">برّه نطاق البحث</p> : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <MissingDataNote className="mt-3 border-t border-hair pt-2">
                  المسافة محسوبة في المتصفح (هافرسين) من إحداثيات الفرع لآخر موقع مبثوث — السيرفر بيستخدم PostGIS/Redis
                  وممكن يختلف بشوية. الأسماء والحالة والتقييم محتاجين endpoint كباتن.
                </MissingDataNote>
              </div>

              {/* ── إعدادات التوزيع الآلي ── */}
              <div className="flex shrink-0 items-center justify-between gap-4 bg-ink px-[16px] py-3">
                <p className="text-[12px] font-extrabold text-white">
                  التوزيع الآلي: الأقرب أولاً · نطاق البحث {ltr(SEARCH_RADIUS_KM)} كم · مهلة قبول الكابتن{' '}
                  {ltr(OFFER_TIMEOUT_SECONDS)} ثانية
                </p>
                <p className="shrink-0 text-[10.5px] font-bold text-dim">
                  (القيم من إعدادات السيرفر — مش قابلة للتعديل من اللوحة)
                </p>
              </div>
            </div>
          </Card>
        </div>
      </PageBody>
    </>
  );
}

// ────────────────────────────────────────────────────────────
// بطاقة طلب في الطابور
// ────────────────────────────────────────────────────────────

interface QueueCardProps {
  order: QueueOrder;
  now: number;
  selected: boolean;
  onSelect: () => void;
}

function QueueCard({ order, now, selected, onSelect }: QueueCardProps) {
  const waitingMinutes = Math.max((now - new Date(order.placedAt).getTime()) / 60_000, 0);
  const breached = waitingMinutes >= SLA_BREACH_MINUTES;
  const tone: Tone = breached ? 'bad' : 'warn';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cx(
        'cursor-pointer rounded-[13px] border bg-surface p-3 transition-colors',
        selected ? 'border-brand outline outline-2 outline-brand -outline-offset-2' : 'border-line hover:bg-soft',
      )}
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-[12.5px] font-black text-ink">
          <span className="font-num" dir="ltr">
            #{order.orderNumber}
          </span>{' '}
          · {order.branch?.nameAr ?? DASH} ← {order.address?.district ?? order.address?.label ?? DASH}
        </p>
        <Pill tone={tone} className="shrink-0">
          ⏱ {durationAr(waitingMinutes)}
        </Pill>
      </div>

      <div className="mb-2.5 flex items-center gap-2 text-[11.5px] font-bold text-muted">
        <span>
          {ltr(num(order.items?.length ?? 0))} صنف · <Money value={order.total} size="sm" className="align-middle" />
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <StatusDot tone={breached ? 'bad' : 'warn'} className="text-[11px] font-extrabold text-label">
          {breached ? 'تعدّى مهلة الإسناد' : 'مستني كابتن'}
        </StatusDot>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button size="sm" variant="outline" disabled title="محتاج endpoint إسناد يدوي في الـ API">
            إسناد يدوي
          </Button>
          <Button size="sm" variant="ghost" disabled title="محتاج endpoint إعادة محاولة في الـ API">
            إعادة محاولة آلي
          </Button>
        </div>
      </div>
    </div>
  );
}
