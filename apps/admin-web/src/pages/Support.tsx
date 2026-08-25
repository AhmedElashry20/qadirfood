// الشكاوى والدعم — صندوق تذاكر حيّ (قائمة + محادثة) مربوط بموديول /support
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PageBody, TopBar } from '../components/Shell';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Loading,
  Pill,
  SearchInput,
  SectionTitle,
  Select,
  Toggle,
  cx,
  type SelectOption,
  type Tone,
} from '../components/ui';
import { get, patch, post } from '../lib/api';
import { getUser } from '../lib/auth';
import { relativeAr, sar } from '../lib/format';
import { getSocket, useSocketEvent } from '../lib/socket';

// ────────────────────────────────────────────────────────────
// أشكال الـ API — apps/api/src/support/support.service.ts
// (التواريخ نصوص ISO، والأرقام أرقام).
// ────────────────────────────────────────────────────────────

type TicketStatus = 'OPEN' | 'PENDING' | 'ESCALATED' | 'CLOSED';
type TicketCategory = 'ORDER' | 'PAYMENT' | 'DELIVERY' | 'CAPTAIN' | 'APP' | 'OTHER';
type TicketPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
type SenderRole = 'CUSTOMER' | 'AGENT' | 'SYSTEM';

/** GET /support/stats */
interface SupportStats {
  counts: Record<TicketStatus, number>;
  unassigned: number;
  total: number;
}

/** GET /support/tickets — صف في الروستر (رؤية الأدمن فيها بيانات العميل والمسند). */
interface TicketRow {
  id: string;
  ticketNumber: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  orderNumber: string | null;
  createdAt: string;
  lastMessageAt: string;
  customerName: string;
  customerPhone: string;
  assignee: string | null;
}

interface TicketMessage {
  id: string;
  senderRole: SenderRole;
  body: string;
  /** ملاحظة داخلية بين الموظفين — مابتوصلش العميل. */
  internal: boolean;
  createdAt: string;
}

/** GET /support/tickets/:id — التفاصيل + المحادثة. */
interface TicketDetail {
  id: string;
  ticketNumber: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  customer: { name: string; phone: string };
  order: { orderNumber: string; total: number } | null;
  /** id هنا هو userId لموظف الدعم — للمقارنة مع «أنا». */
  assignedTo: { id: string; fullName: string } | null;
  createdAt: string;
  lastMessageAt: string;
  resolvedAt: string | null;
  messages: TicketMessage[];
}

/** GET /admin/users — موظفو اللوحة (بنستخدم منهم الإسناد بس). */
interface StaffMember {
  id: string;
  fullName: string;
  isActive: boolean;
}

// ────────────────────────────────────────────────────────────
// خرائط العرض
// ────────────────────────────────────────────────────────────

interface Meta {
  label: string;
  tone: Tone;
}

/** الحالة — OPEN كهرماني · PENDING محايد · ESCALATED أحمر · CLOSED أخضر (اتحلّت). */
const STATUS_META: Record<TicketStatus, Meta> = {
  OPEN: { label: 'مفتوحة', tone: 'warn' },
  PENDING: { label: 'بانتظار الرد', tone: 'neutral' },
  ESCALATED: { label: 'مصعّدة', tone: 'bad' },
  CLOSED: { label: 'مغلقة', tone: 'ok' },
};

/** الأولوية — URGENT أحمر · HIGH كهرماني · NORMAL/LOW محايد. */
const PRIORITY_META: Record<TicketPriority, Meta> = {
  URGENT: { label: 'عاجلة', tone: 'bad' },
  HIGH: { label: 'عالية', tone: 'warn' },
  NORMAL: { label: 'عادية', tone: 'neutral' },
  LOW: { label: 'منخفضة', tone: 'neutral' },
};

const CATEGORY_AR: Record<TicketCategory, string> = {
  ORDER: 'طلب',
  PAYMENT: 'دفع',
  DELIVERY: 'توصيل',
  CAPTAIN: 'كابتن',
  APP: 'تطبيق',
  OTHER: 'أخرى',
};

/** تبويبات الحالة — نفس ترتيب الأهمية لفريق الدعم. */
const TABS: TicketStatus[] = ['OPEN', 'PENDING', 'ESCALATED', 'CLOSED'];

const CATEGORY_FILTER_OPTIONS: SelectOption[] = (Object.keys(CATEGORY_AR) as TicketCategory[]).map((key) => ({
  value: key,
  label: CATEGORY_AR[key],
}));

/** ترتيب الأولوية من الأعلى للأقل — للفلتر ولتغيير الأولوية. */
const PRIORITY_ORDER: TicketPriority[] = ['URGENT', 'HIGH', 'NORMAL', 'LOW'];

const PRIORITY_OPTIONS: SelectOption[] = PRIORITY_ORDER.map((key) => ({ value: key, label: PRIORITY_META[key].label }));

const SEARCH_DEBOUNCE_MS = 350;

/** رسالة الـ toast حسب الحالة الجديدة اللي اتحوّلنا ليها. */
const STATUS_CHANGE_TOAST: Record<TicketStatus, string> = {
  OPEN: 'تم إعادة فتح التذكرة',
  PENDING: 'التذكرة بقت بانتظار الرد',
  ESCALATED: 'تم تصعيد التذكرة',
  CLOSED: 'تم إقفال التذكرة',
};

interface Toast {
  text: string;
  ok: boolean;
}

// ────────────────────────────────────────────────────────────
// الصفحة
// ────────────────────────────────────────────────────────────

export default function Support() {
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<TicketStatus>('OPEN');
  const [category, setCategory] = useState<'' | TicketCategory>('');
  const [priority, setPriority] = useState<'' | TicketPriority>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  /** id الأدمن الحالي — لاختصار «إسناد ليّا». */
  const currentUserId = getUser()?.id ?? null;

  // البحث بيتبعت للسيرفر (رقم تذكرة/طلب أو موضوع أو اسم عميل) — مأخّر ٣٥٠ms
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const stats = useQuery({
    queryKey: ['support', 'stats'],
    queryFn: () => get<SupportStats>('/support/stats'),
  });

  // موظفو اللوحة للإسناد — نفس مفتاح صفحة الصلاحيات عشان الكاش يتشارك
  const staff = useQuery({
    queryKey: ['team'],
    queryFn: () => get<StaffMember[]>('/admin/users'),
  });

  const activeStaff = useMemo(() => (staff.data ?? []).filter((member) => member.isActive), [staff.data]);

  const params = useMemo(
    () => ({
      status: tab,
      ...(category ? { category } : {}),
      ...(priority ? { priority } : {}),
      ...(search ? { search } : {}),
    }),
    [tab, category, priority, search],
  );

  const tickets = useQuery({
    queryKey: ['support', 'tickets', params],
    queryFn: () => get<TicketRow[]>('/support/tickets', params),
  });

  const rows = tickets.data ?? [];

  // ── التحديث اللحظي — أي حدث تذكرة بيبطّل استعلامات الدعم كلها (خنق خفيف) ──
  const invalidateTimer = useRef<number | undefined>(undefined);
  const liveInvalidate = useCallback(() => {
    if (invalidateTimer.current) return;
    invalidateTimer.current = window.setTimeout(() => {
      invalidateTimer.current = undefined;
      void queryClient.invalidateQueries({ queryKey: ['support'] });
    }, 800);
  }, [queryClient]);

  useEffect(() => () => window.clearTimeout(invalidateTimer.current), []);

  useSocketEvent('ticket:new', liveInvalidate);
  useSocketEvent('ticket:message', liveInvalidate);
  useSocketEvent('ticket:updated', liveInvalidate);

  const showToast = useCallback((text: string, ok = true) => {
    setToast({ text, ok });
    window.setTimeout(() => setToast(null), 3_500);
  }, []);

  const hasFilter = Boolean(category || priority || search);

  return (
    <>
      <TopBar
        title="🎧 الشكاوى والدعم"
        tabs={
          <>
            {TABS.map((key) => (
              <Chip
                key={key}
                tone={STATUS_META[key].tone}
                active={tab === key}
                count={stats.data?.counts[key]}
                onClick={() => {
                  setTab(key);
                  setSelectedId(null);
                }}
              >
                {STATUS_META[key].label}
              </Chip>
            ))}
            {stats.data ? (
              <Pill
                tone={stats.data.unassigned > 0 ? 'warn' : 'neutral'}
                count={stats.data.unassigned}
                title="تذاكر مفتوحة من غير موظف مسند"
              >
                غير مسندة
              </Pill>
            ) : null}
          </>
        }
        actions={
          <>
            <Select
              value={category}
              onChange={(value) => setCategory(value as '' | TicketCategory)}
              options={CATEGORY_FILTER_OPTIONS}
              placeholder="كل التصنيفات"
              title="فلترة حسب التصنيف"
            />
            <Select
              value={priority}
              onChange={(value) => setPriority(value as '' | TicketPriority)}
              options={PRIORITY_OPTIONS}
              placeholder="كل الأولويات"
              title="فلترة حسب الأولوية"
            />
            <SearchInput
              value={searchInput}
              onChange={setSearchInput}
              placeholder="⌕ رقم التذكرة / الطلب / عميل…"
              width={230}
            />
            <LivePill />
          </>
        }
      />

      <PageBody>
        <div className="flex flex-1 gap-3 overflow-hidden">
          {/* ── قائمة التذاكر ── */}
          <Card padding="none" className="flex w-[440px] shrink-0 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-hair p-[14px]">
              <SectionTitle className="mb-0" aside={rows.length ? `${rows.length} تذكرة` : undefined}>
                التذاكر
              </SectionTitle>
            </div>

            <div className="flex-1 overflow-auto p-[14px]">
              {tickets.isPending ? (
                <Loading rows={7} height={92} />
              ) : tickets.isError ? (
                <ErrorState message={tickets.error.message} onRetry={() => void tickets.refetch()} />
              ) : rows.length === 0 ? (
                <EmptyState
                  icon="🎧"
                  title={hasFilter ? 'مافيش تذاكر مطابقة' : `مافيش تذاكر ${STATUS_META[tab].label}`}
                  description={
                    hasFilter
                      ? 'غيّر التصنيف أو الأولوية أو البحث من الشريط العلوي.'
                      : 'أول ما عميل يفتح شكوى في الحالة دي هتبان هنا فوراً.'
                  }
                />
              ) : (
                <ul className="flex flex-col gap-2">
                  {rows.map((row) => (
                    <TicketListItem
                      key={row.id}
                      row={row}
                      selected={row.id === selectedId}
                      onSelect={() => setSelectedId(row.id)}
                    />
                  ))}
                </ul>
              )}
            </div>
          </Card>

          {/* ── المحادثة ── */}
          <Card padding="none" className="flex flex-1 flex-col overflow-hidden">
            {selectedId ? (
              <Conversation
                key={selectedId}
                ticketId={selectedId}
                currentUserId={currentUserId}
                activeStaff={activeStaff}
                onToast={showToast}
              />
            ) : (
              <>
                <div className="shrink-0 border-b border-hair p-[14px]">
                  <SectionTitle className="mb-0">المحادثة</SectionTitle>
                </div>
                <EmptyState
                  icon="💬"
                  title="اختر تذكرة"
                  description="افتح تذكرة من القائمة عشان تشوف المحادثة وترد وتغيّر الحالة والإسناد."
                />
              </>
            )}
          </Card>
        </div>
      </PageBody>

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
// مؤشر الاتصال «● مباشر» — نفس نمط مركز التحكم
// ────────────────────────────────────────────────────────────

function LivePill() {
  const [connected, setConnected] = useState(() => getSocket()?.connected ?? false);
  useSocketEvent('connect', () => setConnected(true));
  useSocketEvent('disconnect', () => setConnected(false));
  useEffect(() => {
    setConnected(getSocket()?.connected ?? false);
  }, []);

  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-[3px] text-[11.5px] font-extrabold',
        connected ? 'border-ok/30 bg-ok-tint text-ok' : 'border-line bg-chip text-muted',
      )}
    >
      <span className="relative flex h-[7px] w-[7px]">
        {connected ? (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok-bright opacity-75" />
        ) : null}
        <span className={cx('relative inline-flex h-[7px] w-[7px] rounded-full', connected ? 'bg-ok-bright' : 'bg-muted')} />
      </span>
      {connected ? 'مباشر' : 'غير متصل'}
    </span>
  );
}

// ────────────────────────────────────────────────────────────
// صف تذكرة في القائمة
// ────────────────────────────────────────────────────────────

function TicketListItem({ row, selected, onSelect }: { row: TicketRow; selected: boolean; onSelect: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cx(
          'w-full rounded-[12px] border p-3 text-start transition-colors',
          selected ? 'border-brand bg-tint-soft' : 'border-hair hover:bg-soft',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <bdi className="font-num text-[12px] font-extrabold text-ink" dir="ltr">
            {row.ticketNumber}
          </bdi>
          <span className="shrink-0 text-[10.5px] font-bold text-faint">{relativeAr(row.lastMessageAt)}</span>
        </div>

        <p className="mt-1 truncate text-[12.5px] font-extrabold text-ink">{row.subject}</p>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Pill tone={PRIORITY_META[row.priority].tone}>{PRIORITY_META[row.priority].label}</Pill>
          <Pill tone="neutral">{CATEGORY_AR[row.category]}</Pill>
          {row.orderNumber ? (
            <span className="inline-flex items-center gap-1 rounded-pill bg-chip px-2 py-px text-[10.5px] font-extrabold text-label">
              طلب
              <bdi className="font-num" dir="ltr">
                #{row.orderNumber}
              </bdi>
            </span>
          ) : null}
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px]">
          <span className="min-w-0 truncate font-bold text-muted">
            {row.customerName}
            <span className="text-faint"> · </span>
            <bdi className="font-num" dir="ltr">
              {row.customerPhone}
            </bdi>
          </span>
          <span className={cx('shrink-0 font-extrabold', row.assignee ? 'text-ink' : 'text-faint')}>
            {row.assignee ?? 'غير مسندة'}
          </span>
        </div>
      </button>
    </li>
  );
}

// ────────────────────────────────────────────────────────────
// لوح المحادثة — تفاصيل + شريط إجراءات + خيط الرسائل + مؤلّف الرد
// ────────────────────────────────────────────────────────────

interface ConversationProps {
  ticketId: string;
  currentUserId: string | null;
  /** موظفو اللوحة النشطون — خيارات إسناد التذكرة. */
  activeStaff: StaffMember[];
  onToast: (text: string, ok?: boolean) => void;
}

function Conversation({ ticketId, currentUserId, activeStaff, onToast }: ConversationProps) {
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);

  const detail = useQuery({
    queryKey: ['support', 'ticket', ticketId],
    queryFn: () => get<TicketDetail>(`/support/tickets/${ticketId}`),
  });

  /** بعد أي عملية: حدّث التفاصيل فوراً من رد السيرفر + بطّل باقي استعلامات الدعم. */
  const applyDetail = useCallback(
    (data: TicketDetail) => {
      queryClient.setQueryData(['support', 'ticket', ticketId], data);
      void queryClient.invalidateQueries({ queryKey: ['support'] });
    },
    [queryClient, ticketId],
  );

  const reply = useMutation({
    mutationFn: (payload: { body: string; internal: boolean }) =>
      post<TicketDetail>(`/support/tickets/${ticketId}/messages`, payload),
    onSuccess: (data, variables) => {
      applyDetail(data);
      setBody('');
      setInternal(false);
      onToast(variables.internal ? 'اتسجّلت الملاحظة الداخلية' : 'اترسل الرد للعميل');
    },
    onError: (error: Error) => onToast(error.message, false),
  });

  const changeStatus = useMutation({
    mutationFn: (status: TicketStatus) => patch<TicketDetail>(`/support/tickets/${ticketId}`, { status }),
    onSuccess: (data, status) => {
      applyDetail(data);
      onToast(STATUS_CHANGE_TOAST[status]);
    },
    onError: (error: Error) => onToast(error.message, false),
  });

  const changePriority = useMutation({
    mutationFn: (priority: TicketPriority) => patch<TicketDetail>(`/support/tickets/${ticketId}`, { priority }),
    onSuccess: (data, priority) => {
      applyDetail(data);
      onToast(`الأولوية اتغيّرت لـ ${PRIORITY_META[priority].label}`);
    },
    onError: (error: Error) => onToast(error.message, false),
  });

  const changeAssignment = useMutation({
    mutationFn: (assignedToId: string | null) =>
      patch<TicketDetail>(`/support/tickets/${ticketId}`, { assignedToId }),
    onSuccess: (data) => {
      applyDetail(data);
      onToast(data.assignedTo ? `اتسندت التذكرة لـ ${data.assignedTo.fullName}` : 'تم فك الإسناد');
    },
    onError: (error: Error) => onToast(error.message, false),
  });

  // نزّل الخيط لآخره مع كل رسالة جديدة
  const messageCount = detail.data?.messages.length ?? 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messageCount]);

  if (detail.isPending) {
    return (
      <>
        <div className="shrink-0 border-b border-hair p-[14px]">
          <SectionTitle className="mb-0">المحادثة</SectionTitle>
        </div>
        <Loading variant="spinner" label="جارِ فتح التذكرة…" />
      </>
    );
  }

  if (detail.isError) {
    return (
      <>
        <div className="shrink-0 border-b border-hair p-[14px]">
          <SectionTitle className="mb-0">المحادثة</SectionTitle>
        </div>
        <ErrorState message={detail.error.message} onRetry={() => void detail.refetch()} />
      </>
    );
  }

  const d = detail.data;
  const closed = d.status === 'CLOSED';
  const assignedToMe = Boolean(currentUserId && d.assignedTo?.id === currentUserId);

  // خيارات الإسناد — «بدون» + الموظفون النشطون. لو المسند الحالي مش في القائمة
  // (اتعطّل بعد الإسناد) بنضيفه عشان الاختيار يفضل باين صح.
  const assigneeOptions: SelectOption[] = [
    { value: '', label: '— بدون إسناد —' },
    ...(d.assignedTo && !activeStaff.some((member) => member.id === d.assignedTo?.id)
      ? [{ value: d.assignedTo.id, label: `${d.assignedTo.fullName} (موقوف)` }]
      : []),
    ...activeStaff.map((member) => ({ value: member.id, label: member.fullName })),
  ];

  const send = () => {
    const text = body.trim();
    if (!text) return;
    reply.mutate({ body: text, internal });
  };

  const statusPending = (status: TicketStatus) => changeStatus.isPending && changeStatus.variables === status;

  return (
    <>
      {/* ── رأس التذكرة + شريط الإجراءات ── */}
      <div className="shrink-0 border-b border-hair p-[14px]">
        <div className="flex flex-wrap items-center gap-2">
          <bdi className="font-num text-[12px] font-extrabold text-ink" dir="ltr">
            {d.ticketNumber}
          </bdi>
          <Pill tone={STATUS_META[d.status].tone}>{STATUS_META[d.status].label}</Pill>
          <Pill tone={PRIORITY_META[d.priority].tone}>{PRIORITY_META[d.priority].label}</Pill>
          <Pill tone="neutral">{CATEGORY_AR[d.category]}</Pill>
        </div>

        <h2 className="mt-1.5 text-[15px] font-black text-ink">{d.subject}</h2>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] font-bold text-muted">
          <span>
            {d.customer.name}
            <span className="text-faint"> · </span>
            <bdi className="font-num" dir="ltr">
              {d.customer.phone}
            </bdi>
          </span>
          {d.order ? (
            <span>
              طلب{' '}
              <bdi className="font-num text-ink" dir="ltr">
                #{d.order.orderNumber}
              </bdi>{' '}
              · {sar(d.order.total)}
            </span>
          ) : null}
          <span>فُتحت {relativeAr(d.createdAt)}</span>
          <span>
            الإسناد:{' '}
            <span className={d.assignedTo ? 'text-ink' : 'text-faint'}>{d.assignedTo?.fullName ?? 'غير مسندة'}</span>
          </span>
        </div>

        {/* شريط الإجراءات */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* الحالة */}
          {d.status !== 'ESCALATED' && d.status !== 'CLOSED' ? (
            <Button
              variant="danger"
              size="sm"
              loading={statusPending('ESCALATED')}
              onClick={() => changeStatus.mutate('ESCALATED')}
            >
              ⚠ تصعيد
            </Button>
          ) : null}
          {d.status === 'ESCALATED' ? (
            <Button
              variant="outline"
              size="sm"
              loading={statusPending('OPEN')}
              onClick={() => changeStatus.mutate('OPEN')}
            >
              إرجاع لمفتوحة
            </Button>
          ) : null}
          {!closed ? (
            <Button variant="dark" size="sm" loading={statusPending('CLOSED')} onClick={() => changeStatus.mutate('CLOSED')}>
              ✓ إقفال
            </Button>
          ) : (
            <Button variant="brand" size="sm" loading={statusPending('OPEN')} onClick={() => changeStatus.mutate('OPEN')}>
              ↻ إعادة فتح
            </Button>
          )}

          <span className="mx-0.5 h-5 w-px bg-hair" aria-hidden />

          {/* الأولوية */}
          <label className="flex items-center gap-1.5 text-[11px] font-extrabold text-label">
            الأولوية
            <Select
              value={d.priority}
              onChange={(value) => changePriority.mutate(value as TicketPriority)}
              options={PRIORITY_OPTIONS}
              disabled={changePriority.isPending}
              title="تغيير أولوية التذكرة"
            />
          </label>

          <span className="mx-0.5 h-5 w-px bg-hair" aria-hidden />

          {/* الإسناد — قائمة الموظفين النشطين + اختصار «إسناد ليّا» */}
          <label className="flex items-center gap-1.5 text-[11px] font-extrabold text-label">
            الإسناد
            <Select
              value={d.assignedTo?.id ?? ''}
              onChange={(value) => changeAssignment.mutate(value === '' ? null : value)}
              options={assigneeOptions}
              disabled={changeAssignment.isPending}
              title="إسناد التذكرة لموظف"
            />
          </label>
          {!assignedToMe && currentUserId ? (
            <Button
              variant="outline"
              size="sm"
              loading={changeAssignment.isPending && changeAssignment.variables === currentUserId}
              onClick={() => changeAssignment.mutate(currentUserId)}
            >
              إسناد ليّا
            </Button>
          ) : null}
        </div>
      </div>

      {/* ── خيط الرسائل ── */}
      <div ref={scrollRef} className="flex-1 overflow-auto bg-canvas p-[14px]">
        <ul className="flex flex-col gap-2.5">
          {d.messages.map((message) => (
            <ThreadMessage key={message.id} message={message} />
          ))}
        </ul>
      </div>

      {/* ── مؤلّف الرد ── */}
      <div className="shrink-0 border-t border-hair p-[14px]">
        {closed ? (
          <div className="flex items-center gap-2 rounded-[12px] bg-soft px-3 py-3 text-[12px] font-bold text-muted">
            🔒 التذكرة مقفولة — اضغط «إعادة فتح» فوق عشان ترد من جديد.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();
                  send();
                }
              }}
              rows={3}
              placeholder={internal ? 'ملاحظة داخلية للفريق — مابتوصلش العميل…' : 'اكتب ردّك للعميل…'}
              className={cx(
                'w-full resize-none rounded-[10px] border bg-surface p-3 text-[12.5px] font-bold text-ink outline-none transition-colors placeholder:font-bold placeholder:text-faint',
                internal ? 'border-gold/40 focus:border-gold' : 'border-line focus:border-brand',
              )}
            />
            <div className="flex items-center justify-between gap-3">
              <Toggle checked={internal} onChange={setInternal} label="ملاحظة داخلية" />
              <span className="flex items-center gap-2.5">
                <span className="hidden text-[10.5px] font-bold text-faint sm:inline">Ctrl + Enter للإرسال</span>
                <Button variant="brand" size="sm" loading={reply.isPending} disabled={!body.trim()} onClick={send}>
                  {internal ? 'سجّل الملاحظة' : 'إرسال'}
                </Button>
              </span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────
// رسالة في الخيط — العميل يمين، الدعم شمال، النظام في النص، الداخلية كهرمانية
// ────────────────────────────────────────────────────────────

function ThreadMessage({ message }: { message: TicketMessage }) {
  if (message.senderRole === 'SYSTEM') {
    return (
      <li className="flex justify-center">
        <span className="rounded-pill bg-chip px-3 py-1 text-center text-[10.5px] font-bold text-muted">
          {message.body}
          <span className="text-faint"> · {relativeAr(message.createdAt)}</span>
        </span>
      </li>
    );
  }

  const isAgent = message.senderRole === 'AGENT';

  return (
    <li className={cx('flex', isAgent ? 'justify-end' : 'justify-start')}>
      <div
        className={cx(
          'max-w-[80%] rounded-[13px] border px-3 py-2',
          message.internal
            ? 'border-gold/30 bg-tint-strong'
            : isAgent
              ? 'border-brand/30 bg-tint-soft'
              : 'border-hair bg-soft',
        )}
      >
        {message.internal ? (
          <span className="mb-1 block text-[10px] font-black text-gold-deep">🔒 ملاحظة داخلية</span>
        ) : null}
        <p className="whitespace-pre-wrap break-words text-[12.5px] font-bold leading-relaxed text-ink">
          {message.body}
        </p>
        <span className="mt-1 block text-[10px] font-bold text-faint">
          {isAgent ? 'الدعم' : 'العميل'} · {relativeAr(message.createdAt)}
        </span>
      </div>
    </li>
  );
}
