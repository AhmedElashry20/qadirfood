// إدارة الكباتن — قايمة حقيقية من GET /captains
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PageBody, TopBar } from '../components/Shell';
import {
  Button,
  Card,
  Chip,
  Drawer,
  EmptyState,
  ErrorState,
  Loading,
  MissingDataNote,
  Money,
  Pagination,
  Pill,
  SearchInput,
  Select,
  TD,
  TH,
  THead,
  TR,
  Table,
  type SelectOption,
  type Tone,
} from '../components/ui';
import { get, post } from '../lib/api';
import type { AssignCaptainResult, CompaniesPage, Company } from '../lib/companies';
import { DASH, money, num } from '../lib/format';

// ────────────────────────────────────────────────────────────
// أشكال الـ API — apps/api/src/captains/captains.service.ts
// (CaptainListItemView / CaptainProfileView)
// كل حقول Decimal بترجع أرقام JS، والتواريخ نصوص ISO.
// ────────────────────────────────────────────────────────────

type CaptainStatus = 'OFFLINE' | 'ONLINE' | 'ON_TRIP';
type VehicleType = 'MOTORCYCLE' | 'CAR' | 'BICYCLE';

interface DocumentsSummary {
  approved: number;
  total: number;
  allApproved: boolean;
}

interface CaptainRow {
  id: string;
  fullName: string;
  phone: string;
  vehicleType: VehicleType;
  plateNumber: string | null;
  status: CaptainStatus;
  isVerified: boolean;
  rating: number;
  ratingCount: number;
  walletBalance: number;
  totalDeliveries: number;
  documentsSummary: DocumentsSummary;
  /** شركة الأسطول المربوط بيها — null معناه مندوب مستقل. */
  companyId: string | null;
  companyName: string | null;
}

// لوح الكابتن مابيرجّعش شركة الأسطول — بنشيلها من الشكل عشان النوع يفضل أمين
interface CaptainDetail extends Omit<CaptainRow, 'companyId' | 'companyName'> {
  email: string | null;
  avatarUrl: string | null;
  /** مقنّع من السيرفر — آخر ٤ أرقام بس. */
  nationalId: string;
  /** دايماً null — مافيش سجل لعروض الرحلات في الـ schema. */
  acceptanceRate: number | null;
  joinedYear: number;
}

interface CaptainsPage {
  data: CaptainRow[];
  total: number;
  page: number;
  pageSize: number;
}

// ────────────────────────────────────────────────────────────
// خرائط العرض
// ────────────────────────────────────────────────────────────

const VEHICLE_AR: Record<VehicleType, string> = {
  MOTORCYCLE: 'دراجة نارية',
  CAR: 'سيارة',
  BICYCLE: 'دراجة هوائية',
};

interface StatusMeta {
  label: string;
  tone: Tone;
}

const STATUS_META: Record<CaptainStatus, StatusMeta> = {
  ONLINE: { label: '● متاح', tone: 'ok' },
  ON_TRIP: { label: '🛵 في رحلة', tone: 'brand' },
  OFFLINE: { label: 'أوفلاين', tone: 'neutral' },
};

/** تبويبات الشريط العلوي — القيمة الفاضية معناها «من غير فلتر حالة». */
const TABS: Array<{ value: '' | CaptainStatus; label: string; tone: Tone }> = [
  { value: '', label: 'الكل', tone: 'neutral' },
  { value: 'ONLINE', label: 'أونلاين', tone: 'ok' },
  { value: 'ON_TRIP', label: 'في رحلة', tone: 'brand' },
  { value: 'OFFLINE', label: 'أوفلاين', tone: 'neutral' },
];

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 350;

/** قيمة مميّزة في فلتر الشركة معناها «المستقلين بس» → freelanceOnly=true. */
const FREELANCE = '__freelance__';
/** نص المندوب المستقل — بيتعرض في العمود وفلتر التعيين. */
const INDEPENDENT_AR = 'مستقل';

// ────────────────────────────────────────────────────────────
// تصدير CSV — من الصفحة المحمّلة بس (مافيش endpoint تصدير)
// ────────────────────────────────────────────────────────────

const CSV_HEADERS = [
  'الاسم',
  'الجوال',
  'المركبة',
  'رقم اللوحة',
  'الحالة',
  'موثّق',
  'الشركة',
  'التقييم',
  'عدد التقييمات',
  'التوصيلات',
  'رصيد المحفظة',
  'الوثائق المعتمدة',
];

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function buildCsv(rows: CaptainRow[]): string {
  const lines = [CSV_HEADERS.map(csvCell).join(',')];

  for (const row of rows) {
    lines.push(
      [
        row.fullName,
        row.phone,
        VEHICLE_AR[row.vehicleType] ?? row.vehicleType,
        row.plateNumber ?? '',
        STATUS_META[row.status]?.label ?? row.status,
        row.isVerified ? 'نعم' : 'لا',
        row.companyName ?? INDEPENDENT_AR,
        String(row.rating),
        String(row.ratingCount),
        String(row.totalDeliveries),
        money(row.walletBalance),
        `${row.documentsSummary?.approved ?? 0}/${row.documentsSummary?.total ?? 0}`,
      ]
        .map(csvCell)
        .join(','),
    );
  }

  return lines.join('\r\n');
}

function downloadCsv(rows: CaptainRow[]): void {
  // ﻿ = BOM — من غيره إكسل بيفتح العربي بترميز غلط
  const blob = new Blob([`﻿${buildCsv(rows)}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `qadir-captains-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

// ────────────────────────────────────────────────────────────
// الصفحة
// ────────────────────────────────────────────────────────────

export default function Captains() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<'' | CaptainStatus>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  // '' = كل الشركات · FREELANCE = المستقلين بس · أي قيمة تانية = معرّف شركة
  const [company, setCompany] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  // البحث بيتبعت للسيرفر — بنأخّره ٣٥٠ms عشان ما نضربش استعلام مع كل حرف
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // قايمة الشركات — للفلتر ولتعيين المندوب في كل صف. pageSize كبير عشان تيجي كلها.
  const companies = useQuery({
    queryKey: ['companies', 'options'],
    queryFn: () => get<CompaniesPage>('/companies', { page: 1, pageSize: 100 }),
  });

  const companyList = companies.data?.data ?? [];

  const params = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      ...(status ? { status } : {}),
      ...(search ? { search } : {}),
      ...(company === FREELANCE ? { freelanceOnly: true } : company ? { companyId: company } : {}),
    }),
    [page, status, search, company],
  );

  const captains = useQuery({
    queryKey: ['captains', 'list', params],
    queryFn: () => get<CaptainsPage>('/captains', params),
  });

  const rows = captains.data?.data ?? [];

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3_000);
  };

  const showAssignError = (message: string) => {
    setAssignError(message);
    window.setTimeout(() => setAssignError(null), 4_000);
  };

  // خيارات فلتر الشريط العلوي: كل الشركات + المستقلين + كل شركة بالاسم
  const filterOptions: SelectOption[] = [
    { value: FREELANCE, label: `${INDEPENDENT_AR} (بدون شركة)` },
    ...companyList.map((item) => ({ value: item.id, label: item.nameAr })),
  ];

  return (
    <>
      <TopBar
        title="الكباتن"
        tabs={TABS.map((tab) => (
          <Chip
            key={tab.value || 'all'}
            tone={tab.tone}
            active={status === tab.value}
            /**
             * العدّاد الحقيقي متاح للتبويب المفتوح بس: الـ API بيرجّع `total`
             * للفلتر الحالي، ومافيش نداء واحد بيجمّع كل الحالات — فبنسيب
             * باقي التبويبات من غير رقم بدل ما نخترعه.
             */
            count={status === tab.value ? captains.data?.total : undefined}
            onClick={() => {
              setStatus(tab.value);
              setPage(1);
              setOpenId(null);
            }}
          >
            {tab.label}
          </Chip>
        ))}
        actions={
          <>
            <Select
              value={company}
              onChange={(value) => {
                setCompany(value);
                setPage(1);
                setOpenId(null);
              }}
              options={filterOptions}
              placeholder="كل الشركات"
              title="فلترة حسب شركة الأسطول"
              disabled={companies.isPending}
            />
            <SearchInput
              value={searchInput}
              onChange={setSearchInput}
              placeholder="⌕ اسم / جوال / لوحة الكابتن…"
              width={240}
            />
            <Button
              variant="dark"
              size="sm"
              icon="⬇"
              disabled={!rows.length}
              title={rows.length ? 'تصدير الصفحة المعروضة' : 'مافيش صفوف للتصدير'}
              onClick={() => downloadCsv(rows)}
            >
              تصدير
            </Button>
          </>
        }
      />

      <PageBody>
        <div className="flex flex-1 overflow-hidden">
          <Card padding="none" className="flex flex-1 flex-col overflow-hidden">
            <div className="flex flex-1 flex-col overflow-hidden p-[14px]">
              <div className="flex flex-1 flex-col overflow-auto">
                <Table gridTemplateColumns="1.4fr 1fr 0.7fr 0.7fr 0.8fr 1.3fr 0.9fr">
                  <THead>
                    <TH>الكابتن</TH>
                    <TH>المركبة</TH>
                    <TH align="end">التقييم</TH>
                    <TH align="end">توصيلات</TH>
                    <TH align="end">المحفظة</TH>
                    <TH>الشركة</TH>
                    <TH>الحالة</TH>
                  </THead>

                  {captains.isPending ? (
                    <Loading rows={8} height={44} className="mt-2" />
                  ) : captains.isError ? (
                    <ErrorState message={captains.error.message} onRetry={() => void captains.refetch()} />
                  ) : rows.length === 0 ? (
                    <EmptyState
                      icon="🛵"
                      title={search ? 'مافيش نتائج للبحث' : 'مافيش كباتن في الفلتر ده'}
                      description={
                        search
                          ? 'البحث بيشتغل على الاسم والجوال ورقم اللوحة ورقم الهوية.'
                          : 'غيّر فلتر الحالة من الشريط العلوي.'
                      }
                    />
                  ) : (
                    rows.map((row) => {
                      const meta = STATUS_META[row.status];

                      return (
                        <TR key={row.id} selected={row.id === openId} onClick={() => setOpenId(row.id)}>
                          <TD>
                            <span className="font-extrabold">{row.fullName}</span>
                            <span className="text-faint"> · </span>
                            <bdi className="font-num text-[11.5px] text-muted" dir="ltr">
                              {row.phone}
                            </bdi>
                          </TD>

                          <TD>
                            {VEHICLE_AR[row.vehicleType] ?? row.vehicleType}
                            {row.plateNumber ? (
                              <bdi className="font-num text-muted" dir="ltr">
                                {' '}
                                · {row.plateNumber}
                              </bdi>
                            ) : null}
                          </TD>

                          <TD align="end" numeric>
                            {row.rating}★ <span className="text-faint">· {num(row.ratingCount)}</span>
                          </TD>

                          <TD align="end" numeric>
                            {num(row.totalDeliveries)}
                          </TD>

                          <TD align="end">
                            <Money value={row.walletBalance} size="sm" hideCurrency />
                          </TD>

                          {/* الشركة + تعيين — الضغط جوّه الخلية ماينفعش يفتح لوح الكابتن */}
                          <TD>
                            <span
                              className="block"
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => event.stopPropagation()}
                            >
                              <AssignCompanyCell
                                captain={row}
                                companies={companyList}
                                disabled={companies.isPending}
                                onDone={showToast}
                                onError={showAssignError}
                              />
                            </span>
                          </TD>

                          <TD>
                            <span className="flex items-center gap-1">
                              <Pill tone={meta.tone}>{meta.label}</Pill>
                              {!row.isVerified ? <Pill tone="bad">⛔ غير موثّق</Pill> : null}
                            </span>
                          </TD>
                        </TR>
                      );
                    })
                  )}
                </Table>
              </div>

              {captains.data ? (
                <Pagination
                  page={page}
                  pageSize={captains.data.pageSize}
                  total={captains.data.total}
                  onChange={(next) => {
                    setPage(next);
                    setOpenId(null);
                  }}
                />
              ) : null}
            </div>
          </Card>
        </div>
      </PageBody>

      <CaptainDrawer captainId={openId} onClose={() => setOpenId(null)} />

      {assignError ? (
        <div className="fixed bottom-6 start-6 z-[60] max-w-[360px] rounded-[12px] border border-bad-line bg-bad-row px-4 py-3 text-[12px] font-bold text-bad-deep shadow-float">
          {assignError}
        </div>
      ) : toast ? (
        <div className="fixed bottom-6 start-6 z-[60] rounded-[12px] bg-ink px-4 py-3 text-[12.5px] font-extrabold text-white shadow-float">
          ✓ {toast}
        </div>
      ) : null}
    </>
  );
}

// ────────────────────────────────────────────────────────────
// تعيين شركة للمندوب — POST /companies/assign-captain
// الـ Select بيعرض شركة المندوب الحالية (أو «مستقل») وتغييره بيربط/بيفكّ الربط.
// ────────────────────────────────────────────────────────────

interface AssignCompanyCellProps {
  captain: CaptainRow;
  companies: Company[];
  disabled?: boolean;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}

function AssignCompanyCell({ captain, companies, disabled = false, onDone, onError }: AssignCompanyCellProps) {
  const queryClient = useQueryClient();

  const assign = useMutation({
    mutationFn: (companyId: string | null) =>
      post<AssignCaptainResult>('/companies/assign-captain', { captainId: captain.id, companyId }),
    onSuccess: (result) => {
      // التعيين بيغيّر شركة المندوب + عدد كباتن الشركة
      void queryClient.invalidateQueries({ queryKey: ['captains'] });
      void queryClient.invalidateQueries({ queryKey: ['companies'] });
      onDone(
        result.companyName ? `${result.fullName} → ${result.companyName}` : `${result.fullName} بقى ${INDEPENDENT_AR}`,
      );
    },
    onError: (error: Error) => onError(error.message),
  });

  // «فكّ الربط» = خيار المستقل (قيمة فاضية)
  const options: SelectOption[] = [
    { value: '', label: INDEPENDENT_AR },
    ...companies.map((item) => ({ value: item.id, label: item.nameAr })),
  ];

  // نضمن إن شركة المندوب الحالية بتبان كخيار حتى لو قايمة الشركات لسه بتحمّل
  if (captain.companyId && !companies.some((item) => item.id === captain.companyId)) {
    options.push({ value: captain.companyId, label: captain.companyName ?? captain.companyId });
  }

  return (
    <Select
      value={captain.companyId ?? ''}
      onChange={(value) => assign.mutate(value || null)}
      options={options}
      disabled={disabled || assign.isPending}
      className="w-full"
      title={captain.companyName ?? INDEPENDENT_AR}
    />
  );
}

// ────────────────────────────────────────────────────────────
// لوح الكابتن — GET /captains/:id
// ────────────────────────────────────────────────────────────

interface CaptainDrawerProps {
  captainId: string | null;
  onClose: () => void;
}

function CaptainDrawer({ captainId, onClose }: CaptainDrawerProps) {
  const navigate = useNavigate();

  const captain = useQuery({
    queryKey: ['captains', 'detail', captainId],
    queryFn: () => get<CaptainDetail>(`/captains/${captainId ?? ''}`),
    enabled: Boolean(captainId),
  });

  const data = captain.data;
  const meta = data ? STATUS_META[data.status] : undefined;

  return (
    <Drawer open={Boolean(captainId)} onClose={onClose} title={data?.fullName ?? 'كابتن'} side="start" width={440}>
      {captain.isPending ? (
        <Loading rows={6} height={40} />
      ) : captain.isError ? (
        <ErrorState message={captain.error.message} onRetry={() => void captain.refetch()} />
      ) : !data ? null : (
        <div className="flex flex-col gap-4">
          {/* ── الرأس ── */}
          <div className="flex items-center gap-3">
            <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand font-num text-[20px] font-extrabold text-ink">
              {data.avatarUrl ? (
                <img src={data.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                (data.fullName.trim()[0] ?? '؟')
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[14.5px] font-black text-ink">{data.fullName}</p>
              <bdi className="block font-num text-[12px] font-bold text-muted" dir="ltr">
                {data.phone}
              </bdi>
            </div>

            <span className="flex shrink-0 flex-col items-end gap-1">
              {meta ? <Pill tone={meta.tone}>{meta.label}</Pill> : null}
              {!data.isVerified ? <Pill tone="bad">⛔ غير موثّق</Pill> : null}
            </span>
          </div>

          {/* ── ٣ أرقام ── */}
          <div className="grid grid-cols-3 gap-2">
            <Stat label="التقييم" value={`${data.rating}★`} note={`${num(data.ratingCount)} تقييم`} />
            <Stat label="التوصيلات" value={num(data.totalDeliveries)} />
            <Stat label="المحفظة" value={<Money value={data.walletBalance} size="md" hideCurrency />} note="ر.س" />
          </div>

          {/* ── الحقائق ── */}
          <dl className="flex flex-col gap-2 rounded-[13px] bg-soft p-3">
            <Row label="رقم الهوية">
              <bdi className="font-num" dir="ltr">
                {data.nationalId || DASH}
              </bdi>
            </Row>

            <Row label="المركبة">
              {VEHICLE_AR[data.vehicleType] ?? data.vehicleType}
              {data.plateNumber ? (
                <bdi className="font-num text-muted" dir="ltr">
                  {' '}
                  · {data.plateNumber}
                </bdi>
              ) : null}
            </Row>

            <Row label="سنة الانضمام">
              <bdi className="font-num" dir="ltr">
                {data.joinedYear}
              </bdi>
            </Row>

            <Row label="البريد">{data.email || DASH}</Row>

            <Row label="نسبة قبول العروض">
              {/* بتتحسب من سجل العروض (trip_offers) — «—» لو الكابتن لسه ما اتعرض عليه */}
              <span className={data.acceptanceRate === null ? 'text-faint' : ''}>
                {data.acceptanceRate === null ? DASH : `${data.acceptanceRate}%`}
              </span>
            </Row>
          </dl>

          {/* ── الوثائق ── */}
          <div className="flex flex-col gap-2 rounded-[13px] border border-line p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12.5px] font-extrabold text-label">الوثائق</span>
              <Pill tone={data.documentsSummary?.allApproved ? 'ok' : 'warn'}>
                <bdi className="font-num" dir="ltr">
                  {data.documentsSummary?.approved ?? 0}/{data.documentsSummary?.total ?? 0}
                </bdi>{' '}
                وثائق معتمدة
              </Pill>
            </div>

            <button
              type="button"
              onClick={() => navigate(`/compliance?captain=${data.id}`)}
              className="text-start text-[12px] font-extrabold text-gold-deep hover:underline"
            >
              مراجعة الوثائق ›
            </button>
          </div>

          {/* ── إجراءات لسه مش متاحة ── */}
          <div className="flex flex-col gap-2 border-t border-hair pt-3">
            <div className="flex gap-2">
              <Button variant="danger" size="sm" block disabled title="مافيش endpoint لحظر أو إيقاف كابتن">
                حظر
              </Button>
              <Button variant="outline" size="sm" block disabled title="مافيش endpoint لفئات/مستويات الكباتن">
                تعديل الفئة
              </Button>
            </div>

            <MissingDataNote>
              «حظر» محتاج endpoint لتعليق الكابتن (مافيش PATCH /captains/:id/ban أو ما شابه)، و«تعديل الفئة» محتاج
              موديل للفئات والمستويات — الاتنين مش موجودين في الـ API دلوقتي.
            </MissingDataNote>
          </div>
        </div>
      )}
    </Drawer>
  );
}

function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[12px] border border-line bg-surface p-2.5 text-center">
      <span className="text-[10.5px] font-extrabold text-label">{label}</span>
      <span className="font-num text-[17px] font-extrabold leading-none text-ink" dir="ltr">
        {value}
      </span>
      {note ? <span className="text-[10px] font-bold text-faint">{note}</span> : null}
    </div>
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
