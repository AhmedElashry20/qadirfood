// الكوبونات — الفورم شغّال كمواصفة، والحفظ معطّل لحد ما endpoints الأدمن تنزل
import { useState } from 'react';

import { PageBody, TopBar } from '../components/Shell';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  MissingDataNote,
  RadioDot,
  SearchInput,
  SectionTitle,
  TH,
  THead,
  Table,
  TextInput,
  cx,
} from '../components/ui';

// ────────────────────────────────────────────────────────────
// الصفحة
//
// جدول `coupons` موجود في schema.prisma وبيتقرا من تطبيق العميل عن طريق
// «GET /customer/coupons»، بس المسار ده متعلّم @Roles(CUSTOMER) — يعني توكن
// الأدمن بياخد ٤٠٣. ومافيش أي مسار إنشاء/تعديل/إيقاف للكوبونات خالص.
//
// الفورم مرسوم بالكامل وقابل للتفاعل عن قصد: هو المواصفة الحرفية للـ DTO
// اللي الـ endpoint المطلوب هياخده. الحفظ بس هو المعطّل.
// ────────────────────────────────────────────────────────────

type DiscountKind = 'PERCENT' | 'AMOUNT';

/** الاستهداف مالوش أعمدة في جدول coupons الحالي — محتاج توسعة في الschema. */
const TARGETS = [
  { key: 'ALL', label: 'كل العملاء' },
  { key: 'NEW', label: 'عملاء جدد' },
  { key: 'INACTIVE', label: 'عملاء خاملين' },
  { key: 'BRANCH', label: 'فرع محدد' },
];

interface CouponForm {
  code: string;
  kind: DiscountKind;
  percentOff: string;
  amountOff: string;
  maxDiscount: string;
  minOrderTotal: string;
  usageLimit: string;
  perUserLimit: string;
  startsAt: string;
  expiresAt: string;
  targets: string[];
}

const EMPTY_FORM: CouponForm = {
  code: '',
  kind: 'PERCENT',
  percentOff: '',
  amountOff: '',
  maxDiscount: '',
  minOrderTotal: '',
  usageLimit: '',
  perUserLimit: '',
  startsAt: '',
  expiresAt: '',
  targets: ['ALL'],
};

export default function Coupons() {
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<CouponForm>(EMPTY_FORM);

  const set = <K extends keyof CouponForm>(key: K, value: CouponForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const toggleTarget = (key: string) =>
    setForm((current) => ({
      ...current,
      targets: current.targets.includes(key)
        ? current.targets.filter((target) => target !== key)
        : [...current.targets, key],
    }));

  return (
    <>
      <TopBar
        title="الكوبونات"
        tabs={
          <Chip tone="warn" title="GET /customer/coupons متعلّم @Roles(CUSTOMER)">
            مافيش API للأدمن
          </Chip>
        }
        actions={<SearchInput value={search} onChange={setSearch} placeholder="⌕ كود الكوبون…" width={220} disabled />}
      />

      <PageBody>
        <div className="flex flex-1 gap-3 overflow-hidden">
          {/* ── قائمة الكوبونات ── */}
          <Card padding="none" className="flex flex-1 flex-col overflow-hidden">
            <div className="shrink-0 p-[14px] pb-0">
              <SectionTitle aside="مافيش endpoint">الكوبونات الحالية</SectionTitle>
              <MissingDataNote className="mb-2">
                جدول <span className="num">coupons</span> موجود ومقروء من تطبيق العميل بس — «GET /customer/coupons»
                متعلّم <span className="num">@Roles(CUSTOMER)</span>، فتوكن الأدمن بياخد <span className="num">403</span>.
                محتاج «GET /admin/coupons» بنفس البيانات + <span className="num">usedCount</span> و
                <span className="num">isActive</span>.
              </MissingDataNote>
            </div>

            <div className="flex flex-1 flex-col overflow-auto p-[14px] pt-0">
              <Table gridTemplateColumns="1.1fr 0.9fr 0.9fr 1fr 0.8fr">
                <THead>
                  <TH>الكود</TH>
                  <TH align="end">الخصم</TH>
                  <TH align="end">الاستخدام</TH>
                  <TH>المدة</TH>
                  <TH>الحالة</TH>
                </THead>

                <EmptyState
                  icon="🎟"
                  title="مافيش endpoint أدمن للكوبونات"
                  description="القائمة هتتعبّى أول ما «GET /admin/coupons» ينزل. ما بنعرضش كوبونات وهمية."
                />
              </Table>
            </div>
          </Card>

          {/* ── إنشاء كوبون ── */}
          <Card padding="lg" className="flex w-[420px] shrink-0 flex-col gap-3 overflow-auto">
            <SectionTitle aside="مواصفة الـ endpoint">إنشاء كوبون جديد</SectionTitle>

            <Field label="الكود" required hint="بيتخزّن في coupons.code — لازم يكون فريد.">
              <TextInput
                latin
                value={form.code}
                onChange={(event) => set('code', event.target.value.toUpperCase())}
                placeholder="QADIR50"
              />
            </Field>

            {/* نوع الخصم — segmented */}
            <Field label="نوع الخصم" hint="عمود percentOff أو amountOff — واحد بس منهم بيتملى.">
              <div className="flex overflow-hidden rounded-[10px] border border-line">
                <SegmentButton active={form.kind === 'PERCENT'} onClick={() => set('kind', 'PERCENT')}>
                  نسبة %
                </SegmentButton>
                <SegmentButton active={form.kind === 'AMOUNT'} onClick={() => set('kind', 'AMOUNT')}>
                  مبلغ ثابت
                </SegmentButton>
              </div>
            </Field>

            {form.kind === 'PERCENT' ? (
              <Field label="النسبة" hint="coupons.percentOff — عدد صحيح من ١ لـ ١٠٠.">
                <TextInput
                  latin
                  inputMode="numeric"
                  value={form.percentOff}
                  onChange={(event) => set('percentOff', event.target.value)}
                  placeholder="25"
                />
              </Field>
            ) : (
              <Field label="المبلغ" hint="coupons.amountOff بالريال.">
                <TextInput
                  latin
                  inputMode="decimal"
                  value={form.amountOff}
                  onChange={(event) => set('amountOff', event.target.value)}
                  placeholder="15"
                />
              </Field>
            )}

            <Field label="حد أقصى للخصم" hint="coupons.maxDiscount — بيسقف الخصم النسبي.">
              <TextInput
                latin
                inputMode="decimal"
                value={form.maxDiscount}
                onChange={(event) => set('maxDiscount', event.target.value)}
                placeholder="40"
              />
            </Field>

            <Field label="أقل قيمة طلب" hint="coupons.minOrderTotal.">
              <TextInput
                latin
                inputMode="decimal"
                value={form.minOrderTotal}
                onChange={(event) => set('minOrderTotal', event.target.value)}
                placeholder="50"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="حد الاستخدام الكلي" hint="coupons.usageLimit.">
                <TextInput
                  latin
                  inputMode="numeric"
                  value={form.usageLimit}
                  onChange={(event) => set('usageLimit', event.target.value)}
                  placeholder="1000"
                />
              </Field>

              <Field label="لكل مستخدم" hint="مافيش عمود ليها في الschema — محتاجة توسعة.">
                <TextInput
                  latin
                  inputMode="numeric"
                  value={form.perUserLimit}
                  onChange={(event) => set('perUserLimit', event.target.value)}
                  placeholder="1"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="يبدأ في" hint="coupons.startsAt.">
                <TextInput
                  latin
                  type="date"
                  value={form.startsAt}
                  onChange={(event) => set('startsAt', event.target.value)}
                />
              </Field>

              <Field label="ينتهي في" hint="coupons.expiresAt.">
                <TextInput
                  latin
                  type="date"
                  value={form.expiresAt}
                  onChange={(event) => set('expiresAt', event.target.value)}
                />
              </Field>
            </div>

            <Field label="الاستهداف" hint="مافيش أعمدة استهداف في جدول coupons — محتاجة توسعة في الschema.">
              <div className="flex flex-wrap gap-1.5">
                {TARGETS.map((target) => (
                  <Chip
                    key={target.key}
                    tone={form.targets.includes(target.key) ? 'brand' : 'neutral'}
                    active={form.targets.includes(target.key)}
                    onClick={() => toggleTarget(target.key)}
                  >
                    {target.label}
                  </Chip>
                ))}
              </div>
            </Field>

            <Field label="تفعيل فوري">
              <RadioDot checked disabled onChange={() => undefined} label="coupons.isActive = true" />
            </Field>

            <div className="mt-1 flex flex-col gap-2 border-t border-hair pt-3">
              <Button block disabled title="مافيش «POST /admin/coupons» في الـ API">
                إنشاء الكوبون
              </Button>

              <Button variant="ghost" size="sm" block onClick={() => setForm(EMPTY_FORM)}>
                تفريغ الحقول
              </Button>

              <MissingDataNote>
                إنشاء الكوبونات محتاج endpoints للأدمن — الجدول <span className="num">coupons</span> موجود ومقروء من
                تطبيق العميل بس. المطلوب: <span className="num">POST /admin/coupons</span>،
                <span className="num"> PATCH /admin/coupons/:id</span> (تفعيل/إيقاف)، و
                <span className="num">GET /admin/coupons</span>. الفورم ده مرسوم بالكامل عن قصد عشان يبقى مواصفة الـ
                DTO المطلوب.
              </MissingDataNote>
            </div>
          </Card>
        </div>
      </PageBody>
    </>
  );
}

// ────────────────────────────────────────────────────────────
// زر مقطّع — نوع الخصم
// ────────────────────────────────────────────────────────────

interface SegmentButtonProps {
  active: boolean;
  onClick: () => void;
  children: string;
}

function SegmentButton({ active, onClick, children }: SegmentButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'flex-1 py-[9px] text-[12.5px] font-extrabold transition-colors',
        active ? 'bg-brand text-ink' : 'bg-surface text-label hover:bg-soft',
      )}
    >
      {children}
    </button>
  );
}
