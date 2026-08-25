// صفحة المفاتيح والربط مع الهيئات والمصالح — الأدمن بيدخّل مفاتيح التكاملات
// (دفع/SMS/إشعارات/ZATCA/هيئة النقل/تخزين) ويشوف حالة كل ربط. الأسرار مقنّعة.
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageBody, TopBar } from '../components/Shell';
import { Button, Card, ErrorState, Field, Loading, Pill, SectionTitle, TextInput } from '../components/ui';
import { get, put } from '../lib/api';

interface FieldDef {
  key: string;
  label: string;
  secret: boolean;
  placeholder?: string;
  set: boolean;
  value?: string;
  preview?: string;
}
interface Integration {
  id: string;
  name: string;
  desc: string;
  docsUrl?: string;
  linked: boolean;
  fields: FieldDef[];
}

export default function Integrations() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['integrations'],
    queryFn: () => get<Integration[]>('/admin/settings/integrations'),
  });

  const linkedCount = query.data?.filter((i) => i.linked).length ?? 0;

  return (
    <>
      <TopBar
        title="المفاتيح والربط مع الهيئات"
        actions={
          query.data ? (
            <Pill tone={linkedCount ? 'ok' : 'neutral'}>{`${linkedCount} / ${query.data.length} مربوط`}</Pill>
          ) : null
        }
      />
      <PageBody>
        <p className="mb-4 text-[12.5px] font-bold text-label">
          أدخل مفاتيح كل تكامل عشان تفعّله. الأسرار محفوظة مقنّعة — سيبها فاضية لو مش عايز تغيّرها.
        </p>

        {query.isPending ? (
          <Loading />
        ) : query.isError ? (
          <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
        ) : (
          <div className="space-y-4">
            {query.data.map((integ) => (
              <IntegrationCard
                key={integ.id}
                integ={integ}
                onSaved={() => void qc.invalidateQueries({ queryKey: ['integrations'] })}
              />
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}

function IntegrationCard({ integ, onSaved }: { integ: Integration; onSaved: () => void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const init: Record<string, string> = {};
    for (const f of integ.fields) init[f.key] = f.secret ? '' : (f.value ?? '');
    setValues(init);
  }, [integ]);

  const save = useMutation({
    mutationFn: () => {
      const items = integ.fields
        .map((f) => ({ key: f.key, value: values[f.key] ?? '' }))
        .filter((it) => {
          const f = integ.fields.find((x) => x.key === it.key)!;
          // السرّي الفاضي = خليه زي ما هو (مانبعتهوش)؛ غير السرّي بنبعته دايماً.
          return f.secret ? it.value !== '' : true;
        });
      return put('/admin/settings', { items });
    },
    onSuccess: () => {
      setMsg('تم الحفظ ✓');
      setTimeout(() => setMsg(''), 1500);
      onSaved();
    },
  });

  return (
    <Card>
      <SectionTitle
        aside={
          <div className="flex items-center gap-2">
            {integ.docsUrl ? (
              <a
                href={integ.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[11.5px] font-extrabold text-gold hover:underline"
              >
                موقع المزوّد ↗
              </a>
            ) : null}
            <Pill tone={integ.linked ? 'ok' : 'neutral'}>{integ.linked ? 'مربوط' : 'غير مربوط'}</Pill>
          </div>
        }
      >
        {integ.name}
      </SectionTitle>

      <p className="mb-4 text-[12px] font-bold text-muted">{integ.desc}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {integ.fields.map((f) => (
          <Field key={f.key} label={`${f.label}${f.secret ? ' 🔒' : ''}`}>
            <TextInput
              type={f.secret ? 'password' : 'text'}
              latin={!f.secret}
              value={values[f.key] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              placeholder={f.secret ? (f.preview ?? 'أدخل المفتاح') : (f.placeholder ?? '')}
            />
          </Field>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button variant="brand" size="sm" loading={save.isPending} onClick={() => save.mutate()}>
          حفظ
        </Button>
        {msg ? <span className="text-[12px] font-extrabold text-ok">{msg}</span> : null}
        {save.isError ? <span className="text-[12px] font-bold text-bad">{(save.error as Error).message}</span> : null}
      </div>
    </Card>
  );
}
