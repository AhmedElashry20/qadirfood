// المحافظ والسحب — طلبات السحب الحقيقية + اعتماد/رفض
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PageBody, TopBar } from '../components/Shell';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  KpiCard,
  Loading,
  MissingDataNote,
  Modal,
  Money,
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
import { get, patch } from '../lib/api';
import { DASH, dateTime, ltr, money, relativeAr, num } from '../lib/format';

// ────────────────────────────────────────────────────────────
// أشكال الـ API — apps/api/src/captains/captains.service.ts
// (AdminWithdrawalView / CaptainListItemView)
// ────────────────────────────────────────────────────────────

type WithdrawalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'TRANSFERRED';
type PayoutDestination = 'BANK' | 'STC_PAY';

interface WithdrawalRow {
  id: string;
  captainId: string;
  captainName: string;
  captainPhone: string;
  amount: number;
  status: WithdrawalStatus;
  destination: PayoutDestination;
  /** مقنّع من السيرفر — «•••• 7519». */
  destinationRef: string;
  rejectReason: string | null;
  reviewedAt: string | null;
  transferredAt: string | null;
  createdAt: string;
}

interface WithdrawalsPage {
  data: WithdrawalRow[];
  total: number;
  page: number;
  pageSize: number;
}

interface CaptainBalanceRow {
  id: string;
  walletBalance: number;
}

interface CaptainsPage {
  data: CaptainBalanceRow[];
  total: number;
  page: number;
  pageSize: number;
}

// ────────────────────────────────────────────────────────────
// خرائط العرض
// ────────────────────────────────────────────────────────────

interface StatusMeta {
  label: string;
  tone: Tone;
}

const STATUS_META: Record<WithdrawalStatus, StatusMeta> = {
  PENDING: { label: 'قيد المراجعة', tone: 'warn' },
  APPROVED: { label: 'تم التحويل', tone: 'ok' },
  TRANSFERRED: { label: 'تم التحويل', tone: 'ok' },
  REJECTED: { label: 'مرفوض', tone: 'bad' },
};

const DESTINATION_AR: Record<PayoutDestination, string> = {
  BANK: 'حساب بنكي',
  STC_PAY: 'STC Pay',
};

const TABS: Array<{ value: '' | WithdrawalStatus; label: string; tone: Tone }> = [
  { value: 'PENDING', label: 'طلبات معلّقة', tone: 'warn' },
  { value: 'APPROVED', label: 'تمت الموافقة', tone: 'ok' },
  { value: 'REJECTED', label: 'مرفوضة', tone: 'bad' },
  { value: '', label: 'الكل', tone: 'neutral' },
];

const PAGE_SIZE = 25;

/** أقصى `pageSize` بيقبله الـ API (PaginationDto @Max(100)). */
const BALANCE_SAMPLE = 100;

function isSettled(status: WithdrawalStatus): boolean {
  return status === 'APPROVED' || status === 'TRANSFERRED';
}

// ────────────────────────────────────────────────────────────
// تصدير CSV — من الصفحة المحمّلة بس
// ────────────────────────────────────────────────────────────

const CSV_HEADERS = [
  'الكابتن',
  'الجوال',
  'المبلغ',
  'الوجهة',
  'رقم الحساب (مقنّع)',
  'الحالة',
  'تاريخ الطلب',
  'تاريخ التحويل',
  'سبب الرفض',
];

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function buildCsv(rows: WithdrawalRow[]): string {
  const lines = [CSV_HEADERS.map(csvCell).join(',')];

  for (const row of rows) {
    lines.push(
      [
        row.captainName,
        row.captainPhone,
        money(row.amount),
        DESTINATION_AR[row.destination] ?? row.destination,
        row.destinationRef ?? '',
        STATUS_META[row.status]?.label ?? row.status,
        dateTime(row.createdAt),
        row.transferredAt ? dateTime(row.transferredAt) : '',
        row.rejectReason ?? '',
      ]
        .map(csvCell)
        .join(','),
    );
  }

  return lines.join('\r\n');
}

function downloadCsv(rows: WithdrawalRow[]): void {
  // ﻿ = BOM — من غيره إكسل بيفتح العربي بترميز غلط
  const blob = new Blob([`﻿${buildCsv(rows)}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `qadir-withdrawals-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

// ────────────────────────────────────────────────────────────
// الصفحة
// ────────────────────────────────────────────────────────────

export default function Wallets() {
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<'' | WithdrawalStatus>('PENDING');
  const [page, setPage] = useState(1);
  const [rejecting, setRejecting] = useState<WithdrawalRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const params = useMemo(
    () => ({ page, pageSize: PAGE_SIZE, ...(status ? { status } : {}) }),
    [page, status],
  );

  const withdrawals = useQuery({
    queryKey: ['withdrawals', 'list', params],
    queryFn: () => get<WithdrawalsPage>('/captains/withdrawals/pending', params),
  });

  /**
   * عدد الطلبات المعلّقة الحقيقي — بيلزم في المؤشر الأول حتى لما التبويب
   * المفتوح يكون «مرفوضة» أو «الكل». نداء خفيف بصفحة واحدة عشان `total` بس.
   */
  const pendingCount = useQuery({
    queryKey: ['withdrawals', 'pending-total'],
    queryFn: () => get<WithdrawalsPage>('/captains/withdrawals/pending', { status: 'PENDING', page: 1, pageSize: 1 }),
  });

  /**
   * مافيش endpoint بيجمّع أرصدة كل الكباتن — فبنجمع أول ١٠٠ كابتن من
   * `GET /captains` (أقصى pageSize مسموح) وبنقول ده صراحةً في البطاقة.
   */
  const balances = useQuery({
    queryKey: ['captains', 'balances-sample', BALANCE_SAMPLE],
    queryFn: () => get<CaptainsPage>('/captains', { page: 1, pageSize: BALANCE_SAMPLE }),
    staleTime: 60_000,
  });

  const rows = withdrawals.data?.data ?? [];

  // ── مجاميع الصفحة المحمّلة ──
  const pendingAmount = useMemo(
    () => rows.filter((row) => row.status === 'PENDING').reduce((sum, row) => sum + row.amount, 0),
    [rows],
  );

  const transferredAmount = useMemo(
    () => rows.filter((row) => isSettled(row.status)).reduce((sum, row) => sum + row.amount, 0),
    [rows],
  );

  const balancesTotal = useMemo(
    () => (balances.data?.data ?? []).reduce((sum, captain) => sum + captain.walletBalance, 0),
    [balances.data],
  );

  const balancesCount = balances.data?.data.length ?? 0;
  const balancesAll = balances.data?.total ?? 0;

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3_000);
  };

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['withdrawals'] });
    // الاعتماد بيخصم من رصيد الكابتن — فالأرصدة وقايمة الكباتن بقوا قدام
    void queryClient.invalidateQueries({ queryKey: ['captains'] });
  };

  const approve = useMutation({
    mutationFn: (id: string) => patch<WithdrawalRow>(`/captains/withdrawals/${id}/approve`),
    onSuccess: () => {
      invalidate();
      showToast('تم اعتماد طلب السحب وخصم المبلغ');
    },
  });

  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      patch<WithdrawalRow>(`/captains/withdrawals/${id}/reject`, { reason }),
    onSuccess: () => {
      setRejecting(null);
      invalidate();
      showToast('تم رفض طلب السحب');
    },
  });

  return (
    <>
      <TopBar
        title="المحافظ والسحب"
        tabs={TABS.map((tab) => (
          <Chip
            key={tab.value || 'all'}
            tone={tab.tone}
            active={status === tab.value}
            count={status === tab.value ? withdrawals.data?.total : undefined}
            onClick={() => {
              setStatus(tab.value);
              setPage(1);
            }}
          >
            {tab.label}
          </Chip>
        ))}
        actions={
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
        }
      />

      <PageBody>
        {/* ── المؤشرات ── */}
        <div className="grid shrink-0 grid-cols-3 gap-3">
          <KpiCard
            label="طلبات سحب معلّقة"
            value={pendingCount.isPending ? '…' : num(pendingCount.data?.total)}
            delta={pendingAmount ? `${money(pendingAmount)} ر.س` : undefined}
            deltaTone="neutral"
            note="العدد من السيرفر · المبلغ مجموع الصفحة المحمّلة"
            inverted
          />

          <KpiCard
            label="حُوّل (من الصفحة المحمّلة)"
            value={<Money value={transferredAmount} size="xl" hideCurrency />}
            note="مجموع الطلبات المعتمدة/المحوّلة في الصفحة المعروضة — مش إجمالي الشهر، مافيش endpoint تجميعي"
          />

          <KpiCard
            label="إجمالي أرصدة الكباتن"
            value={
              balances.isPending ? '…' : balances.isError ? DASH : <Money value={balancesTotal} size="xl" hideCurrency />
            }
            note={
              balances.isError
                ? 'تعذّر تحميل الأرصدة'
                : `من أول ${ltr(num(balancesCount))} كابتن من إجمالي ${ltr(num(balancesAll))} — مافيش endpoint تجميعي`
            }
          />
        </div>

        <div className="flex flex-1 overflow-hidden">
          <Card padding="none" className="flex flex-1 flex-col overflow-hidden">
            <div className="flex flex-1 flex-col overflow-hidden p-[14px]">
              <div className="flex flex-1 flex-col overflow-auto">
                <Table gridTemplateColumns="1.3fr 0.9fr 1.1fr 1.1fr 0.9fr 1fr">
                  <THead>
                    <TH>الكابتن</TH>
                    <TH align="end">المبلغ</TH>
                    <TH>الوجهة</TH>
                    <TH>تاريخ الطلب</TH>
                    <TH>الحالة</TH>
                    <TH>إجراء</TH>
                  </THead>

                  {withdrawals.isPending ? (
                    <Loading rows={8} height={44} className="mt-2" />
                  ) : withdrawals.isError ? (
                    <ErrorState message={withdrawals.error.message} onRetry={() => void withdrawals.refetch()} />
                  ) : rows.length === 0 ? (
                    <EmptyState
                      icon="👛"
                      title="مافيش طلبات سحب في الفلتر ده"
                      description="غيّر حالة الطلبات من الشريط العلوي."
                    />
                  ) : (
                    rows.map((row) => {
                      const meta = STATUS_META[row.status];
                      const pending = row.status === 'PENDING';
                      const busy = approve.isPending && approve.variables === row.id;

                      return (
                        <TR key={row.id} muted={row.status === 'REJECTED'}>
                          <TD>
                            <span className="font-extrabold">{row.captainName}</span>
                            <span className="text-faint"> · </span>
                            <bdi className="font-num text-[11.5px] text-muted" dir="ltr">
                              {row.captainPhone}
                            </bdi>
                          </TD>

                          <TD align="end">
                            <Money value={row.amount} size="sm" hideCurrency />
                          </TD>

                          <TD>
                            {DESTINATION_AR[row.destination] ?? row.destination}
                            {row.destinationRef ? (
                              <bdi className="font-num text-muted" dir="ltr">
                                {' '}
                                · {row.destinationRef}
                              </bdi>
                            ) : null}
                          </TD>

                          <TD>
                            <bdi className="font-num text-[11.5px]" dir="ltr">
                              {dateTime(row.createdAt)}
                            </bdi>
                            <span className="block text-[11px] font-bold text-muted">{relativeAr(row.createdAt)}</span>
                          </TD>

                          <TD>
                            <Pill tone={meta.tone}>{meta.label}</Pill>
                          </TD>

                          <TD>
                            {pending ? (
                              <span className="flex items-center gap-1.5">
                                <Button
                                  variant="brand"
                                  size="sm"
                                  loading={busy}
                                  disabled={approve.isPending || reject.isPending}
                                  onClick={() => approve.mutate(row.id)}
                                >
                                  موافقة ✓
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={approve.isPending}
                                  className="border-bad-line text-bad-deep"
                                  onClick={() => setRejecting(row)}
                                >
                                  رفض
                                </Button>
                              </span>
                            ) : row.status === 'REJECTED' ? (
                              <span className="block truncate text-[11.5px] font-bold text-bad-deep">
                                {row.rejectReason || 'مرفوض من غير سبب مسجّل'}
                              </span>
                            ) : (
                              <bdi className="font-num text-[11.5px] font-bold text-muted" dir="ltr">
                                {row.transferredAt ? dateTime(row.transferredAt) : DASH}
                              </bdi>
                            )}
                          </TD>
                        </TR>
                      );
                    })
                  )}
                </Table>
              </div>

              {approve.isError ? (
                <p className="mt-2 rounded-[10px] border border-bad-line bg-bad-row px-3 py-2 text-[11.5px] font-bold text-bad-deep">
                  {approve.error.message}
                </p>
              ) : null}

              {withdrawals.data ? (
                <Pagination
                  page={page}
                  pageSize={withdrawals.data.pageSize}
                  total={withdrawals.data.total}
                  onChange={setPage}
                />
              ) : null}

              <MissingDataNote className="pt-2">
                الرصيد بيتخصم عند الموافقة مش عند الطلب — الطلب المعلّق بيحجز المبلغ بس. الطلبات مرتّبة من الأقدم
                للأحدث (FIFO) زي ما السيرفر بيرجّعها.
              </MissingDataNote>
            </div>
          </Card>
        </div>
      </PageBody>

      <RejectModal
        row={rejecting}
        onClose={() => setRejecting(null)}
        isPending={reject.isPending}
        error={reject.isError ? reject.error.message : null}
        onSubmit={(reason) => {
          if (!rejecting) return;
          reject.mutate({ id: rejecting.id, reason });
        }}
      />

      {toast ? (
        <div className="fixed bottom-6 start-6 z-[60] rounded-[12px] bg-ink px-4 py-3 text-[12.5px] font-extrabold text-white shadow-float">
          ✓ {toast}
        </div>
      ) : null}
    </>
  );
}

// ────────────────────────────────────────────────────────────
// نافذة الرفض — السبب إلزامي في الـ API
// ────────────────────────────────────────────────────────────

interface RejectModalProps {
  row: WithdrawalRow | null;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  isPending: boolean;
  error: string | null;
}

function RejectModal({ row, onClose, onSubmit, isPending, error }: RejectModalProps) {
  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setReason('');
    setLocalError(null);
  }, [row]);

  if (!row) return null;

  const submit = () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setLocalError('سبب الرفض مطلوب');
      return;
    }
    setLocalError(null);
    onSubmit(trimmed);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`رفض طلب سحب — ${row.captainName}`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            رجوع
          </Button>
          <Button variant="danger" size="sm" loading={isPending} onClick={submit}>
            تأكيد الرفض
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <dl className="flex flex-col gap-2 rounded-[13px] bg-soft p-3 text-[12.5px]">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="font-extrabold text-label">المبلغ</dt>
            <dd className="font-bold text-ink">
              <Money value={row.amount} size="md" />
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="font-extrabold text-label">الوجهة</dt>
            <dd className="min-w-0 truncate text-end font-bold text-ink">
              {DESTINATION_AR[row.destination] ?? row.destination}
              {row.destinationRef ? (
                <bdi className="font-num text-muted" dir="ltr">
                  {' '}
                  · {row.destinationRef}
                </bdi>
              ) : null}
            </dd>
          </div>
        </dl>

        <Field
          label="سبب الرفض"
          required
          hint="الرفض ما بيغيّرش رصيد الكابتن — بيقفل الطلب بس، والسبب بيوصله في تطبيقه."
          error={localError ?? error}
        >
          <TextInput
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="مثلاً: الآيبان مش مطابق لاسم الكابتن"
            maxLength={300}
            autoFocus
          />
        </Field>
      </div>
    </Modal>
  );
}
