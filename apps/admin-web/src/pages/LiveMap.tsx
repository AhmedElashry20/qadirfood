// الخريطة اللايف — خريطة حقيقية بـ react-leaflet + بيانات لحظية من غرفة admin
//
// المصدر الوحيد للمواقع هو الـ API الحي: GET /api/reports/live-map (كباتن +
// طلبات نشطة بإحداثيات حقيقية)، والحركة اللحظية بتيجي من بث `captain:location`
// لغرفة admin. عمرنا ما بنخترع إحداثيات — كل ماركر موقعه جاي من السيرفر.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, Marker, Polyline, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { TopBar } from '../components/Shell';
import { Chip, ErrorState, Loading, Pill, StatusDot, cx, type Tone } from '../components/ui';
import { get } from '../lib/api';
import { ltr, num, relativeAr } from '../lib/format';
import { EV, connectSocket, getSocket, useSocketEvent } from '../lib/socket';

// ────────────────────────────────────────────────────────────
// أشكال الـ API — مطابقة لـ reports.service#liveMap
// ────────────────────────────────────────────────────────────

type CaptainStatus = 'ONLINE' | 'ON_TRIP';
type VehicleType = 'MOTORCYCLE' | 'CAR' | 'BICYCLE';

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

interface LatLng {
  lat: number;
  lng: number;
}

interface LiveCaptain {
  captainId: string;
  name: string;
  status: CaptainStatus;
  vehicleType: VehicleType;
  location: LatLng;
}

interface ActiveOrder {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  branchAr: string;
  captainId: string | null;
  branch: LatLng | null;
  dropoff: LatLng | null;
}

interface LiveMapResponse {
  at: string;
  captains: LiveCaptain[];
  activeOrders: ActiveOrder[];
}

/** حمولة `captain:location` لغرفة admin — tracking.gateway.ts#onCaptainLocation. */
interface CaptainLocationPayload {
  captainId: string;
  location: LatLng;
  at?: string;
  orderId?: string;
}

/** موقع لحظي متراكم من السوكيت — بيتفوّق على موقع الـ REST. */
interface LivePos {
  lat: number;
  lng: number;
  at: string;
}

// ────────────────────────────────────────────────────────────
// ثوابت الخريطة والعرض
// ────────────────────────────────────────────────────────────

/** مركز الرياض — نفس نقطة تجميع الكباتن في الـ seed. */
const RIYADH: [number, number] = [24.7136, 46.6753];
const DEFAULT_ZOOM = 12;
const FOCUS_ZOOM = 15;

// ────────────────────────────────────────────────────────────
// إسقاط خطي على bbox — مُستخدَم من صفحة الإعدادات (خريطة المناطق المصغّرة)
// عشان تعرض حدود المنطقة كنِسَب مئوية. بيفضل هنا للتوافق — الخريطة الحقيقية
// نفسها بتستخدم leaflet مش الإسقاط ده.
// ────────────────────────────────────────────────────────────

interface Bbox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

/** الرياض — نفس الـ bbox المستخدم في خريطة المناطق بصفحة الإعدادات. */
export const BBOX: Bbox = { minLng: 46.5953, minLat: 24.6636, maxLng: 46.7953, maxLat: 24.8036 };

interface Point {
  /** نسبة من عرض الخريطة (٠-١٠٠) من الشمال. */
  x: number;
  /** نسبة من ارتفاع الخريطة (٠-١٠٠) من فوق. */
  y: number;
  /** هل النقطة جوّه الإطار؟ */
  inside: boolean;
}

/** يحوّل (lat,lng) لنسبة مئوية داخل الـ bbox — إسقاط خطي كافي على مستوى مدينة. */
export function projectToBbox(lat: number, lng: number, bbox: Bbox = BBOX): Point {
  const x = ((lng - bbox.minLng) / (bbox.maxLng - bbox.minLng)) * 100;
  const y = ((bbox.maxLat - lat) / (bbox.maxLat - bbox.minLat)) * 100;
  return { x, y, inside: x >= 0 && x <= 100 && y >= 0 && y <= 100 };
}

const VEHICLE_EMOJI: Record<VehicleType, string> = {
  MOTORCYCLE: '🏍',
  CAR: '🚗',
  BICYCLE: '🚲',
};

const VEHICLE_AR: Record<VehicleType, string> = {
  MOTORCYCLE: 'دراجة نارية',
  CAR: 'سيارة',
  BICYCLE: 'دراجة',
};

/** لون حلقة الكابتن: أونلاين → أخضر، ماسك رحلة → أصفر البراند. */
const RING_ONLINE = '#0BD97C'; // ok-bright
const RING_ON_TRIP = '#FFD200'; // brand

interface StatusMeta {
  label: string;
  icon: string;
  tone: Tone;
}

/** نفس خريطة حالات الطلب المستخدمة في صفحة الطلبات — عشان اللون والنص متسقين. */
const STATUS_META: Record<OrderStatus, StatusMeta> = {
  PENDING: { label: 'بانتظار المطعم', icon: '⏳', tone: 'warn' },
  ACCEPTED: { label: 'مقبول', icon: '⏳', tone: 'warn' },
  PREPARING: { label: 'يجهز', icon: '⏳', tone: 'warn' },
  READY: { label: 'جاهز', icon: '✓', tone: 'ok' },
  CAPTAIN_ASSIGNED: { label: 'كابتن متعيّن', icon: '🛵', tone: 'brand' },
  PICKED_UP: { label: 'تم الاستلام', icon: '🛵', tone: 'brand' },
  ON_THE_WAY: { label: 'في الطريق', icon: '🛵', tone: 'brand' },
  DELIVERED: { label: 'مكتمل', icon: '✓', tone: 'ok' },
  REJECTED: { label: 'مرفوض', icon: '✕', tone: 'bad' },
  CANCELLED: { label: 'ملغي', icon: '✕', tone: 'bad' },
};

// ────────────────────────────────────────────────────────────
// أيقونات الـ divIcon
//
// مهم: الماركر الافتراضي بتاع leaflet بيدوّر على صور PNG بمسار بيتكسر تحت
// bundler زي Vite (404). فبنستغنى عنه خالص ونعمل كل الماركرز بـ L.divIcon
// (HTML/إيموجي inline) — مافيش أي أصل صورة، مافيش 404.
//
// الأيقونات متخزّنة في كاش حسب مفتاح ثابت (نوع+حالة+تحديد) عشان تحديث الموقع
// اللحظي ما يعيدش بناء الأيقونة (وبالتالي ما يقطعش أنيميشن النبض) — الحركة
// بتحصل بـ setLatLng بس.
// ────────────────────────────────────────────────────────────

const captainIconCache = new Map<string, L.DivIcon>();

function captainIcon(vehicle: VehicleType, status: CaptainStatus, selected: boolean): L.DivIcon {
  const key = `${vehicle}|${status}|${selected ? 1 : 0}`;
  const cached = captainIconCache.get(key);
  if (cached) return cached;

  const ring = status === 'ON_TRIP' ? RING_ON_TRIP : RING_ONLINE;
  const halo = status === 'ONLINE' ? `<span class="lm-halo" style="background:${ring}"></span>` : '';
  const icon = L.divIcon({
    className: 'lm-cap-icon',
    html: `<div class="lm-cap${selected ? ' lm-cap--sel' : ''}" style="--ring:${ring}">${halo}<span class="lm-cap-body"><span class="lm-emoji">${VEHICLE_EMOJI[vehicle]}</span></span></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -20],
  });
  captainIconCache.set(key, icon);
  return icon;
}

const branchIcon = L.divIcon({
  className: 'lm-pin-icon',
  html: `<div class="lm-branch"><span>🍔</span></div>`,
  iconSize: [34, 34],
  iconAnchor: [17, 17],
  popupAnchor: [0, -16],
});

const dropoffIcon = L.divIcon({
  className: 'lm-pin-icon',
  html: `<div class="lm-drop"><span>🏠</span></div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -14],
});

/** ستايل الماركرز والـ popups — محقون مرة واحدة مع الصفحة عشان يفضل كله في LiveMap.tsx. */
const MARKER_CSS = `
.lm-cap-icon, .lm-pin-icon { background: transparent !important; border: 0 !important; }
.lm-cap { position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; }
.lm-halo { position: absolute; width: 30px; height: 30px; border-radius: 9999px; opacity: .5; animation: lmPulse 2s ease-out infinite; }
.lm-cap-body { position: relative; z-index: 1; width: 34px; height: 34px; border-radius: 9999px; background: #fff; border: 3px solid var(--ring); box-shadow: 0 4px 12px rgba(0,0,0,.28); display: flex; align-items: center; justify-content: center; font-size: 17px; line-height: 1; transition: transform .15s ease; }
.lm-cap--sel .lm-cap-body { transform: scale(1.16); box-shadow: 0 0 0 4px rgba(28,28,28,.9), 0 6px 16px rgba(0,0,0,.35); }
.lm-branch { width: 34px; height: 34px; border-radius: 10px; background: #1C1C1C; border: 3px solid #FFD200; display: flex; align-items: center; justify-content: center; font-size: 15px; box-shadow: 0 4px 12px rgba(0,0,0,.3); }
.lm-drop { width: 30px; height: 30px; border-radius: 10px; background: #fff; border: 2px dashed #8A8A8A; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 3px 10px rgba(0,0,0,.22); }
@keyframes lmPulse { 0% { transform: scale(.7); opacity: .55; } 70% { transform: scale(2.1); opacity: 0; } 100% { opacity: 0; } }
/* popups بالعربي RTL */
.leaflet-popup-content-wrapper { border-radius: 14px; box-shadow: 0 10px 34px rgba(0,0,0,.25); }
.leaflet-popup-content { margin: 12px 14px; direction: rtl; font-family: 'Cairo', system-ui, sans-serif; }
.leaflet-container { font-family: 'Cairo', system-ui, sans-serif; background: #EDEBE3; }
.leaflet-container a.leaflet-popup-close-button { color: #8A8A8A; }
`;

// ────────────────────────────────────────────────────────────
// اتصال السوكيت — مؤشر «● مباشر»
// ────────────────────────────────────────────────────────────

function useSocketConnected(): boolean {
  const [connected, setConnected] = useState<boolean>(() => getSocket()?.connected ?? false);

  useEffect(() => {
    const instance = connectSocket();
    if (!instance) return;

    setConnected(instance.connected);
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    instance.on('connect', on);
    instance.on('disconnect', off);

    return () => {
      instance.off('connect', on);
      instance.off('disconnect', off);
    };
  }, []);

  return connected;
}

// ────────────────────────────────────────────────────────────
// الصفحة
// ────────────────────────────────────────────────────────────

export default function LiveMap() {
  const [searchParams] = useSearchParams();
  const focusOrderId = searchParams.get('order');

  const [map, setMap] = useState<L.Map | null>(null);
  const [live, setLive] = useState<Record<string, LivePos>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const captainMarkers = useRef<Record<string, L.Marker | null>>({});
  const orderMarkers = useRef<Record<string, L.Marker | null>>({});

  const connected = useSocketConnected();

  // ── المصدر الأساسي: لقطة كاملة من السيرفر (كباتن + طلبات نشطة بإحداثيات حقيقية) ──
  const query = useQuery({
    queryKey: ['live-map'],
    queryFn: () => get<LiveMapResponse>('/reports/live-map'),
    refetchInterval: 30_000, // شبكة أمان لو فات حدث سوكيت
  });
  const { refetch } = query;

  // ── الحركة اللحظية: كل حدث بيحرّك ماركر الكابتن لمكانه الجديد ──
  useSocketEvent<CaptainLocationPayload>(EV.CAPTAIN_LOCATION, (payload) => {
    if (!payload?.captainId || !payload.location) return;
    setLive((current) => ({
      ...current,
      [payload.captainId]: {
        lat: payload.location.lat,
        lng: payload.location.lng,
        at: payload.at ?? new Date().toISOString(),
      },
    }));
  });

  // ── تعيين كابتن / تغيّر حالة طلب → إعادة جلب اللقطة (مع debounce) ──
  const refetchTimer = useRef<number | undefined>(undefined);
  const debouncedRefetch = useCallback(() => {
    window.clearTimeout(refetchTimer.current);
    refetchTimer.current = window.setTimeout(() => void refetch(), 700);
  }, [refetch]);

  useSocketEvent(EV.CAPTAIN_ASSIGNED, debouncedRefetch);
  useSocketEvent(EV.ORDER_STATUS_CHANGED, debouncedRefetch);

  useEffect(() => () => window.clearTimeout(refetchTimer.current), []);

  const captains = query.data?.captains ?? [];
  const activeOrders = query.data?.activeOrders ?? [];

  // موقع كل كابتن = آخر بث لحظي إن وُجد، وإلا لقطة الـ REST.
  const captainPos = useCallback(
    (captain: LiveCaptain): LivePos => {
      const l = live[captain.captainId];
      return l ?? { lat: captain.location.lat, lng: captain.location.lng, at: query.data?.at ?? '' };
    },
    [live, query.data],
  );

  const onlineCount = useMemo(() => captains.filter((c) => c.status === 'ONLINE').length, [captains]);
  const onTripCount = captains.length - onlineCount;

  // الطلبات اللي ليها إحداثيات فرع ووجهة بس — بنتخطّى أي واحد ناقص.
  const mappableOrders = useMemo(
    () => activeOrders.filter((o): o is ActiveOrder & { branch: LatLng; dropoff: LatLng } => !!o.branch && !!o.dropoff),
    [activeOrders],
  );

  // ── التركيز على ماركر (من البانل أو من ?order=) ──
  const focusCaptain = useCallback(
    (captain: LiveCaptain) => {
      const p = captainPos(captain);
      setSelectedId(captain.captainId);
      map?.flyTo([p.lat, p.lng], FOCUS_ZOOM, { duration: 0.7 });
      captainMarkers.current[captain.captainId]?.openPopup();
    },
    [captainPos, map],
  );

  const focusOrder = useCallback(
    (order: ActiveOrder & { branch: LatLng }) => {
      setSelectedId(order.orderId);
      map?.flyTo([order.branch.lat, order.branch.lng], FOCUS_ZOOM, { duration: 0.7 });
      orderMarkers.current[order.orderId]?.openPopup();
    },
    [map],
  );

  // ‏?order=<id> → طِر للطلب ده أول ما البيانات والخريطة يجهزوا
  const didFocusParam = useRef(false);
  useEffect(() => {
    if (didFocusParam.current || !focusOrderId || !map) return;
    const order = mappableOrders.find((o) => o.orderId === focusOrderId);
    if (order) {
      didFocusParam.current = true;
      focusOrder(order);
    }
  }, [focusOrderId, map, mappableOrders, focusOrder]);

  const recenter = useCallback(() => {
    setSelectedId(null);
    map?.flyTo(RIYADH, DEFAULT_ZOOM, { duration: 0.7 });
  }, [map]);

  return (
    <>
      <style>{MARKER_CSS}</style>

      <TopBar
        title="الخريطة اللايف"
        tabs={
          <>
            <Chip tone="ok" count={onlineCount}>
              ● أونلاين
            </Chip>
            <Chip tone="brand" count={onTripCount}>
              ● في رحلة
            </Chip>
            <Chip tone="neutral" count={mappableOrders.length}>
              طلبات نشطة
            </Chip>
          </>
        }
        actions={<LiveIndicator connected={connected} fetching={query.isFetching} />}
      />

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {/* ── الخريطة ── */}
        <MapContainer
          ref={setMap}
          center={RIYADH}
          zoom={DEFAULT_ZOOM}
          scrollWheelZoom
          zoomControl
          className="h-full w-full"
          style={{ background: '#EDEBE3' }}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            maxZoom={19}
          />

          {/* طبقة الطلبات النشطة: خط فرع→وجهة + دبوس مطعم + دبوس وجهة */}
          {mappableOrders.map((order) => {
            const meta = STATUS_META[order.status];
            return (
              <Fragment key={order.orderId}>
                <Polyline
                  positions={[
                    [order.branch.lat, order.branch.lng],
                    [order.dropoff.lat, order.dropoff.lng],
                  ]}
                  pathOptions={{ color: '#6E6A5C', weight: 2.5, opacity: 0.55, dashArray: '4 8' }}
                />

                <Marker
                  position={[order.branch.lat, order.branch.lng]}
                  icon={branchIcon}
                  ref={(m) => {
                    orderMarkers.current[order.orderId] = m;
                  }}
                  eventHandlers={{ click: () => setSelectedId(order.orderId) }}
                >
                  <Popup>
                    <div className="min-w-[150px]">
                      <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-black text-ink">
                        <span dir="ltr" className="font-num">
                          #{order.orderNumber}
                        </span>
                      </p>
                      <div className="mb-1.5">
                        <Pill tone={meta.tone}>
                          {meta.icon} {meta.label}
                        </Pill>
                      </div>
                      <p className="text-[11.5px] font-bold text-muted">🍔 {order.branchAr}</p>
                    </div>
                  </Popup>
                </Marker>

                <Marker position={[order.dropoff.lat, order.dropoff.lng]} icon={dropoffIcon}>
                  <Popup>
                    <div className="min-w-[130px]">
                      <p className="text-[12.5px] font-black text-ink">🏠 وجهة التسليم</p>
                      <p className="mt-1 text-[11.5px] font-bold text-muted">
                        طلب{' '}
                        <span dir="ltr" className="font-num">
                          #{order.orderNumber}
                        </span>
                      </p>
                    </div>
                  </Popup>
                </Marker>
              </Fragment>
            );
          })}

          {/* طبقة الكباتن: ماركر لكل كابتن، بيتحرّك لحظياً من السوكيت */}
          {captains.map((captain) => {
            const p = captainPos(captain);
            const onTrip = captain.status === 'ON_TRIP';
            return (
              <Marker
                key={captain.captainId}
                position={[p.lat, p.lng]}
                icon={captainIcon(captain.vehicleType, captain.status, selectedId === captain.captainId)}
                ref={(m) => {
                  captainMarkers.current[captain.captainId] = m;
                }}
                zIndexOffset={1000}
                eventHandlers={{ click: () => setSelectedId(captain.captainId) }}
              >
                <Popup>
                  <div className="min-w-[160px]">
                    <p className="mb-1.5 text-[13.5px] font-black text-ink">{captain.name}</p>
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <Pill tone={onTrip ? 'brand' : 'ok'}>{onTrip ? '🛵 في رحلة' : '● أونلاين'}</Pill>
                    </div>
                    <p className="text-[11.5px] font-bold text-muted">
                      {VEHICLE_EMOJI[captain.vehicleType]} {VEHICLE_AR[captain.vehicleType]}
                    </p>
                    {p.at ? (
                      <p className="mt-1 text-[10.5px] font-bold text-faint">آخر موقع {relativeAr(p.at)}</p>
                    ) : null}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>

        {/* ── البانل الزجاجي: القوائم بتحرّك الخريطة ── */}
        <SidePanel
          captains={captains}
          orders={mappableOrders}
          selectedId={selectedId}
          onlineCount={onlineCount}
          onTripCount={onTripCount}
          onPickCaptain={focusCaptain}
          onPickOrder={focusOrder}
          onRecenter={recenter}
          loading={query.isPending}
        />

        {/* ── ليجند مضغوط ── */}
        <Legend />

        {/* ── حالات التحميل / الخطأ فوق الخريطة ── */}
        {query.isError ? (
          <div className="pointer-events-auto absolute inset-x-0 bottom-6 mx-auto w-[420px] rounded-panel border border-line bg-surface p-3 shadow-float">
            <ErrorState message={query.error.message} onRetry={() => void refetch()} />
          </div>
        ) : null}
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────
// مؤشر «● مباشر»
// ────────────────────────────────────────────────────────────

function LiveIndicator({ connected, fetching }: { connected: boolean; fetching: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={cx(
          'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[11.5px] font-extrabold',
          connected ? 'border-ok/30 bg-ok-tint text-ok' : 'border-line bg-chip text-muted',
        )}
      >
        <span
          className={cx('h-[7px] w-[7px] rounded-full', connected ? 'animate-pulse bg-ok-bright' : 'bg-muted')}
          aria-hidden
        />
        {connected ? 'مباشر' : 'غير متصل'}
      </span>
      {fetching ? <span className="text-[11px] font-bold text-faint">جارِ التحديث…</span> : null}
    </span>
  );
}

// ────────────────────────────────────────────────────────────
// البانل الجانبي الزجاجي
// ────────────────────────────────────────────────────────────

interface SidePanelProps {
  captains: LiveCaptain[];
  orders: (ActiveOrder & { branch: LatLng; dropoff: LatLng })[];
  selectedId: string | null;
  onlineCount: number;
  onTripCount: number;
  onPickCaptain: (captain: LiveCaptain) => void;
  onPickOrder: (order: ActiveOrder & { branch: LatLng }) => void;
  onRecenter: () => void;
  loading: boolean;
}

function SidePanel({
  captains,
  orders,
  selectedId,
  onlineCount,
  onTripCount,
  onPickCaptain,
  onPickOrder,
  onRecenter,
  loading,
}: SidePanelProps) {
  return (
    <aside className="absolute start-3 top-3 z-[500] flex max-h-[calc(100%-24px)] w-[300px] flex-col overflow-hidden rounded-panel border border-line bg-surface/85 shadow-float backdrop-blur-md">
      {/* رأس: العدّادات الحيّة */}
      <div className="shrink-0 border-b border-line/70 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13.5px] font-black text-ink">غرفة العمليات</p>
          <button
            type="button"
            onClick={onRecenter}
            title="توسيط على الرياض"
            className="rounded-pill border border-line bg-chip px-2.5 py-1 text-[11px] font-extrabold text-label transition-colors hover:bg-soft"
          >
            توسيط
          </button>
        </div>
        <p className="mt-1 text-[11.5px] font-bold text-muted">
          <span className="font-num" dir="ltr">
            {num(onlineCount + onTripCount)}
          </span>{' '}
          كباتن أونلاين ·{' '}
          <span className="font-num" dir="ltr">
            {num(orders.length)}
          </span>{' '}
          طلبات نشطة
        </p>
      </div>

      {/* المحتوى — بيتمرّر لوحده */}
      <div className="flex-1 overflow-y-auto p-2.5">
        {loading ? (
          <Loading rows={4} height={38} />
        ) : (
          <>
            {/* الكباتن */}
            <p className="mb-1.5 px-1 text-[10.5px] font-black uppercase tracking-wide text-head">
              الكباتن ({ltr(num(captains.length))})
            </p>
            <ul className="mb-3 flex flex-col gap-1">
              {captains.map((captain) => {
                const onTrip = captain.status === 'ON_TRIP';
                return (
                  <li key={captain.captainId}>
                    <button
                      type="button"
                      onClick={() => onPickCaptain(captain)}
                      className={cx(
                        'flex w-full items-center gap-2 rounded-[11px] px-2 py-1.5 text-start transition-colors',
                        selectedId === captain.captainId ? 'bg-tint' : 'hover:bg-soft',
                      )}
                    >
                      <span className="text-[15px] leading-none">{VEHICLE_EMOJI[captain.vehicleType]}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-extrabold text-ink">{captain.name}</span>
                        <StatusDot
                          tone={onTrip ? 'brand' : 'ok'}
                          className="text-[10.5px] font-bold text-muted"
                        >
                          {onTrip ? 'في رحلة' : 'أونلاين'} · {VEHICLE_AR[captain.vehicleType]}
                        </StatusDot>
                      </span>
                    </button>
                  </li>
                );
              })}
              {captains.length === 0 ? (
                <li className="px-2 py-2 text-[11.5px] font-bold text-faint">مافيش كباتن متصلين دلوقتي</li>
              ) : null}
            </ul>

            {/* الطلبات النشطة */}
            <p className="mb-1.5 px-1 text-[10.5px] font-black uppercase tracking-wide text-head">
              طلبات نشطة ({ltr(num(orders.length))})
            </p>
            <ul className="flex flex-col gap-1">
              {orders.map((order) => {
                const meta = STATUS_META[order.status];
                return (
                  <li key={order.orderId}>
                    <button
                      type="button"
                      onClick={() => onPickOrder(order)}
                      className={cx(
                        'flex w-full items-center gap-2 rounded-[11px] px-2 py-1.5 text-start transition-colors',
                        selectedId === order.orderId ? 'bg-tint' : 'hover:bg-soft',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-extrabold text-ink">
                          <span dir="ltr" className="font-num">
                            #{order.orderNumber}
                          </span>{' '}
                          · {order.branchAr}
                        </span>
                        <span className="mt-0.5 inline-flex">
                          <Pill tone={meta.tone}>
                            {meta.icon} {meta.label}
                          </Pill>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {orders.length === 0 ? (
                <li className="px-2 py-2 text-[11.5px] font-bold text-faint">مافيش طلبات نشطة على الخريطة</li>
              ) : null}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}

// ────────────────────────────────────────────────────────────
// الليجند
// ────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="absolute bottom-3 end-3 z-[500] flex flex-col gap-1.5 rounded-panel border border-line bg-surface/85 p-3 shadow-float backdrop-blur-md">
      <p className="mb-0.5 text-[10.5px] font-black uppercase tracking-wide text-head">الدليل</p>
      <LegendRow color={RING_ONLINE} label="كابتن أونلاين" />
      <LegendRow color={RING_ON_TRIP} label="كابتن في رحلة" />
      <div className="flex items-center gap-2">
        <span className="text-[13px] leading-none">🍔</span>
        <span className="text-[11px] font-bold text-label">مطعم / نقطة الاستلام</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[13px] leading-none">🏠</span>
        <span className="text-[11px] font-bold text-label">وجهة التسليم</span>
      </div>
    </div>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-[13px] w-[13px] shrink-0 rounded-full border-[3px] bg-white"
        style={{ borderColor: color }}
        aria-hidden
      />
      <span className="text-[11px] font-bold text-label">{label}</span>
    </div>
  );
}
