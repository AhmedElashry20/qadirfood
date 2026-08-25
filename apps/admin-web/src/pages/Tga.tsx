// ربط هيئة النقل — بطاقة توصيل كل كابتن + التحقّق (يدوي دلوقتي)
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PageBody, TopBar } from '../components/Shell';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  KpiCard,
  Loading,
  MissingDataNote,
  Modal,
  Pill,
  SearchInput,
  Select,
  TD,
  TH,
  THead,
  TR,
  Table,
  TextInput,
  cx,
  type SelectOption,
  type Tone,
} from '../components/ui';
import { del, get, post, put } from '../lib/api';
import { DASH, dateOnly, dateTime, ltr, num } from '../lib/format';

// ────────────────────────────────────────────────────────────
// أشكال الـ API — apps/api/src/tga/tga.service.ts
// (linkStatus / roster / report) — التواريخ نصوص ISO.
// ────────────────────────────────────────────────────────────

type TgaStatus = 'NOT_LINKED' | 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';

interface TgaLinkStatus {
  /** `true` يعني ربط API مباشر مع الهيئة. المانوال دايماً `false`. */
  linked: boolean;
  /** اسم مزوّد التحقّق — «manual» دلوقتي. */
  provider: string;
  /** مقنّع من السيرفر — آخر ٣ خانات بس. */
  establishmentNumber: string | null;
  /** `false` لو TGA_ESTABLISHMENT_NUMBER مش متظبّط في البيئة. */
  establishmentConfigured: boolean;
  counts: Record<TgaStatus, number>;
  total: number;
}

interface TgaRow {
  captainId: string;
  name: string;
  phone: string;
  /** null معناه مندوب مستقل. */
  company: string | null;
  /** مقنّع من السيرفر. */
  nationalId: string;
  plateNumber: string | null;
  cardNumber: string | null;
  expiresAt: string | null;
  /** موجب = باقي أيام · سالب = منتهية من كام يوم · null = مافيش بطاقة. */
  daysToExpiry: number | null;
  status: TgaStatus;
  rejectReason: string | null;
  checkedAt: string | null;
}

interface TgaReport {
  generatedAt: string;
  provider: string;
  establishmentConfigured: boolean;
  verified: number;
  total: number;
  rows: TgaRow[];
}

// ────────────────────────────────────────────────────────────
// خرائط العرض
// ────────────────────────────────────────────────────────────

interface StatusMeta {
  label: string;
  tone: Tone;
}

const STATUS_META: Record<TgaStatus, StatusMeta> = {
  VERIFIED: { label: '✓ موثّقة', tone: 'ok' },
  PENDING: { label: '⏳ بانتظار التحقّق', tone: 'warn' },
  EXPIRED: { label: '⛔ منتهية', tone: 'bad' },
  REJECTED: { label: '✕ مرفوضة', tone: 'bad' },
  NOT_LINKED: { label: 'غير مربوطة', tone: 'neutral' },
};

/** خيارات فلتر الحالة — القيمة الفاضية معناها «كل الحالات». */
const STATUS_OPTIONS: SelectOption[] = [
  { value: 'VERIFIED', label: 'موثّقة' },
  { value: 'PENDING', label: 'بانتظار التحقّق' },
  { value: 'EXPIRED', label: 'منتهية' },
  { value: 'REJECTED', label: 'مرفوضة' },
  { value: 'NOT_LINKED', label: 'غير مربوطة' },
];

/** بطاقات العدّ فوق الجدول — نفس ترتيب أهمية الحالة للأدمن. */
const COUNT_CARDS: Array<{ key: TgaStatus; label: string }> = [
  { key: 'VERIFIED', label: 'بطاقات موثّقة' },
  { key: 'PENDING', label: 'بانتظار التحقّق' },
  { key: 'EXPIRED', label: 'بطاقات منتهية' },
  { key: 'REJECTED', label: 'بطاقات مرفوضة' },
  { key: 'NOT_LINKED', label: 'غير مربوطة' },
];

/** البطاقة «قربت تنتهي» = باقي لها ٣٠ يوم أو أقل — نفس عتبة صفحة الالتزام. */
const EXPIRING_SOON_DAYS = 30;

const SEARCH_DEBOUNCE_MS = 350;

/** اسم المزوّد بالعربي — عشان نفرّق التحقّق اليدوي عن ربط API حقيقي. */
function providerLabel(provider: string): string {
  return provider === 'manual' ? 'يدوي (manual)' : provider;
}

/** رسالة نتيجة التحقّق للـ toast — VERIFIED خضرا، غيرها تنبيه. */
function verifyResult(row: TgaRow): { text: string; ok: boolean } {
  if (row.status === 'VERIFIED') return { text: 'تم التحقّق — البطاقة موثّقة', ok: true };
  if (row.status === 'REJECTED') {
    return { text: `التحقّق فشل${row.rejectReason ? ` — ${row.rejectReason}` : ''}`, ok: false };
  }
  return { text: `لسه بانتظار التحقّق${row.rejectReason ? ` — ${row.rejectReason}` : ''}`, ok: false };
}

// ────────────────────────────────────────────────────────────
// تصدير تقرير الهيئة — CSV من صفوف التقرير (مع BOM للعربي)
// ────────────────────────────────────────────────────────────

const CSV_HEADERS = [
  'الاسم',
  'الجوال',
  'الشركة',
  'رقم الهوية',
  'رقم اللوحة',
  'رقم بطاقة التوصيل',
  'تاريخ الانتهاء',
  'أيام للانتهاء',
  'الحالة',
  'سبب الرفض',
  'آخر تحقّق',
];

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function buildReportCsv(rows: TgaRow[]): string {
  const lines = [CSV_HEADERS.map(csvCell).join(',')];

  for (const row of rows) {
    lines.push(
      [
        row.name,
        row.phone,
        row.company ?? 'مستقل',
        row.nationalId,
        row.plateNumber ?? '',
        row.cardNumber ?? '',
        row.expiresAt ? dateOnly(row.expiresAt) : '',
        row.daysToExpiry === null ? '' : String(row.daysToExpiry),
        STATUS_META[row.status]?.label.replace(/^[^\p{L}]+/u, '').trim() ?? row.status,
        row.rejectReason ?? '',
        row.checkedAt ? dateTime(row.checkedAt) : '',
      ]
        .map(csvCell)
        .join(','),
    );
  }

  return lines.join('\r\n');
}

function downloadReportCsv(report: TgaReport): void {
  // ﻿ = BOM — من غيره إكسل بيفتح العربي بترميز غلط
  const blob = new Blob([`﻿${buildReportCsv(report.rows)}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `tga-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

// ────────────────────────────────────────────────────────────
// الصفحة
// ────────────────────────────────────────────────────────────

export default function Tga() {
  const [status, setStatus] = useState<'' | TgaStatus>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [linkTarget, setLinkTarget] = useState<TgaRow | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  // البحث بيتبعت للسيرفر (بيبحث بالاسم أو رقم البطاقة) — بنأخّره ٣٥٠ms
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const linkStatus = useQuery({
    queryKey: ['tga', 'link-status'],
    queryFn: () => get<TgaLinkStatus>('/compliance/tga/link-status'),
  });

  const params = useMemo(
    () => ({ ...(status ? { status } : {}), ...(search ? { search } : {}) }),
    [status, search],
  );

  const roster = useQuery({
    queryKey: ['tga', 'roster', params],
    queryFn: () => get<TgaRow[]>('/compliance/tga', params),
  });

  const rows = roster.data ?? [];

  const showToast = (text: string, ok = true) => {
    setToast({ text, ok });
    window.setTimeout(() => setToast(null), 3_500);
  };

  const exportReport = useMutation({
    mutationFn: () => get<TgaReport>('/compliance/tga/report'),
    onSuccess: (report) => {
      downloadReportCsv(report);
      showToast('تم تصدير تقرير الهيئة');
    },
    onError: (error: Error) => showToast(error.message, false),
  });

  return (
    <>
      <TopBar
        title="🚦 ربط هيئة النقل"
        actions={
          <>
            <Select
              value={status}
              onChange={(value) => setStatus(value as '' | TgaStatus)}
              options={STATUS_OPTIONS}
              placeholder="كل الحالات"
              title="فلترة حسب حالة البطاقة"
            />
            <SearchInput
              value={searchInput}
              onChange={setSearchInput}
              placeholder="⌕ اسم الكابتن / رقم البطاقة…"
              width={240}
            />
            <Button
              variant="dark"
              size="sm"
              icon="⬇"
              loading={exportReport.isPending}
              onClick={() => exportReport.mutate()}
              title="تنزيل تقرير الهيئة CSV"
            >
              تصدير تقرير الهيئة
            </Button>
          </>
        }
      />

      <PageBody>
        {/* ── حالة الربط بالهيئة — أمانة: مافيش ربط API مباشر دلوقتي ── */}
        {linkStatus.isPending ? (
          <Loading rows={1} height={92} className="shrink-0" />
        ) : linkStatus.isError ? (
          <Card className="shrink-0" padding="none">
            <ErrorState message={linkStatus.error.message} onRetry={() => void linkStatus.refetch()} />
          </Card>
        ) : linkStatus.data ? (
          <>
            <LinkStatusBanner data={linkStatus.data} />

            <div className="grid shrink-0 grid-cols-5 gap-3">
              {COUNT_CARDS.map((card) => (
                <KpiCard
                  key={card.key}
                  label={card.label}
                  value={num(linkStatus.data.counts[card.key])}
                  inverted={card.key === 'VERIFIED'}
                  note={card.key === 'VERIFIED' ? `من ${num(linkStatus.data.total)} كابتن` : undefined}
                />
              ))}
            </div>
          </>
        ) : null}

        {/* ── روستر الكباتن ── */}
        <div className="flex flex-1 overflow-hidden">
          <Card padding="none" className="flex flex-1 flex-col overflow-hidden">
            <div className="flex flex-1 flex-col overflow-hidden p-[14px]">
              <div className="flex flex-1 flex-col overflow-auto">
                <Table gridTemplateColumns="1.5fr 1fr 0.8fr 1fr 1.1fr 0.9fr 1.9fr">
                  <THead>
                    <TH>الكابتن</TH>
                    <TH>الشركة</TH>
                    <TH>اللوحة</TH>
                    <TH>رقم البطاقة</TH>
                    <TH>الانتهاء</TH>
                    <TH>الحالة</TH>
                    <TH align="end">الإجراءات</TH>
                  </THead>

                  {roster.isPending ? (
                    <Loading rows={8} height={44} className="mt-2" />
                  ) : roster.isError ? (
                    <ErrorState message={roster.error.message} onRetry={() => void roster.refetch()} />
                  ) : rows.length === 0 ? (
                    <EmptyState
                      icon="🚦"
                      title={search || status ? 'مافيش نتائج للفلتر ده' : 'مافيش كباتن'}
                      description={
                        search || status
                          ? 'غيّر فلتر الحالة أو البحث من الشريط العلوي.'
                          : 'أول ما يتسجّل كباتن هيبانوا هنا.'
                      }
                    />
                  ) : (
                    rows.map((row) => {
                      const meta = STATUS_META[row.status];
                      const expired = row.status === 'EXPIRED' || (row.daysToExpiry !== null && row.daysToExpiry < 0);
                      const soon =
                        !expired && row.daysToExpiry !== null && row.daysToExpiry <= EXPIRING_SOON_DAYS;

                      return (
                        <TR key={row.captainId} danger={expired}>
                          <TD>
                            <span className="font-extrabold">{row.name}</span>
                            <span className="text-faint"> · </span>
                            <bdi className="font-num text-[11.5px] text-muted" dir="ltr">
                              {row.phone}
                            </bdi>
                          </TD>

                          <TD className={row.company ? undefined : 'text-faint'}>{row.company ?? 'مستقل'}</TD>

                          <TD numeric>{row.plateNumber ?? DASH}</TD>

                          <TD numeric>{row.cardNumber ?? DASH}</TD>

                          <TD>
                            {!row.expiresAt ? (
                              <span className="text-[11.5px] font-bold text-faint">{DASH}</span>
                            ) : (
                              <span className="flex items-center gap-1.5">
                                <bdi
                                  className={cx(
                                    'font-num text-[12px] font-bold',
                                    expired ? 'text-bad-deep' : soon ? 'text-gold-deep' : 'text-ink',
                                  )}
                                  dir="ltr"
                                >
                                  {dateOnly(row.expiresAt)}
                                </bdi>
                                {expired ? (
                                  <Pill tone="bad">منتهية</Pill>
                                ) : soon ? (
                                  <Pill tone="warn">{`باقي ${ltr(row.daysToExpiry ?? 0)} يوم`}</Pill>
                                ) : null}
                              </span>
                            )}
                          </TD>

                          <TD>
                            <Pill tone={meta.tone} title={row.rejectReason ?? undefined}>
                              {meta.label}
                            </Pill>
                          </TD>

                          <TD align="end">
                            <RowActions row={row} onLink={setLinkTarget} onToast={showToast} />
                          </TD>
                        </TR>
                      );
                    })
                  )}
                </Table>
              </div>

              <MissingDataNote className="pt-2">
                التحقّق يدوي دلوقتي — مافيش ربط API مباشر مع الهيئة. «تحقّق» بيتأكّد إن البطاقة مش منتهية بس، والاعتماد
                إقرار من الأدمن ومتسجّل في التدقيق. أول ما يتوفّر ربط رسمي مع الهيئة هيبقى التحقّق آلي.
              </MissingDataNote>
            </div>
          </Card>
        </div>
      </PageBody>

      {/* ── نافذة ربط/تحديث البطاقة ── */}
      <LinkCardModal
        target={linkTarget}
        onClose={() => setLinkTarget(null)}
        onDone={(message) => {
          setLinkTarget(null);
          showToast(message);
        }}
      />

      {/* ── إشعار ── */}
      {toast ? (
        <div
          className={cx(
            'fixed bottom-6 start-6 z-[60] max-w-[380px] rounded-[12px] px-4 py-3 text-[12.5px] font-extrabold shadow-float',
            toast.ok ? 'bg-ink text-white' : 'border border-bad-line bg-bad-row text-bad-deep',
          )}
        >
          {toast.ok ? '✓ ' : '⚠️ '}
          {toast.text}
        </div>
      ) : null}
    </>
  );
}

// ────────────────────────────────────────────────────────────
// لافتة حالة الربط — أمانة صريحة عن التحقّق اليدوي
// ────────────────────────────────────────────────────────────

function LinkStatusBanner({ data }: { data: TgaLinkStatus }) {
  return (
    <Card className="shrink-0">
      <div className="flex items-start gap-3">
        <span className="text-[22px] leading-none" aria-hidden>
          🏛
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[14px] font-black text-ink">حالة الربط بهيئة النقل</h2>
            {data.linked ? (
              <Pill tone="ok">مربوط API مباشر</Pill>
            ) : (
              <Pill tone="warn">تحقّق يدوي · مش مربوط API</Pill>
            )}
          </div>

          <p className="mt-1.5 text-[12px] font-bold leading-relaxed text-muted">
            {data.linked
              ? 'المنصة مربوطة مباشرة بأنظمة الهيئة، والتحقّق من بطاقات التوصيل بيتم آلياً.'
              : 'لسه مافيش ربط API مباشر مع أنظمة الهيئة — التحقّق بيتعمل يدوي: الأدمن بيدخل رقم بطاقة التوصيل بعد ما يتأكّد منها على بوابة الهيئة، والاعتماد إقرار منه (متسجّل في التدقيق). النظام بيتأكّد إن البطاقة مش منتهية بس.'}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11.5px] font-bold">
            <span className="text-label">
              مزوّد التحقّق: <span className="text-ink">{providerLabel(data.provider)}</span>
            </span>
            <span className="text-label">
              رقم المنشأة:{' '}
              {data.establishmentNumber ? (
                <bdi className="font-num text-ink" dir="ltr">
                  {data.establishmentNumber}
                </bdi>
              ) : (
                <span className="text-faint">غير مضبوط</span>
              )}
            </span>
          </div>

          {!data.establishmentConfigured ? (
            <p className="mt-2.5 rounded-[10px] border border-gold/30 bg-tint-strong px-3 py-2 text-[11.5px] font-bold text-gold-deep">
              ⚠️ رقم المنشأة في الهيئة مش متظبّط (TGA_ESTABLISHMENT_NUMBER) — ظبّطه في إعدادات السيرفر عشان يظهر في
              التقارير الرسمية.
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// إجراءات الصف — تحقّق / فك ربط (POST verify · DELETE)
// ────────────────────────────────────────────────────────────

interface RowActionsProps {
  row: TgaRow;
  onLink: (row: TgaRow) => void;
  onToast: (text: string, ok?: boolean) => void;
}

function RowActions({ row, onLink, onToast }: RowActionsProps) {
  const queryClient = useQueryClient();

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['tga'] });

  const verify = useMutation({
    mutationFn: () => post<TgaRow>(`/compliance/tga/${row.captainId}/verify`),
    onSuccess: (result) => {
      invalidate();
      const { text, ok } = verifyResult(result);
      onToast(text, ok);
    },
    onError: (error: Error) => onToast(error.message, false),
  });

  const unlink = useMutation({
    mutationFn: () => del<TgaRow>(`/compliance/tga/${row.captainId}`),
    onSuccess: () => {
      invalidate();
      onToast(`تم فك ربط بطاقة ${row.name}`);
    },
    onError: (error: Error) => onToast(error.message, false),
  });

  if (row.status === 'NOT_LINKED') {
    return (
      <Button variant="brand" size="sm" onClick={() => onLink(row)}>
        ربط بطاقة
      </Button>
    );
  }

  return (
    <span className="flex items-center justify-end gap-1.5">
      <Button variant="outline" size="sm" onClick={() => onLink(row)}>
        تحديث
      </Button>
      <Button variant="dark" size="sm" loading={verify.isPending} onClick={() => verify.mutate()}>
        تحقّق
      </Button>
      <Button variant="ghost" size="sm" loading={unlink.isPending} onClick={() => unlink.mutate()}>
        فك الربط
      </Button>
    </span>
  );
}

// ────────────────────────────────────────────────────────────
// نافذة ربط/تحديث البطاقة — PUT /compliance/tga/:captainId
// ────────────────────────────────────────────────────────────

interface LinkCardModalProps {
  target: TgaRow | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

function LinkCardModal({ target, onClose, onDone }: LinkCardModalProps) {
  const queryClient = useQueryClient();

  const [cardNumber, setCardNumber] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const captainId = target?.captainId ?? null;

  // كل ما نفتح كابتن جديد نرجّع الفورم لقيمه الحالية
  useEffect(() => {
    setCardNumber(target?.cardNumber ?? '');
    setExpiresAt(target?.expiresAt ? dateOnly(target.expiresAt) : '');
    setLocalError(null);
  }, [target]);

  const save = useMutation({
    mutationFn: (body: { cardNumber: string; expiresAt: string }) =>
      put<TgaRow>(`/compliance/tga/${captainId ?? ''}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tga'] });
      onDone('تم حفظ بطاقة التوصيل — بانتظار التحقّق');
    },
  });

  if (!target) return null;

  const submit = () => {
    const card = cardNumber.trim();
    if (!card) {
      setLocalError('رقم بطاقة التوصيل مطلوب');
      return;
    }
    if (!expiresAt) {
      setLocalError('تاريخ الانتهاء مطلوب');
      return;
    }
    setLocalError(null);
    // input[type=date] بيدّي «YYYY-MM-DD» — والـ API بيقبلها كـ IsDateString
    save.mutate({ cardNumber: card, expiresAt });
  };

  const isUpdate = target.status !== 'NOT_LINKED';

  return (
    <Modal
      open
      onClose={onClose}
      width={480}
      title={`${isUpdate ? 'تحديث' : 'ربط'} بطاقة التوصيل — ${target.name}`}
      footer={
        <>
          <Button variant="ghost" size="sm" disabled={save.isPending} onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="brand" size="sm" loading={save.isPending} onClick={submit}>
            حفظ
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field
          label="رقم بطاقة التوصيل"
          required
          hint="زي ما هو مسجّل على بوابة الهيئة — لازم يكون فريد لكل كابتن."
          error={localError && !cardNumber.trim() ? localError : null}
        >
          <TextInput
            latin
            value={cardNumber}
            onChange={(event) => setCardNumber(event.target.value)}
            placeholder="TGA-4471120"
            maxLength={40}
            autoFocus
          />
        </Field>

        <Field
          label="تاريخ الانتهاء"
          required
          error={
            localError && cardNumber.trim() && !expiresAt
              ? localError
              : save.isError
                ? save.error.message
                : null
          }
        >
          <TextInput
            type="date"
            latin
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </Field>

        <MissingDataNote>
          الحفظ بيحوّل حالة البطاقة لـ «بانتظار التحقّق» — بعده اضغط «تحقّق» على الكابتن. التحقّق يدوي (إقرار أدمن) لحد
          ما يتوفّر ربط API مباشر مع الهيئة.
        </MissingDataNote>
      </div>
    </Modal>
  );
}
