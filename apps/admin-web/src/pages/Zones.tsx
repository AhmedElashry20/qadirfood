// المناطق — رسم المنطقة بالخطوط (polygon) + **نقاط التقاء متعددة بالدبوس على
// الخريطة** (بوابات الحرم، إحداثيات دقيقة تتحرّك بالسحب) + إسناد الكباتن.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapContainer, TileLayer, Polygon, Rectangle, CircleMarker, Marker, Tooltip, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { PageBody, TopBar } from '../components/Shell';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Loading,
  Pill,
  SectionTitle,
  Select,
  TD,
  TH,
  THead,
  TR,
  Table,
  TextInput,
  Toggle,
} from '../components/ui';
import { get, post, patch, del } from '../lib/api';

interface Pt { lat: number; lng: number }
interface HandoffPoint { id?: string; name: string; lat: number; lng: number }
interface Zone {
  id: string; name: string; type: 'STANDARD' | 'HARAM'; city: string | null;
  minLat: number; maxLat: number; minLng: number; maxLng: number;
  polygon: Pt[] | null; handoffPoints: HandoffPoint[];
  deliveryFee: number; minOrderTotal: number; priority: number; color: string; isActive: boolean;
}
interface CaptainAssign {
  id: string; name: string; phone: string | null; status: string;
  isFootCourier: boolean; zone: { id: string; name: string; type: string } | null;
}

const KSA_CENTER: [number, number] = [23.8859, 45.0792];

// دبوس نقطة الالتقاء (بدون أصول صور — divIcon).
const pinIcon = L.divIcon({
  className: '',
  html: '<div style="font-size:26px;line-height:1">📍</div>',
  iconSize: [26, 26],
  iconAnchor: [13, 26],
});

function MapClicks({ drawing, addingHandoff, onPolygon, onHandoff }: {
  drawing: boolean; addingHandoff: boolean; onPolygon: (p: Pt) => void; onHandoff: (p: Pt) => void;
}) {
  useMapEvents({
    click(e) {
      const p = { lat: e.latlng.lat, lng: e.latlng.lng };
      if (drawing) onPolygon(p);
      else if (addingHandoff) onHandoff(p);
    },
  });
  return null;
}

export default function Zones() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'zones' | 'captains'>('zones');

  // رسم منطقة جديدة
  const [drawing, setDrawing] = useState(false);
  const [points, setPoints] = useState<Pt[]>([]);
  const [form, setForm] = useState({ name: '', type: 'STANDARD', city: '', deliveryFee: '10', priority: '0' });

  // تحرير نقاط الالتقاء لمنطقة موجودة
  const [editZoneId, setEditZoneId] = useState('');
  const [handoffs, setHandoffs] = useState<HandoffPoint[]>([]);
  const [addingHandoff, setAddingHandoff] = useState(false);

  const zonesQ = useQuery({ queryKey: ['zones'], queryFn: () => get<Zone[]>('/zones') });
  const zones = zonesQ.data ?? [];
  const editZone = zones.find((z) => z.id === editZoneId) ?? null;

  // لما نختار منطقة لتحرير نقاطها، نحمّل نقاطها الحالية.
  useEffect(() => {
    if (editZone) setHandoffs(editZone.handoffPoints.map((p) => ({ ...p })));
  }, [editZoneId]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = useMutation({
    mutationFn: () =>
      post('/zones', {
        name: form.name, type: form.type, city: form.city || undefined,
        deliveryFee: Number(form.deliveryFee), priority: Number(form.priority), polygon: points,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['zones'] });
      setPoints([]); setDrawing(false);
      setForm({ name: '', type: 'STANDARD', city: '', deliveryFee: '10', priority: '0' });
    },
  });

  const saveHandoffs = useMutation({
    mutationFn: () => patch(`/zones/${editZoneId}`, { handoffPoints: handoffs.map(({ name, lat, lng }) => ({ name, lat, lng })) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['zones'] }); setAddingHandoff(false); },
  });

  const remove = useMutation({
    mutationFn: (id: string) => del(`/zones/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['zones'] }); if (editZoneId) setEditZoneId(''); },
  });

  const updatePoint = (i: number, ll: { lat: number; lng: number }) =>
    setHandoffs((hs) => hs.map((p, idx) => (idx === i ? { ...p, lat: ll.lat, lng: ll.lng } : p)));

  return (
    <>
      <TopBar
        title="المناطق ونقاط الالتقاء"
        actions={
          <div className="flex gap-2">
            <Button variant={tab === 'zones' ? 'brand' : 'outline'} size="sm" onClick={() => setTab('zones')}>المناطق</Button>
            <Button variant={tab === 'captains' ? 'brand' : 'outline'} size="sm" onClick={() => setTab('captains')}>إسناد الكباتن</Button>
          </div>
        }
      />
      <PageBody>
        {tab === 'zones' ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <Card padding="none" className="h-[600px] overflow-hidden">
              <MapContainer center={KSA_CENTER} zoom={6} style={{ height: '100%', width: '100%' }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OSM" />
                {/* المناطق */}
                {zones.map((z) =>
                  z.polygon?.length ? (
                    <Polygon key={z.id} positions={z.polygon.map((p) => [p.lat, p.lng])} pathOptions={{ color: z.id === editZoneId ? '#B89A00' : z.color, weight: z.id === editZoneId ? 3 : 2, fillOpacity: z.type === 'HARAM' ? 0.22 : 0.1 }}>
                      <Tooltip>{z.name} {z.type === 'HARAM' ? '(حرم)' : ''}</Tooltip>
                    </Polygon>
                  ) : (
                    <Rectangle key={z.id} bounds={[[z.minLat, z.minLng], [z.maxLat, z.maxLng]]} pathOptions={{ color: z.color, fillOpacity: 0.08 }}>
                      <Tooltip>{z.name}</Tooltip>
                    </Rectangle>
                  ),
                )}
                {/* نقاط التقاء المناطق (غير اللي بنحرّرها) */}
                {zones.filter((z) => z.id !== editZoneId).flatMap((z) =>
                  z.handoffPoints.map((p) => (
                    <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={6} pathOptions={{ color: '#fff', fillColor: '#E23E3E', fillOpacity: 0.9 }}>
                      <Tooltip>{z.name} — {p.name}</Tooltip>
                    </CircleMarker>
                  )),
                )}
                {/* نقاط المنطقة اللي بنحرّرها — دبابيس تتحرّك بالسحب */}
                {editZone && handoffs.map((p, i) => (
                  <Marker key={i} position={[p.lat, p.lng]} draggable icon={pinIcon}
                    eventHandlers={{ dragend: (e) => updatePoint(i, (e.target as L.Marker).getLatLng()) }}>
                    <Tooltip permanent direction="top">{p.name || `نقطة ${i + 1}`}</Tooltip>
                  </Marker>
                ))}
                {/* رسم البولي‑جون الجديد */}
                {points.length >= 3 && <Polygon positions={points.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#B89A00', fillColor: '#FFD200', fillOpacity: 0.15, dashArray: '6' }} />}
                {points.map((p, i) => <CircleMarker key={`v${i}`} center={[p.lat, p.lng]} radius={5} pathOptions={{ color: '#8A7500', fillColor: '#FFD200', fillOpacity: 1 }} />)}
                <MapClicks
                  drawing={drawing}
                  addingHandoff={addingHandoff && !!editZone}
                  onPolygon={(p) => setPoints((pts) => [...pts, p])}
                  onHandoff={(p) => { setHandoffs((hs) => [...hs, { name: `نقطة ${hs.length + 1}`, lat: p.lat, lng: p.lng }]); }}
                />
              </MapContainer>
            </Card>

            <div className="space-y-4">
              {/* رسم منطقة جديدة */}
              <Card>
                <SectionTitle>رسم منطقة جديدة</SectionTitle>
                {!drawing ? (
                  <Button variant="brand" className="w-full" icon="✏️" onClick={() => { setDrawing(true); setPoints([]); setAddingHandoff(false); }}>ابدأ الرسم على الخريطة</Button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-[12px] font-bold text-label">اضغط على الخريطة لإضافة نقاط الحدود ({points.length}). محتاج ٣ على الأقل.</p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => setPoints((p) => p.slice(0, -1))}>تراجع</Button>
                      <Button variant="ghost" size="sm" className="flex-1" onClick={() => { setPoints([]); setDrawing(false); }}>إلغاء</Button>
                    </div>
                    <Field label="اسم المنطقة"><TextInput value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: حي العزيزية" /></Field>
                    <Field label="النوع">
                      <Select value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={[{ value: 'STANDARD', label: 'عادية (مركبات)' }, { value: 'HARAM', label: 'حرم (توصيل مشي + تناوب)' }]} />
                    </Field>
                    <Field label="المدينة"><TextInput value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="مكة / المدينة…" /></Field>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="رسوم التوصيل"><TextInput latin type="number" value={form.deliveryFee} onChange={(e) => setForm({ ...form, deliveryFee: e.target.value })} /></Field>
                      <Field label="الأولوية"><TextInput latin type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} /></Field>
                    </div>
                    <Button variant="brand" className="w-full" loading={create.isPending} disabled={points.length < 3 || !form.name} onClick={() => create.mutate()}>حفظ المنطقة</Button>
                    <p className="text-[11px] font-bold text-faint">نقاط الالتقاء بتتضاف بعد الحفظ من القسم اللي تحت.</p>
                  </div>
                )}
              </Card>

              {/* نقاط الالتقاء (الحرم) */}
              <Card>
                <SectionTitle>نقاط الالتقاء (البوابات)</SectionTitle>
                <Field label="اختر المنطقة">
                  <Select
                    value={editZoneId}
                    onChange={(v) => { setEditZoneId(v); setAddingHandoff(false); setDrawing(false); }}
                    placeholder="— اختر منطقة —"
                    options={zones.map((z) => ({ value: z.id, label: z.type === 'HARAM' ? `${z.name} (حرم)` : z.name }))}
                  />
                </Field>

                {editZone && (
                  <div className="mt-2 space-y-3">
                    <Button
                      variant={addingHandoff ? 'brand' : 'outline'}
                      size="sm"
                      className="w-full"
                      icon="📍"
                      onClick={() => setAddingHandoff((a) => !a)}
                    >
                      {addingHandoff ? 'اضغط على الخريطة لوضع نقطة… (اضغط لإيقاف)' : 'أضف نقطة التقاء من الخريطة'}
                    </Button>

                    <div className="space-y-2">
                      {handoffs.map((p, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[15px]">📍</span>
                          <TextInput className="flex-1" value={p.name} onChange={(e) => setHandoffs((hs) => hs.map((x, idx) => idx === i ? { ...x, name: e.target.value } : x))} placeholder={`نقطة ${i + 1}`} />
                          <span className="text-[10px] font-bold text-faint tabular-nums">{p.lat.toFixed(4)},{p.lng.toFixed(4)}</span>
                          <Button variant="ghost" size="sm" onClick={() => setHandoffs((hs) => hs.filter((_, idx) => idx !== i))}>حذف</Button>
                        </div>
                      ))}
                      {!handoffs.length && <p className="text-[12px] font-bold text-faint">لا توجد نقاط — اضغط "أضف نقطة" ثم على الخريطة.</p>}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="brand" size="sm" loading={saveHandoffs.isPending} onClick={() => saveHandoffs.mutate()}>حفظ النقاط</Button>
                      <span className="text-[11px] font-bold text-faint">تقدر تسحب الدبوس على الخريطة لضبط الموقع بدقة.</span>
                    </div>
                  </div>
                )}
              </Card>

              {/* قائمة المناطق */}
              <Card>
                <SectionTitle aside={<Pill tone="neutral">{zones.length}</Pill>}>المناطق</SectionTitle>
                <div className="max-h-[200px] space-y-2 overflow-auto">
                  {zones.map((z) => (
                    <div key={z.id} className="flex items-center gap-2 text-[12.5px]">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: z.color }} />
                      <span className="flex-1 font-bold text-ink">{z.name}</span>
                      {z.type === 'HARAM' ? <Pill tone="brand">حرم</Pill> : null}
                      <span className="font-bold text-muted">{z.handoffPoints.length} نقطة</span>
                      <Button variant="ghost" size="sm" onClick={() => window.confirm(`حذف ${z.name}؟`) && remove.mutate(z.id)}>حذف</Button>
                    </div>
                  ))}
                  {!zones.length && <p className="py-4 text-center text-[12px] font-bold text-faint">لا توجد مناطق بعد</p>}
                </div>
              </Card>
            </div>
          </div>
        ) : (
          <CaptainsAssign zones={zones} />
        )}
      </PageBody>
    </>
  );
}

function CaptainsAssign({ zones }: { zones: Zone[] }) {
  const qc = useQueryClient();
  const capsQ = useQuery({ queryKey: ['zone-captains'], queryFn: () => get<CaptainAssign[]>('/zones/captains') });
  const assign = useMutation({
    mutationFn: (v: { captainId: string; zoneId: string | null; isFootCourier?: boolean }) => post('/zones/assign', v),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['zone-captains'] }),
  });
  const caps = capsQ.data ?? [];
  const zoneOptions = [{ value: '', label: '— كل المناطق —' }, ...zones.map((z) => ({ value: z.id, label: z.type === 'HARAM' ? `${z.name} (حرم)` : z.name }))];

  if (capsQ.isPending) return <Loading />;
  if (!caps.length) return <EmptyState title="لا يوجد كباتن بعد" description="المناديب بيسجّلوا من تطبيق الكابتن، وبعدها تسندهم للمناطق من هنا." />;

  return (
    <Card padding="none">
      <Table gridTemplateColumns="1.4fr 0.8fr 1.3fr 0.9fr">
        <THead>
          <TH>الكابتن</TH><TH>الحالة</TH><TH>منطقة العمل</TH><TH align="end">مندوب مشي (حرم)</TH>
        </THead>
        {caps.map((c) => (
          <TR key={c.id}>
            <TD><div className="font-extrabold text-ink">{c.name}</div><div className="text-[11px] font-bold text-faint">{c.phone}</div></TD>
            <TD>{c.status}</TD>
            <TD>
              <Select value={c.zone?.id ?? ''} onChange={(v) => assign.mutate({ captainId: c.id, zoneId: v || null })} options={zoneOptions} />
            </TD>
            <TD align="end">
              <Toggle checked={c.isFootCourier} onChange={(checked) => assign.mutate({ captainId: c.id, zoneId: c.zone?.id ?? null, isFootCourier: checked })} />
            </TD>
          </TR>
        ))}
      </Table>
    </Card>
  );
}
