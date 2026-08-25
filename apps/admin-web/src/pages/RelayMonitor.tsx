// التوصيل بالتناوب (الحرم) — الشاشة الأساسية لفكرة التطبيق: مندوب مركبة بيستلم من
// المطعم ويسلّم لمندوب مشي داخل حد الحرم (منطقة ممنوعة للمركبات) بتأكيد بالصورة.
// بتراقب كل طلبات التناوب النشطة ومرحلة كل واحد لحظياً.
import { useQuery } from '@tanstack/react-query';
import { PageBody, TopBar } from '../components/Shell';
import { Card, EmptyState, ErrorState, KpiCard, Loading, Pill, type Tone } from '../components/ui';
import { get } from '../lib/api';

type Leg = 'to_handoff' | 'at_handoff' | 'in_haram';
interface Relay {
  orderId: string;
  orderNumber: string;
  status: string;
  branch: string | null;
  leg: Leg;
  vehicleCaptain: { name: string; phone: string | null } | null;
  footCaptain: { name: string; phone: string | null } | null;
  handoff: { status: string; photoUrl: string | null; confirmedAt: string | null; lat: number | null; lng: number | null } | null;
  createdAt: string;
}

const LEG_META: Record<Leg, { label: string; tone: Tone; step: number }> = {
  to_handoff: { label: 'مندوب المركبة في الطريق لنقطة الالتقاء', tone: 'neutral', step: 1 },
  at_handoff: { label: 'عند نقطة الالتقاء — بانتظار تسليم مندوب المشي', tone: 'warn', step: 2 },
  in_haram: { label: 'مندوب المشي داخل الحرم — في الطريق للعميل', tone: 'ok', step: 3 },
};

function Stepper({ leg }: { leg: Leg }) {
  const step = LEG_META[leg].step;
  const steps = ['المطعم → الحرم', 'التسليم بالصورة', 'داخل الحرم → العميل'];
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-1.5">
          <span
            className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-black ${
              i + 1 <= step ? 'bg-brand text-ink' : 'bg-chip text-faint'
            }`}
          >
            {i + 1}
          </span>
          <span className={`text-[11px] font-bold ${i + 1 <= step ? 'text-ink' : 'text-faint'}`}>{s}</span>
          {i < steps.length - 1 && <span className="mx-0.5 text-faint">—</span>}
        </div>
      ))}
    </div>
  );
}

export default function RelayMonitor() {
  const query = useQuery({
    queryKey: ['relay-active'],
    queryFn: () => get<Relay[]>('/relay/active'),
    refetchInterval: 10_000, // لحظي — بيتحدّث كل ١٠ ثواني
  });

  const relays = query.data ?? [];
  const atHandoff = relays.filter((r) => r.leg === 'at_handoff').length;
  const inHaram = relays.filter((r) => r.leg === 'in_haram').length;

  return (
    <>
      <TopBar
        title="التوصيل بالتناوب — الحرم"
        actions={<Pill tone="brand">{`${relays.length} طلب نشِط`}</Pill>}
      />
      <PageBody>
        <p className="mb-4 text-[12.5px] font-bold text-label">
          مندوب المركبة يستلم من المطعم ويوصّل لنقطة الالتقاء على حدود الحرم، ويسلّم لمندوب مشي
          (بتأكيد بالصورة) يكمّل داخل الحرم — لأن المركبات ممنوعة جوّه.
        </p>

        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <KpiCard label="طلبات تناوب نشطة" value={String(relays.length)} />
          <KpiCard label="عند نقطة الالتقاء" value={String(atHandoff)} />
          <KpiCard label="داخل الحرم" value={String(inHaram)} />
        </div>

        {query.isPending ? (
          <Loading />
        ) : query.isError ? (
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        ) : !relays.length ? (
          <EmptyState
            icon="🕋"
            title="لا توجد طلبات تناوب نشطة"
            description="أول ما يجي طلب وجهته داخل الحرم، هيظهر هنا بمراحله."
          />
        ) : (
          <div className="space-y-3">
            {relays.map((r) => {
              const meta = LEG_META[r.leg];
              return (
                <Card key={r.orderId}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-[15px] font-black text-ink">{r.orderNumber}</span>
                      {r.branch && <span className="text-[12px] font-bold text-muted">{r.branch}</span>}
                    </div>
                    <Pill tone={meta.tone}>{meta.label}</Pill>
                  </div>

                  <div className="my-3">
                    <Stepper leg={r.leg} />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                    <div className="rounded-[10px] bg-soft p-3">
                      <div className="text-[11px] font-extrabold text-label">مندوب المركبة</div>
                      <div className="text-[13px] font-bold text-ink">{r.vehicleCaptain?.name ?? '—'}</div>
                      <div className="text-[11px] font-bold text-faint">{r.vehicleCaptain?.phone ?? ''}</div>
                    </div>
                    <div className="rounded-[10px] bg-soft p-3">
                      <div className="text-[11px] font-extrabold text-label">مندوب المشي (الحرم)</div>
                      <div className="text-[13px] font-bold text-ink">{r.footCaptain?.name ?? 'لم يُسنَد بعد'}</div>
                      <div className="text-[11px] font-bold text-faint">{r.footCaptain?.phone ?? ''}</div>
                    </div>
                    {r.handoff?.photoUrl ? (
                      <a href={r.handoff.photoUrl} target="_blank" rel="noreferrer" className="shrink-0">
                        <img
                          src={r.handoff.photoUrl}
                          alt="صورة التسليم"
                          className="h-[74px] w-[74px] rounded-[10px] border border-line object-cover"
                        />
                      </a>
                    ) : (
                      <div className="grid h-[74px] w-[74px] shrink-0 place-items-center rounded-[10px] border border-dashed border-line text-[10px] font-bold text-faint">
                        صورة التسليم
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </PageBody>
    </>
  );
}
