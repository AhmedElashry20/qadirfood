// شركات الأسطول — إدارة الشركات اللي بتورّد مناديب للمنصة + مستخدمي لوحتها
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PageBody, TopBar } from '../components/Shell';
import {
  Button,
  Card,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  Loading,
  MissingDataNote,
  Modal,
  Pagination,
  Pill,
  TD,
  TH,
  THead,
  TR,
  Table,
  TextInput,
  type Tone,
} from '../components/ui';
import { get, patch, post } from '../lib/api';
import {
  COMPANY_STATUS_META,
  type CompaniesPage,
  type Company,
  type CompanyStatus,
  type CompanyUser,
} from '../lib/companies';
import { DASH, dateOnly, num, pct } from '../lib/format';

const PAGE_SIZE = 25;

// ────────────────────────────────────────────────────────────
// أشكال الكباتن في لوح الشركة — GET /companies/:id/captains بيرجّع نفس شكل
// GET /captains (زايد companyId/companyName). محتاجين هنا حقول قليلة بس للعرض.
// ────────────────────────────────────────────────────────────

type CaptainStatus = 'OFFLINE' | 'ONLINE' | 'ON_TRIP';
type VehicleType = 'MOTORCYCLE' | 'CAR' | 'BICYCLE';

interface CompanyCaptainRow {
  id: string;
  fullName: string;
  phone: string;
  vehicleType: VehicleType;
  status: CaptainStatus;
  isVerified: boolean;
}

interface CompanyCaptainsPage {
  data: CompanyCaptainRow[];
  total: number;
  page: number;
  pageSize: number;
}

const VEHICLE_AR: Record<VehicleType, string> = {
  MOTORCYCLE: 'دراجة نارية',
  CAR: 'سيارة',
  BICYCLE: 'دراجة هوائية',
};

const CAPTAIN_STATUS_META: Record<CaptainStatus, { label: string; tone: Tone }> = {
  ONLINE: { label: '● متاح', tone: 'ok' },
  ON_TRIP: { label: '🛵 في رحلة', tone: 'brand' },
  OFFLINE: { label: 'أوفلاين', tone: 'neutral' },
};

// ────────────────────────────────────────────────────────────
// الصفحة
// ────────────────────────────────────────────────────────────

export default function Companies() {
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirm, setConfirm] = useState<Company | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const params = useMemo(() => ({ page, pageSize: PAGE_SIZE }), [page]);

  const companies = useQuery({
    queryKey: ['companies', 'list', params],
    queryFn: () => get<CompaniesPage>('/companies', params),
  });

  const rows = companies.data?.data ?? [];

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3_000);
  };

  return (
    <>
      <TopBar
        title="شركات الأسطول"
        tabs={
          companies.data ? (
            <span className="rounded-pill bg-chip px-2.5 py-1 font-num text-[11.5px] font-extrabold text-label" dir="ltr">
              {num(companies.data.total)}
            </span>
          ) : null
        }
        actions={
          <Button variant="brand" size="sm" icon="＋" onClick={() => setCreateOpen(true)}>
            شركة جديدة
          </Button>
        }
      />

      <PageBody>
        <MissingDataNote>
          الشركة بتورّد مناديب للمنصة، وليها مستخدمو لوحة بيشوفوا كباتنها بس. النموذج المالي «المنصة بتدفع للشركة»
          بقى معروض في صفحة «المالية والتسويات» — قسم «تسويات الشركات» (صافي المستحق = إجمالي أجور المناديب ناقص عمولة
          المنصة، مع دورة التسوية والتحويل البنكي). الناقص الوحيد هو الطرف التاني — إزاي الشركة بتوزّع المستحق ده على كل
          مندوب.
        </MissingDataNote>

        <Card padding="none" className="flex flex-1 flex-col overflow-hidden">
          <div className="flex flex-1 flex-col overflow-hidden p-[14px]">
            <div className="flex flex-1 flex-col overflow-auto">
              <Table gridTemplateColumns="1.6fr 0.8fr 0.8fr 0.7fr 0.8fr 1.1fr 0.9fr">
                <THead>
                  <TH>الشركة</TH>
                  <TH>الحالة</TH>
                  <TH align="end">العمولة</TH>
                  <TH align="end">الكباتن</TH>
                  <TH align="end">المستخدمون</TH>
                  <TH>التواصل</TH>
                  <TH align="end">إجراء</TH>
                </THead>

                {companies.isPending ? (
                  <Loading rows={6} height={44} className="mt-2" />
                ) : companies.isError ? (
                  <ErrorState message={companies.error.message} onRetry={() => void companies.refetch()} />
                ) : rows.length === 0 ? (
                  <EmptyState
                    icon="🚚"
                    title="لا توجد شركات أسطول بعد"
                    description="أضف أول شركة من زر «شركة جديدة» فوق، وبعدها عيّن ليها كباتن من صفحة الكباتن."
                  />
                ) : (
                  rows.map((row) => {
                    const meta = COMPANY_STATUS_META[row.status];
                    const suspended = row.status === 'SUSPENDED';

                    return (
                      <TR key={row.id} selected={row.id === openId} muted={suspended} onClick={() => setOpenId(row.id)}>
                        <TD>
                          <span className="font-extrabold text-ink">{row.nameAr}</span>
                          {row.nameEn ? (
                            <bdi className="block text-[11px] font-bold text-muted" dir="ltr">
                              {row.nameEn}
                            </bdi>
                          ) : null}
                        </TD>

                        <TD>
                          <Pill tone={meta.tone}>{meta.label}</Pill>
                        </TD>

                        <TD align="end" numeric>
                          {pct(row.commissionRate)}
                        </TD>

                        <TD align="end" numeric>
                          {num(row.captainCount)}
                        </TD>

                        <TD align="end" numeric muted={!row.userCount}>
                          {typeof row.userCount === 'number' ? num(row.userCount) : DASH}
                        </TD>

                        <TD muted={!row.contactPhone}>
                          {row.contactPhone ? (
                            <bdi className="font-num text-[11.5px]" dir="ltr">
                              {row.contactPhone}
                            </bdi>
                          ) : (
                            DASH
                          )}
                        </TD>

                        <TD align="end">
                          {/* ماينفعش يفتح اللوح — الضغط عليه إجراء مستقل */}
                          <span onClick={(event) => event.stopPropagation()} className="inline-flex">
                            <Button
                              variant={suspended ? 'outline' : 'danger'}
                              size="sm"
                              onClick={() => setConfirm(row)}
                            >
                              {suspended ? 'تفعيل' : 'إيقاف'}
                            </Button>
                          </span>
                        </TD>
                      </TR>
                    );
                  })
                )}
              </Table>
            </div>

            {companies.data ? (
              <Pagination
                page={page}
                pageSize={companies.data.pageSize}
                total={companies.data.total}
                onChange={(next) => {
                  setPage(next);
                  setOpenId(null);
                }}
              />
            ) : null}
          </div>
        </Card>
      </PageBody>

      <CreateCompanyModal open={createOpen} onClose={() => setCreateOpen(false)} showToast={showToast} />

      <StatusConfirmModal company={confirm} onClose={() => setConfirm(null)} showToast={showToast} />

      <CompanyDrawer companyId={openId} onClose={() => setOpenId(null)} showToast={showToast} />

      {toast ? (
        <div className="fixed bottom-6 start-6 z-[60] rounded-[12px] bg-ink px-4 py-3 text-[12.5px] font-extrabold text-white shadow-float">
          ✓ {toast}
        </div>
      ) : null}
    </>
  );
}

// ────────────────────────────────────────────────────────────
// إنشاء شركة — POST /companies
// nameAr إلزامي، الباقي اختياري. commissionRate بين 0 و 100.
// ────────────────────────────────────────────────────────────

interface CreateCompanyModalProps {
  open: boolean;
  onClose: () => void;
  showToast: (message: string) => void;
}

function CreateCompanyModal({ open, onClose, showToast }: CreateCompanyModalProps) {
  const queryClient = useQueryClient();
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [commissionRate, setCommissionRate] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setNameAr('');
      setNameEn('');
      setContactPhone('');
      setCommissionRate('');
      setLocalError('');
    }
  }, [open]);

  const create = useMutation({
    mutationFn: (body: {
      nameAr: string;
      nameEn?: string;
      contactPhone?: string;
      commissionRate?: number;
    }) => post<Company>('/companies', body),
    onSuccess: (company) => {
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
      showToast(`اتضافت شركة «${company.nameAr}»`);
      onClose();
    },
    onError: (error: Error) => setLocalError(error.message),
  });

  const submit = () => {
    const name = nameAr.trim();
    if (!name) {
      setLocalError('اسم الشركة بالعربي مطلوب');
      return;
    }

    let rate: number | undefined;
    const rawRate = commissionRate.trim();
    if (rawRate) {
      const parsed = Number(rawRate);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        setLocalError('نسبة العمولة لازم تكون رقم بين 0 و 100');
        return;
      }
      rate = parsed;
    }

    setLocalError(null);
    create.mutate({
      nameAr: name,
      ...(nameEn.trim() ? { nameEn: nameEn.trim() } : {}),
      ...(contactPhone.trim() ? { contactPhone: contactPhone.trim() } : {}),
      ...(rate !== undefined ? { commissionRate: rate } : {}),
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="شركة أسطول جديدة"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            رجوع
          </Button>
          <Button variant="brand" size="sm" loading={create.isPending} onClick={submit}>
            إضافة الشركة
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="اسم الشركة (عربي)" required error={localError}>
          <TextInput
            value={nameAr}
            onChange={(event) => setNameAr(event.target.value)}
            placeholder="مثلاً: سرعة للتوصيل"
            maxLength={160}
            autoFocus
          />
        </Field>

        <Field label="الاسم بالإنجليزي" hint="اختياري.">
          <TextInput
            latin
            value={nameEn}
            onChange={(event) => setNameEn(event.target.value)}
            placeholder="Suraa Delivery"
            maxLength={160}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="جوال التواصل" hint="اختياري.">
            <TextInput
              latin
              inputMode="tel"
              value={contactPhone}
              onChange={(event) => setContactPhone(event.target.value)}
              placeholder="0112500100"
              maxLength={20}
            />
          </Field>

          <Field label="نسبة العمولة %" hint="حصّة المنصة — 0 لـ 100.">
            <TextInput
              latin
              inputMode="decimal"
              value={commissionRate}
              onChange={(event) => setCommissionRate(event.target.value)}
              placeholder="10"
              maxLength={6}
            />
          </Field>
        </div>

        <MissingDataNote>
          العمولة دي حصّة المنصة من مستحقات كباتن الشركة — وبتتطبّق فعلاً في تسوية الشركة («GET /company-settlements»):
          صافي المستحق للشركة = إجمالي أجور مناديبها ناقص العمولة دي.
        </MissingDataNote>
      </div>
    </Modal>
  );
}

// ────────────────────────────────────────────────────────────
// تأكيد الإيقاف/التفعيل — PATCH /companies/:id { status }
// ────────────────────────────────────────────────────────────

interface StatusConfirmModalProps {
  company: Company | null;
  onClose: () => void;
  showToast: (message: string) => void;
}

function StatusConfirmModal({ company, onClose, showToast }: StatusConfirmModalProps) {
  const queryClient = useQueryClient();
  const suspending = company?.status === 'ACTIVE';
  const nextStatus: CompanyStatus = suspending ? 'SUSPENDED' : 'ACTIVE';

  const change = useMutation({
    mutationFn: () => patch<Company>(`/companies/${company?.id}`, { status: nextStatus }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
      showToast(suspending ? 'اتوقفت الشركة' : 'اتفعّلت الشركة');
      onClose();
    },
  });

  if (!company) return null;

  return (
    <Modal
      open
      onClose={onClose}
      width={440}
      title={suspending ? `إيقاف «${company.nameAr}»` : `تفعيل «${company.nameAr}»`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            رجوع
          </Button>
          <Button
            variant={suspending ? 'danger' : 'brand'}
            size="sm"
            loading={change.isPending}
            onClick={() => change.mutate()}
          >
            {suspending ? 'تأكيد الإيقاف' : 'تأكيد التفعيل'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {suspending ? (
          <p className="rounded-[10px] border border-bad-line bg-bad-row px-3 py-2.5 text-[12px] font-bold leading-relaxed text-bad-deep">
            ⚠️ إيقاف الشركة بيوقف كباتنها عن استقبال طلبات جديدة، وبيمنع مستخدمي لوحة الشركة من تسجيل الدخول. الكباتن
            يفضلوا مربوطين بالشركة — التفعيل تاني بيرجّع كل حاجة زي ما كانت.
          </p>
        ) : (
          <p className="rounded-[10px] border border-line bg-soft px-3 py-2.5 text-[12px] font-bold leading-relaxed text-ink">
            تفعيل الشركة بيرجّع كباتنها لاستقبال الطلبات وبيسمح لمستخدمي لوحتها بالدخول تاني.
          </p>
        )}

        {change.isError ? (
          <p className="rounded-[10px] border border-bad-line bg-bad-row px-3 py-2 text-[12px] font-bold text-bad-deep">
            {change.error.message}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

// ────────────────────────────────────────────────────────────
// لوح تفاصيل الشركة — GET /companies/:id + كباتنها + مستخدمي لوحتها
// ────────────────────────────────────────────────────────────

interface CompanyDrawerProps {
  companyId: string | null;
  onClose: () => void;
  showToast: (message: string) => void;
}

function CompanyDrawer({ companyId, onClose, showToast }: CompanyDrawerProps) {
  const [editing, setEditing] = useState(false);

  // كل ما الشركة المفتوحة تتغيّر نقفل وضع التعديل
  useEffect(() => {
    setEditing(false);
  }, [companyId]);

  const company = useQuery({
    queryKey: ['companies', 'detail', companyId],
    queryFn: () => get<Company>(`/companies/${companyId ?? ''}`),
    enabled: Boolean(companyId),
  });

  const captains = useQuery({
    queryKey: ['companies', 'captains', companyId],
    queryFn: () => get<CompanyCaptainsPage>(`/companies/${companyId ?? ''}/captains`, { page: 1 }),
    enabled: Boolean(companyId),
  });

  const users = useQuery({
    queryKey: ['companies', 'users', companyId],
    queryFn: () => get<CompanyUser[]>(`/companies/${companyId ?? ''}/users`),
    enabled: Boolean(companyId),
  });

  const data = company.data;
  const meta = data ? COMPANY_STATUS_META[data.status] : undefined;

  return (
    <Drawer
      open={Boolean(companyId)}
      onClose={onClose}
      width={480}
      title={
        <span className="flex items-center gap-2">
          <span className="truncate">{data?.nameAr ?? 'شركة'}</span>
          {meta ? <Pill tone={meta.tone}>{meta.label}</Pill> : null}
        </span>
      }
    >
      {company.isPending ? (
        <Loading rows={6} height={40} />
      ) : company.isError ? (
        <ErrorState message={company.error.message} onRetry={() => void company.refetch()} />
      ) : !data ? null : (
        <div className="flex flex-col gap-4">
          {/* ── المعلومات / التعديل ── */}
          {editing ? (
            <CompanyEditForm
              company={data}
              onCancel={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                showToast('اتحفظت بيانات الشركة');
              }}
            />
          ) : (
            <div className="flex flex-col gap-2 rounded-[13px] bg-soft p-3">
              <Fact label="الاسم بالإنجليزي">
                {data.nameEn ? (
                  <bdi className="font-num" dir="ltr">
                    {data.nameEn}
                  </bdi>
                ) : (
                  DASH
                )}
              </Fact>
              <Fact label="نسبة العمولة">{pct(data.commissionRate)}</Fact>
              <Fact label="جوال التواصل">
                {data.contactPhone ? (
                  <bdi className="font-num" dir="ltr">
                    {data.contactPhone}
                  </bdi>
                ) : (
                  DASH
                )}
              </Fact>
              <Fact label="عدد الكباتن">
                <bdi className="font-num" dir="ltr">
                  {num(data.captainCount)}
                </bdi>
              </Fact>
              <Fact label="مستخدمو اللوحة">
                <bdi className="font-num" dir="ltr">
                  {typeof data.userCount === 'number' ? num(data.userCount) : DASH}
                </bdi>
              </Fact>
              <Fact label="تاريخ الإضافة">
                <bdi className="font-num" dir="ltr">
                  {dateOnly(data.createdAt)}
                </bdi>
              </Fact>

              <button
                type="button"
                onClick={() => setEditing(true)}
                className="mt-1 text-start text-[12px] font-extrabold text-gold-deep hover:underline"
              >
                تعديل الاسم والعمولة ›
              </button>
            </div>
          )}

          {/* ── الكباتن ── */}
          <div className="flex flex-col gap-2">
            <p className="text-[12.5px] font-black text-ink">
              كباتن الشركة
              {captains.data ? (
                <span className="ms-1.5 font-num text-[11px] text-muted">({num(captains.data.total)})</span>
              ) : null}
            </p>

            {captains.isPending ? (
              <Loading rows={3} height={34} />
            ) : captains.isError ? (
              <p className="rounded-[10px] border border-bad-line bg-bad-row px-3 py-2 text-[11.5px] font-bold text-bad-deep">
                تعذّر تحميل الكباتن: {captains.error.message}
              </p>
            ) : captains.data && captains.data.data.length ? (
              <ul className="flex flex-col gap-1.5">
                {captains.data.data.map((captain) => {
                  const cMeta = CAPTAIN_STATUS_META[captain.status];
                  return (
                    <li
                      key={captain.id}
                      className="flex items-center justify-between gap-2 rounded-[10px] border border-hair px-2.5 py-2"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-[12px] font-extrabold text-ink">{captain.fullName}</span>
                        <bdi className="font-num text-[10.5px] font-bold text-muted" dir="ltr">
                          {captain.phone} · {VEHICLE_AR[captain.vehicleType] ?? captain.vehicleType}
                        </bdi>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        {cMeta ? <Pill tone={cMeta.tone}>{cMeta.label}</Pill> : null}
                        {!captain.isVerified ? <Pill tone="bad">غير موثّق</Pill> : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-[11.5px] font-bold text-faint">
                لا يوجد كباتن مربوطين بالشركة — اربط كباتن من صفحة «الكباتن».
              </p>
            )}
          </div>

          {/* ── مستخدمو لوحة الشركة ── */}
          <CompanyUsersSection companyId={data.id} users={users.data} isPending={users.isPending} error={users.error} showToast={showToast} />

          {/* ── ملاحظة النموذج المالي ── */}
          <MissingDataNote className="border-t border-hair pt-3">
            تسويات الشركة (مستحقات مناديبها ناقص عمولة المنصة) بتتعرض في «المالية والتسويات» تحت قسم «تسويات الشركات» —
            دورة تسوية، سجل الأجور، والتحويل البنكي. الناقص الوحيد هو الطرف التاني — توزيع الشركة المستحق ده على كل مندوب.
          </MissingDataNote>
        </div>
      )}
    </Drawer>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
      <dt className="shrink-0 font-extrabold text-label">{label}</dt>
      <dd className="min-w-0 truncate text-end font-bold text-ink">{children}</dd>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// تعديل بيانات الشركة — PATCH /companies/:id { nameAr, nameEn, commissionRate }
// ────────────────────────────────────────────────────────────

interface CompanyEditFormProps {
  company: Company;
  onCancel: () => void;
  onSaved: () => void;
}

function CompanyEditForm({ company, onCancel, onSaved }: CompanyEditFormProps) {
  const queryClient = useQueryClient();
  const [nameAr, setNameAr] = useState(company.nameAr);
  const [nameEn, setNameEn] = useState(company.nameEn ?? '');
  const [contactPhone, setContactPhone] = useState(company.contactPhone ?? '');
  const [commissionRate, setCommissionRate] = useState(String(company.commissionRate));
  const [localError, setLocalError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: {
      nameAr: string;
      nameEn: string | null;
      contactPhone: string | null;
      commissionRate: number;
    }) => patch<Company>(`/companies/${company.id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
      onSaved();
    },
    onError: (error: Error) => setLocalError(error.message),
  });

  const submit = () => {
    const name = nameAr.trim();
    if (!name) {
      setLocalError('اسم الشركة بالعربي مطلوب');
      return;
    }

    const parsed = Number(commissionRate.trim());
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      setLocalError('نسبة العمولة لازم تكون رقم بين 0 و 100');
      return;
    }

    setLocalError(null);
    save.mutate({
      nameAr: name,
      nameEn: nameEn.trim() || null,
      contactPhone: contactPhone.trim() || null,
      commissionRate: parsed,
    });
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-[13px] border border-line p-3">
      <p className="text-[12.5px] font-black text-ink">تعديل بيانات الشركة</p>

      <Field label="الاسم (عربي)" required error={localError}>
        <TextInput value={nameAr} onChange={(event) => setNameAr(event.target.value)} maxLength={160} />
      </Field>

      <Field label="الاسم بالإنجليزي">
        <TextInput latin value={nameEn} onChange={(event) => setNameEn(event.target.value)} maxLength={160} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="جوال التواصل">
          <TextInput
            latin
            inputMode="tel"
            value={contactPhone}
            onChange={(event) => setContactPhone(event.target.value)}
            maxLength={20}
          />
        </Field>
        <Field label="نسبة العمولة %">
          <TextInput
            latin
            inputMode="decimal"
            value={commissionRate}
            onChange={(event) => setCommissionRate(event.target.value)}
            maxLength={6}
          />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-2 pt-0.5">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          إلغاء
        </Button>
        <Button variant="brand" size="sm" loading={save.isPending} onClick={submit}>
          حفظ
        </Button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// مستخدمو لوحة الشركة — GET/POST /companies/:id/users
// POST بيرجّع 409 برسالة عربية لو الإيميل/الجوال متكرر.
// ────────────────────────────────────────────────────────────

interface CompanyUsersSectionProps {
  companyId: string;
  users: CompanyUser[] | undefined;
  isPending: boolean;
  error: Error | null;
  showToast: (message: string) => void;
}

function CompanyUsersSection({ companyId, users, isPending, error, showToast }: CompanyUsersSectionProps) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-2 rounded-[13px] border border-line p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12.5px] font-black text-ink">
          مستخدمو لوحة الشركة
          {users ? <span className="ms-1.5 font-num text-[11px] text-muted">({num(users.length)})</span> : null}
        </p>
        {!adding ? (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            إضافة مستخدم
          </Button>
        ) : null}
      </div>

      {isPending ? (
        <Loading rows={2} height={30} />
      ) : error ? (
        <p className="rounded-[10px] border border-bad-line bg-bad-row px-3 py-2 text-[11.5px] font-bold text-bad-deep">
          تعذّر تحميل المستخدمين: {error.message}
        </p>
      ) : users && users.length ? (
        <ul className="flex flex-col gap-1.5">
          {users.map((user) => (
            <li
              key={user.id}
              className="flex items-center justify-between gap-2 rounded-[10px] border border-hair px-2.5 py-2"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[12px] font-extrabold text-ink">{user.fullName}</span>
                <bdi className="truncate font-num text-[10.5px] font-bold text-muted" dir="ltr">
                  {user.email} · {user.phone}
                </bdi>
              </span>
              <Pill tone={user.isActive ? 'ok' : 'neutral'}>{user.isActive ? 'نشط' : 'موقوف'}</Pill>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11.5px] font-bold text-faint">مافيش مستخدمين للشركة لسه.</p>
      )}

      {adding ? (
        <AddUserForm
          companyId={companyId}
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            showToast('اتضاف مستخدم للشركة');
          }}
        />
      ) : null}
    </div>
  );
}

interface AddUserFormProps {
  companyId: string;
  onCancel: () => void;
  onSaved: () => void;
}

function AddUserForm({ companyId, onCancel, onSaved }: AddUserFormProps) {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const add = useMutation({
    mutationFn: (body: { fullName: string; email: string; phone: string; password: string }) =>
      post<CompanyUser>(`/companies/${companyId}/users`, body),
    onSuccess: () => {
      // مستخدم جديد بيغيّر userCount في القايمة والتفاصيل كمان
      void queryClient.invalidateQueries({ queryKey: ['companies', 'users', companyId] });
      void queryClient.invalidateQueries({ queryKey: ['companies', 'detail', companyId] });
      void queryClient.invalidateQueries({ queryKey: ['companies', 'list'] });
      onSaved();
    },
    // رسالة السيرفر العربية (زي 409 «فيه مستخدم بنفس الإيميل أو الجوال») بتتعرض زي ما هي
    onError: (error: Error) => setLocalError(error.message),
  });

  const submit = () => {
    const name = fullName.trim();
    const mail = email.trim();
    const tel = phone.trim();

    if (!name) return setLocalError('اسم المستخدم مطلوب');
    if (!mail) return setLocalError('الإيميل مطلوب');
    if (!tel) return setLocalError('الجوال مطلوب');
    if (password.length < 6) return setLocalError('كلمة السر لازم تكون 6 حروف على الأقل');

    setLocalError(null);
    add.mutate({ fullName: name, email: mail, phone: tel, password });
  };

  return (
    <div className="mt-1 flex flex-col gap-2.5 border-t border-hair pt-3">
      <Field label="اسم المستخدم" required>
        <TextInput value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={160} autoFocus />
      </Field>

      <div className="grid grid-cols-2 gap-2.5">
        <Field label="الإيميل" required>
          <TextInput
            latin
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="ops@company.sa"
            maxLength={160}
          />
        </Field>
        <Field label="الجوال" required>
          <TextInput
            latin
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="0553330001"
            maxLength={20}
          />
        </Field>
      </div>

      <Field label="كلمة السر" required hint="6 حروف على الأقل — مستخدم الشركة بيدخل بيها لوحته." error={localError}>
        <TextInput
          latin
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          maxLength={72}
        />
      </Field>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          إلغاء
        </Button>
        <Button variant="brand" size="sm" loading={add.isPending} onClick={submit}>
          إضافة المستخدم
        </Button>
      </div>
    </div>
  );
}
