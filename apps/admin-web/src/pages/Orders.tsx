// كل الطلبات + تدخّل + إلغاء
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import { PageBody, TopBar } from '../components/Shell';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  Loading,
  MissingDataNote,
  Modal,
  Money,
  Pagination,
  Pill,
  RadioDot,
  SearchInput,
  SectionTitle,
  Select,
  TD,
  TH,
  THead,
  TR,
  Table,
  TextInput,
  cx,
  type Tone,
} from '../components/ui';
import { get, patch, post } from '../lib/api';
import { DASH, dateTime, ltr, money, sar, timeOnly } from '../lib/format';
import {
  PAYMENT_METHOD_AR,
  PAYMENT_STATUS_AR,
  PAYMENT_STATUS_TONE,
  REFUND_LIABILITY_META,
  REFUND_LIABILITY_ORDER,
  previewCommissionReversed,
  providerLabel,
  providerNote,
  refundStatusMeta,
  type PaymentDetail,
  type PaymentMethod,
  type PaymentStatus,
  type Refund,
  type RefundLiability,
} from '../lib/payments';
import { EV, useSocketEvent } from '../lib/socket';

// ────────────────────────────────────────────────────────────
// أشكال الـ API الحقيقية — apps/api/src/orders/orders.service.ts#mapOrder
// المبالغ بترجع أرقام (مش نصوص) لأن mapOrder بيعمل Number() على كل Decimal.
// ────────────────────────────────────────────────────────────

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

interface OrderCaptain {
  id: string;
  rating: number;
  plateNumber: string | null;
  vehicleType: string;
  user: { fullName: string; phone: string };
}

interface OrderRow {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  placedAt: string;
  captainId: string | null;
  customer: { user: { fullName: string; phone: string } };
  branch: { id: string; nameAr: string };
  address: { label: string; district: string | null };
  captain: OrderCaptain | null;
}

interface OrderDetail extends OrderRow {
  pickupCode: string;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  vat: number;
  commission: number;
  captainPayout: number;
  customerNotes: string | null;
  prepMinutes: number | null;
  rejectReason: string | null;
  cancelReason: string | null;
  acceptedAt: string | null;
  readyAt: string | null;
  assignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  items: Array<{ id: string; nameAr: string; quantity: number; unitPrice: number; lineTotal: number }>;
}

interface OrdersPage {
  data: OrderRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * الفاتورة الضريبية المبسّطة — GET /invoices/orders/:orderId
 * المصدر: apps/api/src/invoices/invoices.service.ts#invoiceForOrder
 * البائع هو المنصة (مش المطعم)، والـ QR جاي جاهز كـ data-URI فمافيش مكتبة QR في الواجهة.
 */
interface Invoice {
  invoiceNumber: string;
  invoiceType: 'SIMPLIFIED';
  issuedAt: string;
  seller: { name: string; vatNumber: string; vatNumberConfigured: boolean };
  buyer: { name: string };
  restaurant: { nameAr: string; branchAr: string };
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  lines: Array<{ descriptionAr: string; quantity: number; unitPrice: number; lineTotal: number }>;
  deliveryFee: number;
  discount: number;
  totals: { totalExclVat: number; vatTotal: number; totalWithVat: number; vatRate: number };
  qr: { payload: string; image: string };
  note: string;
}

/**
 * الطلب لازم يكون البيع اتمّ فعلاً عشان يبقى ليه فاتورة — نفس شرط `INVOICEABLE`
 * في السيرفر. أي حالة تانية بترجّع 403 «مافيش فاتورة ضريبية لطلب لسه ماتدفعش».
 */
const INVOICEABLE_STATUSES: PaymentStatus[] = ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'];

function isInvoiceable(status: PaymentStatus): boolean {
  return INVOICEABLE_STATUSES.includes(status);
}

// ────────────────────────────────────────────────────────────
// خرائط العرض
// ────────────────────────────────────────────────────────────

interface StatusMeta {
  label: string;
  icon: string;
  tone: Tone;
}

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

const STATUS_ORDER: OrderStatus[] = [
  'PENDING',
  'ACCEPTED',
  'PREPARING',
  'READY',
  'CAPTAIN_ASSIGNED',
  'PICKED_UP',
  'ON_THE_WAY',
  'DELIVERED',
  'REJECTED',
  'CANCELLED',
];

/** «التاريخ» في الشريط العلوي بيتحوّل لـ `from` — الـ API بياخد ISO. */
type DateRange = 'today' | 'week' | 'all';

const DATE_OPTIONS = [
  { value: 'today', label: 'التاريخ: اليوم' },
  { value: 'week', label: 'التاريخ: آخر ٧ أيام' },
  { value: 'all', label: 'التاريخ: الكل' },
];

function rangeToFrom(range: DateRange): string | undefined {
  if (range === 'all') return undefined;

  const date = new Date();
  if (range === 'today') {
    date.setHours(0, 0, 0, 0);
  } else {
    date.setDate(date.getDate() - 7);
  }
  return date.toISOString();
}

const PAGE_SIZE = 25;

// ────────────────────────────────────────────────────────────
// تصدير CSV — من الصفوف المحمّلة فعلاً، مش من السيرفر
// (لا يوجد endpoint تصدير — فالتصدير بيغطي الصفحة الحالية بس)
// ────────────────────────────────────────────────────────────

const CSV_HEADERS = ['رقم الطلب', 'التاريخ', 'العميل', 'الهاتف', 'المطعم', 'الكابتن', 'الإجمالي', 'الدفع', 'الحالة'];

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function buildCsv(rows: OrderRow[]): string {
  const lines = [CSV_HEADERS.map(csvCell).join(',')];

  for (const row of rows) {
    lines.push(
      [
        row.orderNumber,
        dateTime(row.placedAt),
        row.customer?.user?.fullName ?? '',
        row.customer?.user?.phone ?? '',
        row.branch?.nameAr ?? '',
        row.captain?.user?.fullName ?? '',
        money(row.total),
        `${PAYMENT_METHOD_AR[row.paymentMethod] ?? row.paymentMethod} — ${
          PAYMENT_STATUS_AR[row.paymentStatus] ?? row.paymentStatus
        }`,
        STATUS_META[row.status]?.label ?? row.status,
      ]
        .map(csvCell)
        .join(','),
    );
  }

  return lines.join('\r\n');
}

function downloadCsv(rows: OrderRow[]): void {
  // ﻿ = BOM — من غيره إكسل بيفتح العربي بترميز غلط
  const blob = new Blob([`﻿${buildCsv(rows)}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `qadir-orders-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

// ────────────────────────────────────────────────────────────
// الصفحة
// ────────────────────────────────────────────────────────────

export default function Orders() {
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  // «آخر ٧ أيام» افتراضياً: «اليوم» بتبان فاضية في أغلب الأوقات (أول الصبح مثلاً)
  // فالمشغّل يفتكر إن فيه مشكلة، والأسبوع بيدّي صورة أوضح لحركة المنصة.
  const [range, setRange] = useState<DateRange>('week');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const from = rangeToFrom(range);

  const params = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      ...(status ? { status: [status] } : {}),
      ...(from ? { from } : {}),
    }),
    [page, status, from],
  );

  const orders = useQuery({
    queryKey: ['orders', 'list', params],
    queryFn: () => get<OrdersPage>('/orders', params),
  });

  /**
   * أي تغيير حالة بيخلّي الصفحة قديمة.
   * ملحوظة: `order:new` بيتبعت لغرفة الفرع بس في الجيتواي الحالي
   * (tracking.gateway.ts#emitNewOrder) — فالأدمن عملياً بيتحدّث من
   * `order:status_changed`. مشتركين في الاتنين عشان لو الغرفة اتظبطت.
   */
  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
  }, [queryClient]);

  useSocketEvent(EV.ORDER_STATUS_CHANGED, invalidate);
  useSocketEvent(EV.ORDER_NEW, invalidate);

  // البحث محلي على الصفحة المحمّلة — الـ API مافيهوش باراميتر بحث نصي
  const rows = useMemo(() => {
    const all = orders.data?.data ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return all;

    return all.filter(
      (row) =>
        row.orderNumber.toLowerCase().includes(term) ||
        (row.customer?.user?.fullName ?? '').toLowerCase().includes(term) ||
        (row.customer?.user?.phone ?? '').includes(term),
    );
  }, [orders.data, search]);

  const statusOptions = useMemo(
    () => STATUS_ORDER.map((value) => ({ value, label: `الحالة: ${STATUS_META[value].label}` })),
    [],
  );

  return (
    <>
      <TopBar
        title="الطلبات"
        tabs={
          orders.data ? (
            <Chip tone="neutral" count={orders.data.total}>
              إجمالي
            </Chip>
          ) : undefined
        }
        actions={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder="⌕ رقم الطلب / العميل…" width={220} />
            <Select
              value={status}
              onChange={(value) => {
                setStatus(value);
                setPage(1);
                setSelectedId(null);
              }}
              options={statusOptions}
              placeholder="الحالة: الكل"
            />
            <Select
              value={range}
              onChange={(value) => {
                setRange(value as DateRange);
                setPage(1);
                setSelectedId(null);
              }}
              options={DATE_OPTIONS}
            />
            <Button
              variant="dark"
              size="sm"
              icon="⬇"
              disabled={!rows.length}
              title={rows.length ? 'تصدير الصفحة المعروضة' : 'لا توجد صفوف للتصدير'}
              onClick={() => downloadCsv(rows)}
            >
              تصدير
            </Button>
          </>
        }
      />

      <PageBody>
        <div className="flex flex-1 overflow-hidden">
          <Card padding="none" className="flex flex-1 overflow-hidden">
            {/* ── الجدول ── */}
            <div className="flex flex-1 flex-col overflow-hidden p-[14px]">
              <div className="flex flex-1 flex-col overflow-auto">
                <Table gridTemplateColumns="1.2fr 1fr 1.2fr 1fr 0.7fr 0.9fr">
                  <THead>
                    <TH>الطلب</TH>
                    <TH>العميل</TH>
                    <TH>المطعم</TH>
                    <TH>الكابتن</TH>
                    <TH align="end">المبلغ</TH>
                    <TH>الحالة</TH>
                  </THead>

                  {orders.isPending ? (
                    <Loading rows={8} height={44} className="mt-2" />
                  ) : orders.isError ? (
                    <ErrorState message={orders.error.message} onRetry={() => void orders.refetch()} />
                  ) : rows.length === 0 ? (
                    <EmptyState
                      icon="📦"
                      title={search ? 'لا توجد نتائج للبحث' : 'لا توجد طلبات في هذا الفلتر'}
                      description={
                        search
                          ? 'يعمل البحث على الصفحة المعروضة فقط — لا يوجد بحث نصي في الـ API بعد.'
                          : 'غيّر الحالة أو المدى الزمني من الشريط العلوي.'
                      }
                    />
                  ) : (
                    rows.map((row) => {
                      const meta = STATUS_META[row.status];
                      const dead = row.status === 'CANCELLED' || row.status === 'REJECTED';

                      return (
                        <TR
                          key={row.id}
                          selected={row.id === selectedId}
                          muted={dead}
                          onClick={() => setSelectedId(row.id)}
                        >
                          <TD>
                            <span className="font-num font-extrabold" dir="ltr">
                              #{row.orderNumber}
                            </span>
                            <span className="text-faint"> · </span>
                            <span className="font-num text-[11.5px] text-muted" dir="ltr">
                              {timeOnly(row.placedAt)}
                            </span>
                          </TD>
                          <TD>{row.customer?.user?.fullName ?? DASH}</TD>
                          <TD>{row.branch?.nameAr ?? DASH}</TD>
                          <TD muted={!row.captain}>{row.captain?.user?.fullName ?? DASH}</TD>
                          <TD align="end">
                            <Money value={row.total} size="sm" hideCurrency />
                          </TD>
                          <TD>
                            <Pill tone={meta.tone}>
                              {meta.icon} {meta.label}
                            </Pill>
                          </TD>
                        </TR>
                      );
                    })
                  )}
                </Table>
              </div>

              {orders.data ? (
                <Pagination
                  page={page}
                  pageSize={orders.data.pageSize}
                  total={orders.data.total}
                  onChange={(next) => {
                    setPage(next);
                    setSelectedId(null);
                  }}
                />
              ) : null}
            </div>

            {/* ── لوح التفاصيل ── */}
            {selectedId ? (
              <aside className="w-[400px] shrink-0 overflow-auto border-s border-line p-[16px]">
                <OrderDetailPane orderId={selectedId} onClose={() => setSelectedId(null)} />
              </aside>
            ) : null}
          </Card>
        </div>
      </PageBody>
    </>
  );
}

// ────────────────────────────────────────────────────────────
// لوح التفاصيل
// ────────────────────────────────────────────────────────────

interface OrderDetailPaneProps {
  orderId: string;
  onClose: () => void;
}

function OrderDetailPane({ orderId, onClose }: OrderDetailPaneProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [reason, setReason] = useState('');

  const order = useQuery({
    queryKey: ['orders', 'detail', orderId],
    queryFn: () => get<OrderDetail>(`/orders/${orderId}`),
  });

  const payment = useQuery({
    queryKey: ['payments', 'order', orderId],
    queryFn: () => get<PaymentDetail>(`/payments/orders/${orderId}`),
  });

  const cancel = useMutation({
    mutationFn: (cancelReason: string) =>
      patch<OrderDetail>(`/orders/${orderId}/cancel`, cancelReason.trim() ? { reason: cancelReason.trim() } : {}),
    onSuccess: () => {
      setCancelOpen(false);
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      // الإلغاء بعد الدفع بيولّد استرداد تلقائي في السيرفر (refundOnCancel)
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      void queryClient.invalidateQueries({ queryKey: ['refunds'] });
    },
  });

  if (order.isPending) return <Loading rows={6} height={40} />;
  if (order.isError) return <ErrorState message={order.error.message} onRetry={() => void order.refetch()} />;

  const data = order.data;
  const meta = STATUS_META[data.status];
  const closed = data.status === 'DELIVERED' || data.status === 'CANCELLED' || data.status === 'REJECTED';
  const refundBlock = refundBlockReason(payment.data, payment.isError ? payment.error.message : null);
  // الفاتورة الضريبية بتطلع للبيع اللي اتحصّل بس — قبل التحصيل السيرفر بيرجّع 403.
  const canInvoice = isInvoiceable(data.paymentStatus);

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle
        aside={
          <button type="button" onClick={onClose} className="text-[12px] font-extrabold text-muted hover:text-ink">
            ✕
          </button>
        }
      >
        <span className="flex items-center gap-2">
          <span dir="ltr" className="font-num">
            طلب #{data.orderNumber}
          </span>
          <Pill tone={meta.tone}>
            {meta.icon} {meta.label}
          </Pill>
        </span>
      </SectionTitle>

      {/* ── الحقائق ── */}
      <dl className="flex flex-col gap-2 rounded-[13px] bg-soft p-3">
        <Fact label="العميل">
          {data.customer?.user?.fullName ?? DASH}
          {data.customer?.user?.phone ? (
            <span className="font-num text-muted"> · {ltr(data.customer.user.phone)}</span>
          ) : null}
        </Fact>

        <Fact label="المطعم">{data.branch?.nameAr ?? DASH}</Fact>

        <Fact label="الكابتن">
          {data.captain ? (
            <>
              {data.captain.user.fullName}
              <span className="font-num text-muted"> · {ltr(data.captain.rating)}★</span>
            </>
          ) : (
            <span className="text-faint">لسه مااتسندش</span>
          )}
        </Fact>

        <Fact label="الدفع">
          {PAYMENT_METHOD_AR[data.paymentMethod] ?? data.paymentMethod}
          <span className="ms-1.5">
            <Pill tone={PAYMENT_STATUS_TONE[data.paymentStatus] ?? 'neutral'}>
              {PAYMENT_STATUS_AR[data.paymentStatus] ?? data.paymentStatus}
            </Pill>
          </span>
        </Fact>

        <Fact label="الإجمالي">
          <Money value={data.total} size="md" />
        </Fact>
      </dl>

      {/* ── الدفع والاسترداد ── */}
      <PaymentSection query={payment} />

      {/* ── الفاتورة الضريبية — إعادة طباعة الإيصال ── */}
      <div>
        <Button
          variant="outline"
          size="sm"
          block
          icon="🧾"
          disabled={!canInvoice}
          title={canInvoice ? undefined : 'الفاتورة بتتاح بعد تحصيل الدفع'}
          onClick={() => setInvoiceOpen(true)}
        >
          الفاتورة الضريبية
        </Button>
        {!canInvoice ? (
          <MissingDataNote className="mt-1.5">
            الفاتورة الضريبية بتطلع بعد ما الدفع يتحصّل — الطلب ده لسه «{PAYMENT_STATUS_AR[data.paymentStatus]}».
          </MissingDataNote>
        ) : null}
      </div>

      {/* ── الأصناف ── */}
      {data.items?.length ? (
        <ul className="flex flex-col gap-1">
          {data.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 text-[12px] font-bold text-ink">
              <span className="min-w-0 truncate">
                <span className="font-num text-muted">{ltr(item.quantity)}×</span> {item.nameAr}
              </span>
              <Money value={item.lineTotal} size="sm" hideCurrency className="shrink-0 text-muted" />
            </li>
          ))}
        </ul>
      ) : null}

      {/* ── السجل ── */}
      <Timeline order={data} />

      {data.cancelReason || data.rejectReason ? (
        <p className="rounded-[10px] border border-bad-line bg-bad-row px-3 py-2 text-[11.5px] font-bold text-bad-deep">
          السبب: {data.cancelReason ?? data.rejectReason}
        </p>
      ) : null}

      {/* ── الإجراءات ── */}
      <div className="flex flex-col gap-2 border-t border-hair pt-3">
        <Button
          variant="danger"
          size="sm"
          block
          disabled={closed}
          title={closed ? 'الطلب مقفول بالفعل' : undefined}
          onClick={() => setCancelOpen(true)}
        >
          إلغاء الطلب
        </Button>

        <Button
          variant="outline"
          size="sm"
          block
          disabled={Boolean(refundBlock) || payment.isPending}
          title={refundBlock ?? undefined}
          onClick={() => setRefundOpen(true)}
        >
          استرداد مبلغ
        </Button>
        {refundBlock ? <MissingDataNote>{refundBlock}</MissingDataNote> : null}

        <Button variant="dark" size="sm" block icon="🗺" onClick={() => navigate(`/map?order=${data.id}`)}>
          تتبع
        </Button>
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={`إلغاء الطلب #${data.orderNumber}`}
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCancelOpen(false)}>
              رجوع
            </Button>
            <Button variant="danger" size="sm" loading={cancel.isPending} onClick={() => cancel.mutate(reason)}>
              تأكيد الإلغاء
            </Button>
          </>
        }
      >
        <Field
          label="سبب الإلغاء"
          hint="السبب بيتخزّن في سجل الطلب وبيتبعت للمطعم وللكابتن."
          error={cancel.isError ? cancel.error.message : null}
        >
          <TextInput
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="مثلاً: العميل طلب الإلغاء"
            autoFocus
          />
        </Field>
      </Modal>

      {payment.data ? (
        <RefundModal
          open={refundOpen}
          payment={payment.data}
          orderCommission={data.commission}
          hasCaptain={Boolean(data.captainId)}
          onClose={() => setRefundOpen(false)}
          onDone={() => setRefundOpen(false)}
        />
      ) : null}

      <InvoiceModal
        open={invoiceOpen}
        orderId={data.id}
        orderNumber={data.orderNumber}
        onClose={() => setInvoiceOpen(false)}
      />
    </div>
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
// الدفع والاسترداد — GET /payments/orders/:orderId
// ────────────────────────────────────────────────────────────

/**
 * سبب تعطيل زر الاسترداد، أو null لو الزر شغّال.
 *
 * الشيك على `status` قبل الرقم مقصود: السيرفر بيحسب `refundableAmount` من
 * إجمالي الطلب من غير ما يبصّ لحالة الدفع، فالطلب اللي لسه ماتدفعش بيرجّع
 * المبلغ كامل. الرسايل دي شرح للمشغّل بس — قواعد المبالغ نفسها بتتحسب في
 * السيرفر ورسايله بتتعرض زي ما هي في النافذة.
 */
function refundBlockReason(payment: PaymentDetail | undefined, error: string | null): string | null {
  if (error) return error;
  if (!payment) return null;

  if (payment.status === 'PENDING') return 'الطلب لم يُدفَع بعد — الاسترداد يعمل بعد التحصيل فقط.';
  if (payment.status === 'FAILED') return 'فشلت عملية الدفع — لا يوجد مبلغ محصَّل للاسترداد.';
  if (payment.refundableAmount <= 0) return 'لا يوجد باقٍ للاسترداد — استُرد الطلب بالكامل.';

  return null;
}

function PaymentSection({ query }: { query: UseQueryResult<PaymentDetail> }) {
  if (query.isPending) return <Loading rows={3} height={30} />;

  // خطأ مضغوط مش ErrorState — ده قسم جوّه اللوح، مش الصفحة كلها
  if (query.isError) {
    return (
      <p className="rounded-[10px] border border-bad-line bg-bad-row px-3 py-2 text-[11.5px] font-bold text-bad-deep">
        تعذّر تحميل بيانات الدفع: {query.error.message}
      </p>
    );
  }

  const payment = query.data;
  const transaction = payment.transaction;

  return (
    <div>
      <p className="mb-2 text-[12.5px] font-black text-ink">الدفع والاسترداد</p>

      <dl className="flex flex-col gap-2 rounded-[13px] bg-soft p-3">
        {transaction ? (
          <>
            <Fact label="البوابة">{providerLabel(transaction.provider)}</Fact>

            <Fact label="مرجع العملية">
              {transaction.providerRefId ? (
                <bdi className="font-num text-[11.5px]" dir="ltr">
                  {transaction.providerRefId}
                </bdi>
              ) : (
                <span className="text-faint">{DASH}</span>
              )}
            </Fact>

            <Fact label="وقت التحصيل">
              <bdi className="font-num text-[11.5px]" dir="ltr">
                {transaction.paidAt ? dateTime(transaction.paidAt) : DASH}
              </bdi>
            </Fact>
          </>
        ) : null}

        <Fact label="المحصّل">
          <Money value={payment.total} size="sm" />
        </Fact>

        <Fact label="المسترد">
          <Money value={payment.refundedTotal} size="sm" className={payment.refundedTotal ? 'text-bad-deep' : undefined} />
        </Fact>

        <Fact label="الباقي القابل للاسترداد">
          <Money value={payment.refundableAmount} size="sm" />
        </Fact>
      </dl>

      {transaction ? (
        providerNote(transaction.provider) ? (
          <MissingDataNote className="mt-1.5">⚠️ {providerNote(transaction.provider)}</MissingDataNote>
        ) : null
      ) : (
        <MissingDataNote className="mt-1.5">
          مافيش صف عملية دفع للطلب ده — يعني ماعدّاش على أي بوابة أصلاً.
        </MissingDataNote>
      )}

      {/* ── سجل الاستردادات ── */}
      {payment.refunds.length ? (
        <>
          <p className="mb-1.5 mt-3 text-[12px] font-black text-ink">
            الاستردادات <span className="font-num text-muted">({ltr(payment.refunds.length)})</span>
          </p>

          <ul className="flex flex-col gap-1.5">
            {payment.refunds.map((refund) => (
              <RefundEntry key={refund.id} refund={refund} />
            ))}
          </ul>

        </>
      ) : null}
    </div>
  );
}

function RefundEntry({ refund }: { refund: Refund & { createdByName?: string | null } }) {
  const meta = refundStatusMeta(refund);
  const liability = REFUND_LIABILITY_META[refund.liability];

  return (
    <li className="rounded-[10px] border border-hair px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <Money value={-refund.amount} size="sm" className="text-bad-deep" />
        <Pill tone={meta.tone}>{meta.label}</Pill>
      </div>

      {/* جهة التحمّل — دي اللي حرّكت الفلوس فعلاً، فبتبان جنب المبلغ مش مدفونة تحت */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {liability ? (
          <Pill tone={liability.tone} title={liability.note}>
            {liability.label}
          </Pill>
        ) : (
          <Pill tone="neutral">{refund.liability}</Pill>
        )}

        {refund.commissionReversed > 0 ? (
          <span className="text-[11px] font-extrabold text-ok">رجعت عمولة {sar(refund.commissionReversed)}</span>
        ) : null}
      </div>

      <p className="mt-1 text-[11.5px] font-bold leading-snug text-ink">{refund.reasonAr}</p>

      <p className="mt-0.5 font-num text-[11px] font-bold text-muted" dir="ltr">
        {dateTime(refund.createdAt)}
        {refund.providerRefId ? ` · ${refund.providerRefId}` : ''}
      </p>

      {/* مين نفّذه — مسؤولية واضحة على كل قرش راجع. */}
      {refund.createdByName ? (
        <p className="mt-0.5 text-[11px] font-bold text-muted">بواسطة {refund.createdByName}</p>
      ) : null}

      {meta.note ? <p className="mt-1 text-[10.5px] font-bold leading-relaxed text-faint">{meta.note}</p> : null}

      {refund.failReason ? (
        <p className="mt-1 rounded-[8px] border border-bad-line bg-bad-row px-2 py-1 text-[10.5px] font-bold text-bad-deep">
          {refund.failReason}
        </p>
      ) : null}
    </li>
  );
}

// ────────────────────────────────────────────────────────────
// نافذة الاسترداد — POST /payments/orders/:orderId/refund
//
// المبلغ اللي بيتبعت اختياري: لو الحقل فاضي السيرفر بيرد الباقي كله. كل قواعد
// المبالغ (أقصى مبلغ، الطلب المسترد بالكامل، الطلب اللي ماتدفعش) بتتحسب في
// السيرفر ورسايله العربية بتتعرض زي ما هي — مافيش نسخة منها هنا.
//
// `liability` اختياري في الـ DTO والسيرفر بيحطّ NONE لو ماتبعتش — بس هنا
// مطلوب بالقوة: NONE معناها «المنصة بترجّع عمولتها»، وده قرار مالي ماينفعش
// يتاخد بالسكوت لأن المشغّل نسي يختار.
// ────────────────────────────────────────────────────────────

interface RefundModalProps {
  open: boolean;
  payment: PaymentDetail;
  /** عمولة الطلب — للمعاينة بس، الرقم اللي بيتخزّن بيتحسب في السيرفر. */
  orderCommission: number;
  /** الخصم من الكابتن مش بيحصل من غير كابتن متعيّن (executeRefund). */
  hasCaptain: boolean;
  onClose: () => void;
  onDone: () => void;
}

function RefundModal({ open, payment, orderCommission, hasCaptain, onClose, onDone }: RefundModalProps) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [liability, setLiability] = useState<RefundLiability | null>(null);
  // الحقل بقى تلاتة, فالخطأ لازم يعرف مكانه — قبل كده كان واحد تحت «السبب»
  const [localError, setLocalError] = useState<{ field: 'amount' | 'reason' | 'liability'; message: string } | null>(
    null,
  );
  // استرداد فوق الحد بيرجع requiresApproval — ساعتها ماننفّذش الإقفال، بنبيّن
  // إنه اتسجّل ومستني موافقة أدمن تاني بدل ما نوحي إنه اتنفّذ.
  const [awaitingNotice, setAwaitingNotice] = useState(false);

  const refund = useMutation({
    mutationFn: (body: { amount?: number; reason: string; liability: RefundLiability }) =>
      post<Refund>(`/payments/orders/${payment.orderId}/refund`, body),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['payments'] });
      void queryClient.invalidateQueries({ queryKey: ['refunds'] });
      // حالة الدفع في صف الطلب بتتغيّر مع الاسترداد (syncOrderPaymentStatus)
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      // فوق الحد ⇒ اتسجّل بس مااتنفّذش — نسيب النافذة مفتوحة على رسالة الانتظار.
      if (result.requiresApproval) {
        setAwaitingNotice(true);
        return;
      }
      onDone();
    },
  });

  // كل فتحة بتبدأ من الباقي الحالي — الرقم بيقل بعد كل استرداد جزئي.
  // جهة التحمّل بترجع فاضية كل مرة عن قصد — مافيش «آخر اختيار» يتسحب معاه.
  useEffect(() => {
    if (!open) return;
    setAmount(payment.refundableAmount > 0 ? payment.refundableAmount.toFixed(2) : '');
    setReason('');
    setLiability(null);
    setLocalError(null);
    setAwaitingNotice(false);
    refund.reset();
    // بنعتمد على `open` بس: الاسترداد المستني موافقة بيحجز سعة (RESERVING_STATUSES في
    // السيرفر) فبيقلّل refundableAmount بعد التسجيل — لو كانت في الـ deps كانت النافذة
    // هتعمل reset وتمسح رسالة الانتظار. التهيئة وقت الفتح كفاية (الدفع محمّل قبلها).
  }, [open]);

  if (!open) return null;

  const submit = () => {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setLocalError({ field: 'reason', message: 'سبب الاسترداد مطلوب' });
      return;
    }

    if (!liability) {
      setLocalError({
        field: 'liability',
        message: 'اختر من يتحمّل الاسترداد — هذا يحدّد رجوع العمولة والخصم من الكابتن',
      });
      return;
    }

    const trimmedAmount = amount.trim();
    const parsed = trimmedAmount === '' ? undefined : Number(trimmedAmount);
    if (parsed !== undefined && !Number.isFinite(parsed)) {
      setLocalError({ field: 'amount', message: 'المبلغ لازم يكون رقم' });
      return;
    }

    setLocalError(null);
    refund.mutate({ amount: parsed, reason: trimmedReason, liability });
  };

  const gatewayNote = payment.transaction ? providerNote(payment.transaction.provider) : null;

  // المبلغ اللي هيترد فعلاً: الحقل لو مليان، وإلا الباقي كله (زي السيرفر)
  const typedAmount = Number(amount.trim());
  const effectiveAmount = amount.trim() === '' || !Number.isFinite(typedAmount) ? payment.refundableAmount : typedAmount;

  const liabilityMeta = liability ? REFUND_LIABILITY_META[liability] : null;
  const commissionPreview = liability
    ? previewCommissionReversed(liability, effectiveAmount, payment.total, orderCommission)
    : 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={`استرداد مبلغ — طلب #${payment.orderNumber}`}
      footer={
        awaitingNotice ? (
          <Button variant="brand" size="sm" onClick={onDone}>
            تمام
          </Button>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={onClose}>
              رجوع
            </Button>
            <Button variant="danger" size="sm" loading={refund.isPending} onClick={submit}>
              تنفيذ الاسترداد
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-3">
        {awaitingNotice ? (
          <p className="rounded-[10px] border border-gold/30 bg-tint-strong px-3 py-2 text-[12px] font-bold leading-relaxed text-gold-deep">
            ⏳ الاسترداد اتسجّل ومستني موافقة أدمن تاني — مش هيتنفّذ لحد ما يتوافق عليه. تقدر تتابع حالته من «المالية
            والتسويات ← الاستردادات».
          </p>
        ) : null}

        <dl className="flex flex-col gap-2 rounded-[13px] bg-soft p-3">
          <Fact label="طريقة الدفع">{PAYMENT_METHOD_AR[payment.method] ?? payment.method}</Fact>
          <Fact label="المحصّل">
            <Money value={payment.total} size="sm" />
          </Fact>
          <Fact label="المسترد مسبقاً">
            <Money value={payment.refundedTotal} size="sm" />
          </Fact>
          <Fact label="الباقي القابل للاسترداد">
            <Money value={payment.refundableAmount} size="md" />
          </Fact>
        </dl>

        <Field
          label="المبلغ"
          hint={`سيبه فاضي عشان يترد الباقي كله. الباقي دلوقتي ${sar(payment.refundableAmount)}.`}
          error={localError?.field === 'amount' ? localError.message : null}
        >
          <TextInput
            latin
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={money(payment.refundableAmount)}
            autoFocus
          />
        </Field>

        <Field
          label="سبب الاسترداد"
          required
          hint="السبب بيتسجّل مع الصف وبيبان للعميل."
          error={localError?.field === 'reason' ? localError.message : null}
        >
          <TextInput
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="مثلاً: الطلب وصل ناقص صنف"
            maxLength={300}
          />
        </Field>

        {/* ── مين يتحمّل ── */}
        <Field
          label="من يتحمّل الاسترداد"
          required
          hint={liabilityMeta ? undefined : 'لا يوجد اختيار افتراضي — كل قيمة تحرّك المبالغ بشكل مختلف.'}
          error={localError?.field === 'liability' ? localError.message : null}
        >
          <div role="radiogroup" aria-label="جهة تحمّل الاسترداد" className="flex flex-col gap-1.5">
            {REFUND_LIABILITY_ORDER.map((value) => {
              const meta = REFUND_LIABILITY_META[value];
              const selected = liability === value;

              return (
                <RadioDot
                  key={value}
                  checked={selected}
                  onChange={() => {
                    setLiability(value);
                    setLocalError(null);
                  }}
                  label={meta.label}
                  className={cx(
                    'w-full rounded-[10px] border px-2.5 py-2 transition-colors',
                    selected ? 'border-brand bg-tint' : 'border-line hover:border-brand/40',
                  )}
                />
              );
            })}
          </div>
        </Field>

        {/* نتيجة الاختيار — بتبان قبل التأكيد مش بعده */}
        {liabilityMeta ? (
          <div className="rounded-[10px] border border-line bg-soft px-3 py-2">
            <p className="text-[11.5px] font-bold leading-relaxed text-ink">{liabilityMeta.note}</p>

            <p className="mt-1.5 text-[11.5px] font-extrabold text-ink">
              {commissionPreview > 0 ? (
                <>
                  هيرجع للمطعم عمولة <span className="text-ok">{sar(commissionPreview)}</span> تقريباً على{' '}
                  {sar(effectiveAmount)}
                  <span className="font-bold text-faint"> · الرقم النهائي بيتحسب في السيرفر</span>
                </>
              ) : (
                <span className="text-muted">مافيش عمولة بترجع للمطعم مع الاسترداد ده.</span>
              )}
            </p>

            {liability === 'CAPTAIN' && !hasCaptain ? (
              <MissingDataNote className="mt-1.5">
                ⚠️ الطلب ده مالوش كابتن متعيّن — السيرفر مش هيلاقي محفظة يخصم منها، فالاسترداد هيتسجّل «على الكابتن» من
                غير أي خصم فعلي.
              </MissingDataNote>
            ) : null}
          </div>
        ) : null}

        {gatewayNote ? <MissingDataNote>⚠️ {gatewayNote}</MissingDataNote> : null}

        {/* رفض السيرفر — بيتعرض لوحده مش تحت حقل، لأن رسايله بتخصّ الطلب كله
            (حالة الدفع، أقصى مبلغ) مش خانة واحدة. */}
        {refund.isError ? (
          <p className="rounded-[10px] border border-bad-line bg-bad-row px-3 py-2 text-[12px] font-bold text-bad-deep">
            {refund.error.message}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

// ────────────────────────────────────────────────────────────
// Timeline — سجل التغييرات
// كل خطوة مبنية على طابع زمني حقيقي في جدول orders. مافيش اختراع:
// الخطوة اللي طابعها null بتفضل رمادية من غير وقت.
// ────────────────────────────────────────────────────────────

interface Step {
  key: string;
  label: string;
  at: string | null;
  note?: string;
}

function Timeline({ order }: { order: OrderDetail }) {
  const steps: Step[] = [
    { key: 'placed', label: 'استلام الطلب', at: order.placedAt },
    {
      key: 'accepted',
      label: 'قبول المطعم',
      at: order.acceptedAt,
      note: order.prepMinutes ? `وقت تحضير ${ltr(order.prepMinutes)} دقيقة` : undefined,
    },
    { key: 'ready', label: 'جاهز للاستلام', at: order.readyAt },
    { key: 'assigned', label: 'إسناد كابتن', at: order.assignedAt },
    { key: 'picked', label: 'الكابتن استلم الطلب', at: order.pickedUpAt },
  ];

  if (order.cancelledAt) {
    steps.push({ key: 'cancelled', label: 'الطلب اتلغى', at: order.cancelledAt });
  } else {
    steps.push({ key: 'delivered', label: 'تم التسليم', at: order.deliveredAt });
  }

  // آخر خطوة تمّت = الحالة الحالية
  const lastDone = steps.reduce((last, step, index) => (step.at ? index : last), -1);

  return (
    <div>
      <p className="mb-2 text-[12.5px] font-black text-ink">سجل التغييرات</p>

      <ol className="flex flex-col">
        {steps.map((step, index) => {
          const done = Boolean(step.at);
          const current = index === lastDone;
          const isLast = index === steps.length - 1;

          return (
            <li key={step.key} className="flex gap-2.5">
              {/* النقطة + الوصلة */}
              <div className="flex shrink-0 flex-col items-center">
                <span
                  className={cx(
                    'mt-1 h-[10px] w-[10px] shrink-0 rounded-full',
                    !done ? 'bg-line' : current ? 'bg-brand' : 'bg-ok',
                  )}
                  aria-hidden
                />
                {!isLast ? (
                  <span className={cx('w-0 flex-1 border-s-2', done ? 'border-ok' : 'border-line')} aria-hidden />
                ) : null}
              </div>

              <div className={cx('min-w-0 flex-1', isLast ? 'pb-0' : 'pb-3')}>
                <p className={cx('text-[12px] font-extrabold', done ? 'text-ink' : 'text-faint')}>{step.label}</p>
                <p className="font-num text-[11px] font-bold text-muted" dir="ltr">
                  {step.at ? dateTime(step.at) : DASH}
                </p>
                {step.note && done ? <p className="text-[11px] font-bold text-muted">{step.note}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// الفاتورة الضريبية — GET /invoices/orders/:orderId (إعادة طباعة الإيصال)
//
// البيانات كلها جاية جاهزة من السيرفر (بما فيها صورة الـ QR كـ data-URI)،
// فالواجهة بتعرض بس. الطباعة بتشتغل من خلال منطقة طباعة مخفية على الشاشة
// (.invoice-print-root) + قاعدة @media print في index.css بتخفي باقي اللوحة.
// ────────────────────────────────────────────────────────────

interface InvoiceModalProps {
  open: boolean;
  orderId: string;
  orderNumber: string;
  onClose: () => void;
}

function InvoiceModal({ open, orderId, orderNumber, onClose }: InvoiceModalProps) {
  const invoice = useQuery({
    queryKey: ['invoices', 'order', orderId],
    queryFn: () => get<Invoice>(`/invoices/orders/${orderId}`),
    enabled: open,
  });

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        width={560}
        title={
          <span className="flex items-center gap-2">
            <span>الفاتورة الضريبية</span>
            <span dir="ltr" className="font-num text-muted">
              #{orderNumber}
            </span>
          </span>
        }
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={onClose}>
              إغلاق
            </Button>
            <Button
              variant="dark"
              size="sm"
              icon="🖨"
              disabled={!invoice.data}
              title={invoice.data ? undefined : 'استنى تحميل الفاتورة'}
              onClick={() => window.print()}
            >
              طباعة
            </Button>
          </>
        }
      >
        {invoice.isPending ? (
          <Loading rows={7} height={26} />
        ) : invoice.isError ? (
          <ErrorState message={invoice.error.message} onRetry={() => void invoice.refetch()} />
        ) : (
          <InvoiceReceipt data={invoice.data} />
        )}
      </Modal>

      {/* منطقة الطباعة — نسخة تانية من نفس الإيصال، مخفية على الشاشة وبتطلع في الطباعة بس. */}
      {open && invoice.data
        ? createPortal(
            <div className="invoice-print-root hidden">
              <InvoiceReceipt data={invoice.data} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** الإيصال نفسه — بيتعرض في النافذة وبيتطبع زي ما هو. */
function InvoiceReceipt({ data }: { data: Invoice }) {
  const { seller, totals } = data;

  return (
    <div className="mx-auto flex max-w-[520px] flex-col gap-4 text-ink">
      {/* ── الرأس ── */}
      <div className="text-center">
        <p className="text-[18px] font-black">{seller.name}</p>
        <p className="mt-0.5 text-[12px] font-bold text-muted">
          الرقم الضريبي{' '}
          <bdi dir="ltr" className="font-num">
            {seller.vatNumber || DASH}
          </bdi>
        </p>
        <p className="mt-1.5 inline-block rounded-pill border border-line bg-soft px-3 py-1 text-[12px] font-black">
          فاتورة ضريبية مبسّطة
        </p>
      </div>

      {/* ── تحذير الرقم الضريبي غير المظبوط ── */}
      {!seller.vatNumberConfigured ? (
        <p className="rounded-[10px] border border-bad-line bg-bad-row px-3 py-2 text-[11.5px] font-bold leading-relaxed text-bad-deep">
          ⚠️ الرقم الضريبي للبائع مش متظبّط في إعدادات المنصة — الفاتورة دي للعرض بس ومش صالحة رسمياً لحد ما يتضاف رقم
          ضريبي صحيح.
        </p>
      ) : null}

      {/* ── بيانات الفاتورة ── */}
      <dl className="flex flex-col gap-2 rounded-[13px] bg-soft p-3">
        <Fact label="رقم الفاتورة">
          <span dir="ltr" className="font-num">
            #{data.invoiceNumber}
          </span>
        </Fact>
        <Fact label="التاريخ والوقت">
          <span dir="ltr" className="font-num">
            {dateTime(data.issuedAt)}
          </span>
        </Fact>
        <Fact label="المطعم">
          {data.restaurant.nameAr}
          <span className="text-muted"> · {data.restaurant.branchAr}</span>
        </Fact>
        <Fact label="العميل">{data.buyer.name}</Fact>
        <Fact label="طريقة الدفع">
          {PAYMENT_METHOD_AR[data.paymentMethod] ?? data.paymentMethod}
          <span className="ms-1.5">
            <Pill tone={PAYMENT_STATUS_TONE[data.paymentStatus] ?? 'neutral'}>
              {PAYMENT_STATUS_AR[data.paymentStatus] ?? data.paymentStatus}
            </Pill>
          </span>
        </Fact>
      </dl>

      {/* ── الأصناف ── */}
      <Table gridTemplateColumns="1fr 44px 66px 70px">
        <THead>
          <TH>الوصف</TH>
          <TH align="center">كمية</TH>
          <TH align="end">سعر</TH>
          <TH align="end">إجمالي</TH>
        </THead>
        {data.lines.map((line, index) => (
          <TR key={`${line.descriptionAr}-${index}`}>
            <TD>{line.descriptionAr}</TD>
            <TD align="center" numeric>
              {ltr(line.quantity)}
            </TD>
            <TD align="end">
              <Money value={line.unitPrice} size="sm" hideCurrency />
            </TD>
            <TD align="end">
              <Money value={line.lineTotal} size="sm" hideCurrency />
            </TD>
          </TR>
        ))}
      </Table>

      {/* ── الرسوم والخصم والإجماليات ── */}
      <dl className="flex flex-col gap-1.5 rounded-[13px] bg-soft p-3">
        {data.deliveryFee ? (
          <Fact label="رسوم التوصيل">
            <Money value={data.deliveryFee} size="sm" />
          </Fact>
        ) : null}
        {data.discount ? (
          <Fact label="الخصم">
            <Money value={-data.discount} size="sm" className="text-bad-deep" />
          </Fact>
        ) : null}

        <Fact label="الإجمالي بدون ضريبة">
          <Money value={totals.totalExclVat} size="sm" />
        </Fact>
        <Fact label="ضريبة القيمة المضافة ١٥٪">
          <Money value={totals.vatTotal} size="sm" />
        </Fact>

        <div className="mt-0.5 border-t border-line pt-2">
          <Fact label="الإجمالي شامل الضريبة">
            <Money value={totals.totalWithVat} size="md" />
          </Fact>
        </div>
      </dl>

      {/* ── رمز التحقق ── */}
      <div className="flex flex-col items-center gap-1.5 py-1">
        <img
          src={data.qr.image}
          alt="رمز التحقق من الفاتورة"
          width={150}
          height={150}
          className="h-[150px] w-[150px]"
        />
        <p className="text-[11px] font-bold text-muted">امسح للتحقق (هيئة الزكاة والضريبة)</p>
      </div>

      {/* ── إخلاء مسؤولية المرحلة الأولى ── */}
      <MissingDataNote className="text-center">{data.note}</MissingDataNote>
    </div>
  );
}
