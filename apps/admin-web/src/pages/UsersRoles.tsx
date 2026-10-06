// الصلاحيات والمستخدمون — إدارة موظفي اللوحة + صلاحيات مفصّلة لكل موظف + سجل تدقيق
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
  Loading,
  MissingDataNote,
  Modal,
  Pagination,
  Pill,
  SearchInput,
  SectionTitle,
  TD,
  TH,
  THead,
  TR,
  Table,
  TextInput,
  Toggle,
  cx,
  type Tone,
} from '../components/ui';
import { get, patch, post, put } from '../lib/api';
import { useSession } from '../lib/auth';
import { dateOnly, dateTime, num, sar } from '../lib/format';
import { REFUND_LIABILITY_AR, type RefundLiability } from '../lib/payments';

// ────────────────────────────────────────────────────────────
// الصفحة
//
// الدور في قاعدة البيانات enum من أربع قيم (UserRole) وبيتشيك عليه بـ @Roles،
// وفوقه بقى فيه طبقة صلاحيات مفصّلة لكل موظف لوحة: `User.permissions` مصفوفة
// مفاتيح بيتفحصها PermissionsGuard من قاعدة البيانات مع كل طلب (مش من التوكن)،
// فأي تعديل بيسري فوراً. والسجل العام (GET /audit) بيقيّد كل عملية حسّاسة.
//
// ⚠️ القاعدة الأهم: مصفوفة الصلاحيات **الفاضية = صلاحية كاملة** (سوبر أدمن) —
// مش «بدون صلاحيات». دي الحالة الافتراضية للحسابات الموجودة عشان ما تتقفلش.
// ────────────────────────────────────────────────────────────

/** كتالوج الصلاحيات — GET /admin/users/permissions/catalog (المفتاح بيتخزّن، واللابل عربي من السيرفر). */
interface PermissionOption {
  key: string;
  label: string;
}

/** رد PUT /admin/users/:id/permissions. */
interface PermissionsUpdate {
  id: string;
  fullName: string;
  permissions: string[];
  fullAccess: boolean;
}

/**
 * شرح مختصر لكل مفتاح — إيه اللي بيفتحه فعلاً على السيرفر. الأسماء نفسها بتيجي
 * من الكتالوج، ده الوصف بس. كل المفاتيح دي متطبّقة على مساراتها بـ
 * `@RequirePermission` — مافيش مفتاح معروض من غير فحص حقيقي وراه.
 */
const PERMISSION_NOTES: Record<string, string> = {
  'orders.cancel': 'إلغاء طلب من شاشة الطلبات (الأدمن) — متطبّقة على السيرفر؛ العميل بيلغي طلبه عادي',
  'payments.refund': 'إنشاء استرداد كامل/جزئي والموافقة على الاسترداد الكبير — متطبّقة على السيرفر',
  'finance.settle': 'تشغيل دورة التسوية وتسجيل التحويل البنكي — متطبّقة على السيرفر',
  'compliance.review': 'مراجعة الوثائق واعتماد/رفض سيلفي التحقق — متطبّقة على السيرفر',
  'users.manage': 'إضافة وتعديل موظفي اللوحة وضبط صلاحياتهم — متطبّقة على السيرفر',
};

/** مفتاح كاش الكتالوج — بعيد عن ['team'] عشان إبطال قائمة الموظفين ما يجرّهوش معاه. */
const PERMISSION_CATALOG_KEY = ['permissions', 'catalog'] as const;

/** الكتالوج ثابت — بنجيبه مرة ونشاركه بين الجدول والمحرّر والدليل. */
function usePermissionCatalog(enabled = true) {
  return useQuery({
    queryKey: PERMISSION_CATALOG_KEY,
    queryFn: () => get<PermissionOption[]>('/admin/users/permissions/catalog'),
    staleTime: Infinity,
    enabled,
  });
}

// ────────────────────────────────────────────────────────────
// سجل التدقيق — GET /audit?action&entityType&entityId&page&pageSize
// سجل غير قابل للتعديل بيقيّد كل عملية مال/حساب حسّاسة من الأدمن.
// كل المبالغ أرقام، و summaryAr نص عربي جاهز للعرض جاي من السيرفر.
// ────────────────────────────────────────────────────────────

type AuditAction =
  | 'REFUND_CREATE'
  | 'REFUND_APPROVE'
  | 'REFUND_REJECT'
  | 'REFUND_SETTLE'
  | 'REFUND_RETRY'
  | 'SETTLEMENT_RUN'
  | 'SETTLEMENT_TRANSFER'
  | 'PAYOUT_ACCOUNT_SAVE'
  | 'WITHDRAWAL_APPROVE'
  | 'WITHDRAWAL_REJECT'
  | 'DOCUMENT_REVIEW';

type ActorRole = 'ADMIN' | 'CUSTOMER' | 'CAPTAIN' | 'MERCHANT';

interface AuditEntry {
  id: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  /** نص عربي جاهز للعرض — هو السطر الأساسي في كل صف. */
  summaryAr: string;
  /** تفاصيل مركّبة بتختلف حسب الإجراء (مبلغ، تحمّل، رقم طلب…) أو null. */
  metadata: Record<string, unknown> | null;
  /** اسم الفاعل — «مدير المنصة» أو «النظام» لو مافيش فاعل. */
  actorName: string;
  actorRole: ActorRole;
  createdAt: string;
}

interface AuditPage {
  data: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
}

// ────────────────────────────────────────────────────────────
// خرائط العرض — زي SETTLEMENT_STATUS_META في صفحة التسويات
//
// النغمة بتتبع خطورة العملية: العمليات اللي بتطلّع فلوس فعلاً (استرداد،
// اعتماد سحب، تحويل تسوية) بنغمة لافتة، والعمليات القابلة للرجوع/المحايدة
// (رفض سحب، مراجعة وثيقة) بنغمة هادية.
// ────────────────────────────────────────────────────────────

const ACTION_META: Record<AuditAction, { label: string; tone: Tone }> = {
  REFUND_CREATE: { label: 'استرداد', tone: 'bad' },
  // الموافقة بتطلّع الفلوس فعلاً (بتنفّذ الاسترداد الكبير) — نغمة لافتة زي الإنشاء.
  REFUND_APPROVE: { label: 'موافقة على استرداد', tone: 'bad' },
  SETTLEMENT_TRANSFER: { label: 'تحويل تسوية', tone: 'bad' },
  WITHDRAWAL_APPROVE: { label: 'اعتماد سحب', tone: 'bad' },
  // الرفض بيوقف صرف فلوس — عملية مالية مهمة بس مش بتحرّك فلوس، فنغمة تنبيه.
  REFUND_REJECT: { label: 'رفض موافقة استرداد', tone: 'warn' },
  REFUND_SETTLE: { label: 'تسوية استرداد', tone: 'warn' },
  REFUND_RETRY: { label: 'إعادة استرداد', tone: 'warn' },
  PAYOUT_ACCOUNT_SAVE: { label: 'حساب استلام', tone: 'warn' },
  SETTLEMENT_RUN: { label: 'دورة تسوية', tone: 'brand' },
  WITHDRAWAL_REJECT: { label: 'رفض سحب', tone: 'neutral' },
  DOCUMENT_REVIEW: { label: 'مراجعة وثيقة', tone: 'neutral' },
};

const ROLE_META: Record<ActorRole, { label: string; tone: Tone }> = {
  ADMIN: { label: 'مدير المنصة', tone: 'brand' },
  MERCHANT: { label: 'مدير مطعم', tone: 'neutral' },
  CAPTAIN: { label: 'كابتن', tone: 'neutral' },
  CUSTOMER: { label: 'عميل', tone: 'neutral' },
};

/** فلتر الإجراء — نفس نمط شرائح RefundsCard: الكل + التسع إجراءات. */
const AUDIT_FILTERS: Array<{ value: '' | AuditAction; label: string; tone: Tone }> = [
  { value: '', label: 'الكل', tone: 'neutral' },
  ...(Object.keys(ACTION_META) as AuditAction[]).map((action) => ({
    value: action,
    label: ACTION_META[action].label,
    tone: ACTION_META[action].tone,
  })),
];

const AUDIT_PAGE_SIZE = 30;

// ── عرض الـ metadata: بنطلّع الحقول المفيدة بس (من غير UUIDs ولا مصفوفات) ──

const META_LABELS: Record<string, string> = {
  amount: 'المبلغ',
  liability: 'التحمّل',
  orderNumber: 'رقم الطلب',
  reason: 'السبب',
  netPayout: 'صافي التسوية',
  transferRef: 'مرجع الحوالة',
  bankName: 'البنك',
  ibanMasked: 'الآيبان',
  generated: 'عدد التسويات',
  periodEnd: 'حتى تاريخ',
};

/** ترتيب عرض المفاتيح المعروفة — أي مفتاح مش هنا بيتحط بعدهم. */
const META_ORDER = Object.keys(META_LABELS);

/** المفاتيح اللي قيمتها لاتينية (رقم/مرجع) — بتترسم LTR بخط الأرقام. */
const META_LATIN = new Set(['orderNumber', 'transferRef', 'ibanMasked', 'periodEnd']);

function formatMetaValue(key: string, value: unknown): string {
  if (key === 'amount' || key === 'netPayout') return sar(value as number);
  if (key === 'generated') return num(value as number);
  if (key === 'periodEnd') return dateOnly(value as string);
  if (key === 'liability') return REFUND_LIABILITY_AR[value as RefundLiability] ?? String(value);
  return String(value);
}

interface MetaRow {
  key: string;
  label: string;
  value: string;
  latin: boolean;
}

/**
 * بيحوّل الـ metadata لسطور عرض نضيفة: بيشيل الـ null والمصفوفات والكائنات
 * والمفاتيح اللي بتنتهي بـ Id (معرّفات داخلية مالهاش لازمة للأدمن)، وبيرتّب
 * المعروف الأول. الـ summaryAr هو السطر الآدمي — ده تفصيل مساند بس.
 */
function metaRows(metadata: Record<string, unknown> | null): MetaRow[] {
  if (!metadata) return [];

  return Object.entries(metadata)
    .filter(
      ([key, value]) => value !== null && value !== undefined && typeof value !== 'object' && !/id$/i.test(key),
    )
    .sort(([a], [b]) => {
      const ia = META_ORDER.indexOf(a);
      const ib = META_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })
    .map(([key, value]) => ({
      key,
      label: META_LABELS[key] ?? key,
      value: formatMetaValue(key, value),
      latin: META_LATIN.has(key),
    }));
}

// ────────────────────────────────────────────────────────────
// موظفو اللوحة — GET/POST /admin/users · PATCH /admin/users/:id
// موظف اللوحة = مستخدم بدور ADMIN. الأنواع التانية بتتدار من موديولاتها.
// (التواريخ نصوص ISO، والأرقام أرقام.)
// ────────────────────────────────────────────────────────────

interface Staff {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  isActive: boolean;
  createdAt: string;
  /** عدد تذاكر الدعم المسندة له والمفتوحة (مش مقفولة). */
  openTickets: number;
  /** مفاتيح الصلاحيات المسموح بيها — **الفاضية معناها صلاحية كاملة**. */
  permissions: string[];
  /** مختصر السيرفر لـ `permissions.length === 0` — يعني سوبر أدمن بدون قيود. */
  fullAccess: boolean;
}

// ────────────────────────────────────────────────────────────
// الصفحة
// ────────────────────────────────────────────────────────────

type View = 'roles' | 'audit';

interface Toast {
  text: string;
  ok: boolean;
}

export default function UsersRoles() {
  const [view, setView] = useState<View>('roles');
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Staff | null>(null);
  const [permissionsTarget, setPermissionsTarget] = useState<Staff | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = (text: string, ok = true) => {
    setToast({ text, ok });
    window.setTimeout(() => setToast(null), 3_500);
  };

  return (
    <>
      <TopBar
        title="الصلاحيات والمستخدمون"
        tabs={
          <>
            <Chip tone={view === 'roles' ? 'brand' : 'neutral'} active={view === 'roles'} onClick={() => setView('roles')}>
              الأدوار والصلاحيات
            </Chip>
            <Chip tone={view === 'audit' ? 'brand' : 'neutral'} active={view === 'audit'} onClick={() => setView('audit')}>
              سجل التدقيق
            </Chip>
          </>
        }
        actions={
          view === 'roles' ? (
            <>
              <SearchInput value={search} onChange={setSearch} placeholder="⌕ اسم / بريد / هاتف…" width={220} />
              <Button variant="brand" size="sm" icon="＋" onClick={() => setAddOpen(true)}>
                مستخدم جديد
              </Button>
            </>
          ) : undefined
        }
      />

      <PageBody>
        {view === 'audit' ? (
          <AuditLog />
        ) : (
          <>
            <Card padding="md">
              <MissingDataNote>
                إدارة حقيقية لموظفي اللوحة (إضافة، تعديل الاسم، إعادة كلمة المرور، تفعيل/تعطيل الدخول) + صلاحيات مفصّلة
                لكل موظف بيتشيك عليها السيرفر مع كل طلب. الأدوار نفسها enum في قاعدة البيانات (
                <span className="num">CUSTOMER/CAPTAIN/MERCHANT/ADMIN</span>) — وكل موظف لوحة دوره{' '}
                <span className="num">ADMIN</span>، والصلاحيات هي اللي بتحدّد يعمل إيه بالظبط. انتبه: قايمة صلاحيات فاضية
                = <span className="font-extrabold text-ink">صلاحية كاملة</span> (سوبر أدمن) مش «بدون صلاحيات» — ودي حالة
                الحسابات القديمة الافتراضية. كل تغيير متسجّل في «سجل التدقيق».
              </MissingDataNote>
            </Card>

            <div className="flex flex-1 gap-3 overflow-hidden">
              {/* ── موظفو اللوحة ── */}
              <TeamSection
                search={search}
                onEdit={setEditTarget}
                onPermissions={setPermissionsTarget}
                onToast={showToast}
              />

              {/* ── دليل الصلاحيات + السجل ── */}
              <div className="flex w-[420px] shrink-0 flex-col gap-3 overflow-auto">
                <PermissionsLegend />

                {/* السجل بقى حقيقي — البطاقة دي بتوصّل لتبويبه الكامل */}
                <Card padding="lg" className="flex flex-col gap-3">
                  <SectionTitle aside="شغّال">سجل التدقيق</SectionTitle>

                  <p className="text-[12px] font-bold leading-relaxed text-muted">
                    بقى فيه سجل تدقيق حقيقي بيقيّد كل عملية مالية أو تعديل حساب حسّاس (استرداد، تسوية، تحويل بنكي، حساب
                    استلام، سحب، مراجعة وثيقة، وإدارة الموظفين) — مين عملها وإمتى، وغير قابل للتعديل أو المسح.
                  </p>

                  <Button variant="outline" size="sm" onClick={() => setView('audit')}>
                    افتح سجل التدقيق
                  </Button>
                </Card>
              </div>
            </div>
          </>
        )}
      </PageBody>

      {/* ── نوافذ إضافة/تعديل موظف ── */}
      <AddStaffModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onDone={(message) => {
          setAddOpen(false);
          showToast(message);
        }}
      />
      <EditStaffModal
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onDone={(message) => {
          setEditTarget(null);
          showToast(message);
        }}
      />

      {/* ── محرّر صلاحيات موظف ── */}
      <PermissionsModal
        target={permissionsTarget}
        onClose={() => setPermissionsTarget(null)}
        onDone={(message) => {
          setPermissionsTarget(null);
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
// قسم موظفي اللوحة — جدول حقيقي مربوط بـ GET /admin/users
// ────────────────────────────────────────────────────────────

interface TeamSectionProps {
  /** بحث من الشريط العلوي — فلترة محلية بالاسم/البريد/الهاتف. */
  search: string;
  onEdit: (staff: Staff) => void;
  onPermissions: (staff: Staff) => void;
  onToast: (text: string, ok?: boolean) => void;
}

function TeamSection({ search, onEdit, onPermissions, onToast }: TeamSectionProps) {
  const team = useQuery({
    queryKey: ['team'],
    queryFn: () => get<Staff[]>('/admin/users'),
  });

  // الصفوف بترجع مفاتيح بس — الأسماء العربية من الكتالوج.
  const catalog = usePermissionCatalog();
  const labels = useMemo(() => {
    const map: Record<string, string> = {};
    for (const option of catalog.data ?? []) map[option.key] = option.label;
    return map;
  }, [catalog.data]);

  const all = team.data ?? [];
  const query = search.trim().toLowerCase();
  const rows = query
    ? all.filter(
        (staff) =>
          staff.fullName.toLowerCase().includes(query) ||
          staff.email.toLowerCase().includes(query) ||
          staff.phone.includes(query),
      )
    : all;

  return (
    <Card padding="none" className="flex flex-[1.5] flex-col overflow-hidden">
      <div className="shrink-0 p-[14px] pb-0">
        <SectionTitle aside={team.data ? `${num(all.length)} موظف` : 'شغّال'}>موظفو اللوحة</SectionTitle>
      </div>

      <div className="flex flex-1 flex-col overflow-auto p-[14px] pt-0">
        <Table gridTemplateColumns="1.7fr 0.9fr 0.7fr 0.8fr 0.65fr 1.25fr 1.7fr">
          <THead>
            <TH>الموظف</TH>
            <TH>الهاتف</TH>
            <TH align="center">تذاكر مفتوحة</TH>
            <TH>أُضيف</TH>
            <TH>الحالة</TH>
            <TH>الصلاحيات</TH>
            <TH align="end">إجراءات</TH>
          </THead>

          {team.isPending ? (
            <Loading rows={6} height={44} className="mt-2" />
          ) : team.isError ? (
            <ErrorState message={team.error.message} onRetry={() => void team.refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon="👥"
              title={query ? 'لا يوجد موظف مطابق للبحث' : 'لا يوجد موظفون بعد'}
              description={
                query
                  ? 'غيّر كلمة البحث من الشريط العلوي.'
                  : 'أضف أول موظف لوحة من زر «مستخدم جديد» فوق — بيقدر يدخل بالبريد وكلمة المرور.'
              }
            />
          ) : (
            rows.map((staff) => (
              <StaffRow
                key={staff.id}
                staff={staff}
                labels={labels}
                onEdit={onEdit}
                onPermissions={onPermissions}
                onToast={onToast}
              />
            ))
          )}
        </Table>

        <MissingDataNote className="pt-2">
          كل موظفي اللوحة دورهم <span className="num">ADMIN</span>، والفرق بينهم في الصلاحيات المفصّلة: «صلاحية كاملة»
          معناها قايمته فاضية فبيعمل أي عملية، وأي مفاتيح محدّدة معناها إنه مقصور عليها والسيرفر بيرفض غيرها. غيّرها من
          زر «الصلاحيات». تعطيل الموظف بيمنعه من الدخول فوراً، وكل إضافة/تعديل متسجّلة في «سجل التدقيق».
        </MissingDataNote>
      </div>
    </Card>
  );
}

// ── صف موظف — تفعيل/تعطيل فوري (PATCH isActive) + زر تعديل ──

interface StaffRowProps {
  staff: Staff;
  /** مفتاح الصلاحية → اسمها العربي من الكتالوج. */
  labels: Record<string, string>;
  onEdit: (staff: Staff) => void;
  onPermissions: (staff: Staff) => void;
  onToast: (text: string, ok?: boolean) => void;
}

function StaffRow({ staff, labels, onEdit, onPermissions, onToast }: StaffRowProps) {
  const queryClient = useQueryClient();

  const toggle = useMutation({
    mutationFn: (isActive: boolean) => patch<Staff>(`/admin/users/${staff.id}`, { isActive }),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ['team'] });
      onToast(updated.isActive ? `تم تفعيل ${updated.fullName}` : `تم تعطيل ${updated.fullName}`);
    },
    onError: (error: Error) => onToast(error.message, false),
  });

  // أسماء الصلاحيات الممنوحة — للـ tooltip والسطر المختصر تحت العدّاد.
  const granted = staff.permissions.map((key) => labels[key] ?? key).join(' · ');

  return (
    <TR muted={!staff.isActive}>
      <TD>
        <span className="font-extrabold text-ink">{staff.fullName}</span>
        <bdi className="mt-0.5 block truncate font-num text-[11px] font-bold text-muted" dir="ltr">
          {staff.email}
        </bdi>
      </TD>

      <TD numeric>{staff.phone}</TD>

      <TD align="center">
        {staff.openTickets > 0 ? (
          <Pill tone="warn" title="تذاكر دعم مسندة ومفتوحة">
            {num(staff.openTickets)}
          </Pill>
        ) : (
          <span className="font-num text-[12px] font-bold text-faint">{num(0)}</span>
        )}
      </TD>

      <TD numeric>{dateOnly(staff.createdAt)}</TD>

      <TD>
        <Pill tone={staff.isActive ? 'ok' : 'neutral'}>{staff.isActive ? 'مفعّل' : 'موقوف'}</Pill>
      </TD>

      {/* الوصول — «صلاحية كاملة» معناها القايمة فاضية (بدون قيود)، مش بدون صلاحيات */}
      <TD>
        {staff.fullAccess ? (
          <Pill tone="warn" title="قائمة الصلاحيات فارغة — وصول كامل لكل العمليات (مسؤول أعلى)">
            صلاحية كاملة
          </Pill>
        ) : (
          <>
            <Pill tone="brand" title={granted}>
              {`${num(staff.permissions.length)} صلاحية`}
            </Pill>
            <span className="mt-0.5 block truncate text-[10.5px] font-bold text-muted" title={granted}>
              {granted}
            </span>
          </>
        )}
      </TD>

      <TD align="end">
        <span className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onPermissions(staff)}>
            الصلاحيات
          </Button>
          <Button variant="outline" size="sm" onClick={() => onEdit(staff)}>
            تعديل
          </Button>
          <Toggle
            checked={staff.isActive}
            disabled={toggle.isPending}
            onChange={(next) => toggle.mutate(next)}
            className="shrink-0"
          />
        </span>
      </TD>
    </TR>
  );
}

// ── نافذة إضافة موظف — POST /admin/users ──

interface AddStaffModalProps {
  open: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}

/** يطابق CreateStaffDto: اسم ٢-٦٠، بريد، جوال سعودي (٠+٩ أرقام)، كلمة مرور ٦+. */
const SAUDI_PHONE = /^0\d{9}$/;

function AddStaffModal({ open, onClose, onDone }: AddStaffModalProps) {
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  // كل ما نفتح النافذة نرجّع الفورم فاضي
  useEffect(() => {
    if (!open) return;
    setFullName('');
    setEmail('');
    setPhone('');
    setPassword('');
    setLocalError(null);
  }, [open]);

  const save = useMutation({
    mutationFn: (body: { fullName: string; email: string; phone: string; password: string }) =>
      post<Staff>('/admin/users', body),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['team'] });
      onDone(`تمت إضافة ${created.fullName}`);
    },
  });

  if (!open) return null;

  const submit = () => {
    const name = fullName.trim();
    const mail = email.trim();
    const tel = phone.trim();
    if (name.length < 2) {
      setLocalError('الاسم الكامل مطلوب (حرفين على الأقل)');
      return;
    }
    if (!mail) {
      setLocalError('البريد الإلكتروني مطلوب');
      return;
    }
    if (!SAUDI_PHONE.test(tel)) {
      setLocalError('رقم جوال سعودي غير صحيح (٠ + ٩ أرقام)');
      return;
    }
    if (password.length < 6) {
      setLocalError('كلمة المرور لازم تكون ٦ أحرف على الأقل');
      return;
    }
    setLocalError(null);
    save.mutate({ fullName: name, email: mail, phone: tel, password });
  };

  return (
    <Modal
      open
      onClose={onClose}
      width={480}
      title="إضافة موظف لوحة"
      footer={
        <>
          <Button variant="ghost" size="sm" disabled={save.isPending} onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="brand" size="sm" loading={save.isPending} onClick={submit}>
            إضافة الموظف
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="الاسم الكامل" required>
          <TextInput
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="سارة الدعم"
            maxLength={60}
            autoFocus
          />
        </Field>

        <Field label="البريد الإلكتروني" required hint="بيستخدمه للدخول للوحة — لازم يكون فريد.">
          <TextInput
            latin
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="sara@delivery.sa"
            maxLength={120}
          />
        </Field>

        <Field label="رقم الجوال" required hint="صيغة سعودية: ٠ + ٩ أرقام (مثال 0512345678) — لازم يكون فريد.">
          <TextInput
            latin
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="0512345678"
            maxLength={10}
          />
        </Field>

        <Field label="كلمة المرور" required hint="٦ أحرف على الأقل — الموظف يقدر يغيّرها بعدين.">
          <TextInput
            latin
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••"
            maxLength={72}
          />
        </Field>

        {localError || save.isError ? (
          <p className="text-[11.5px] font-bold text-bad">{localError ?? save.error?.message}</p>
        ) : null}

        <MissingDataNote>
          الموظف الجديد دوره <span className="num">ADMIN</span> وبيبدأ بقايمة صلاحيات فاضية — يعني{' '}
          <span className="font-extrabold text-ink">صلاحية كاملة (بدون قيود)</span>. قيّده بعد الإضافة من زر «الصلاحيات»
          على صفّه. الإضافة متسجّلة في سجل التدقيق.
        </MissingDataNote>
      </div>
    </Modal>
  );
}

// ── نافذة تعديل موظف — PATCH /admin/users/:id (اسم / إعادة كلمة مرور) ──

interface EditStaffModalProps {
  target: Staff | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

function EditStaffModal({ target, onClose, onDone }: EditStaffModalProps) {
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const staffId = target?.id ?? null;

  // كل ما نفتح موظف جديد نرجّع الفورم لقيمه الحالية
  useEffect(() => {
    setFullName(target?.fullName ?? '');
    setPassword('');
    setLocalError(null);
  }, [target]);

  const save = useMutation({
    mutationFn: (body: { fullName?: string; password?: string }) =>
      patch<Staff>(`/admin/users/${staffId ?? ''}`, body),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ['team'] });
      onDone(`تم تحديث ${updated.fullName}`);
    },
  });

  if (!target) return null;

  const submit = () => {
    const name = fullName.trim();
    if (name.length < 2) {
      setLocalError('الاسم الكامل مطلوب (حرفين على الأقل)');
      return;
    }
    if (password && password.length < 6) {
      setLocalError('كلمة المرور لازم تكون ٦ أحرف على الأقل');
      return;
    }

    const body: { fullName?: string; password?: string } = {};
    if (name !== target.fullName) body.fullName = name;
    if (password) body.password = password;

    if (body.fullName === undefined && body.password === undefined) {
      setLocalError('لا يوجد تغيير — عدّل الاسم أو اكتب كلمة مرور جديدة');
      return;
    }

    setLocalError(null);
    save.mutate(body);
  };

  return (
    <Modal
      open
      onClose={onClose}
      width={460}
      title={`تعديل موظف — ${target.fullName}`}
      footer={
        <>
          <Button variant="ghost" size="sm" disabled={save.isPending} onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="brand" size="sm" loading={save.isPending} onClick={submit}>
            حفظ التعديلات
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="الاسم الكامل" required>
          <TextInput
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            maxLength={60}
            autoFocus
          />
        </Field>

        <Field label="إعادة تعيين كلمة المرور" hint="اتركها فارغة إن لم ترد تغييرها — ٦ أحرف على الأقل.">
          <TextInput
            latin
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••"
            maxLength={72}
          />
        </Field>

        {/* البريد والهاتف بيتعرضوا للقراءة بس — الـ API مابيعدّلهمش */}
        <div className="flex flex-col gap-1.5 rounded-[10px] bg-soft p-3 text-[11.5px] font-bold text-muted">
          <div className="flex items-center justify-between gap-3">
            <span>البريد</span>
            <bdi className="truncate font-num text-ink" dir="ltr">
              {target.email}
            </bdi>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>الهاتف</span>
            <bdi className="font-num text-ink" dir="ltr">
              {target.phone}
            </bdi>
          </div>
        </div>

        {localError || save.isError ? (
          <p className="text-[11.5px] font-bold text-bad">{localError ?? save.error?.message}</p>
        ) : null}

        <MissingDataNote>البريد والهاتف مش قابلين للتعديل من هنا. أي تعديل متسجّل في سجل التدقيق.</MissingDataNote>
      </div>
    </Modal>
  );
}

// ────────────────────────────────────────────────────────────
// محرّر صلاحيات موظف — PUT /admin/users/:id/permissions
// كل مفتاح مفتوح = مسموح. كل المفاتيح مقفولة = مصفوفة فاضية = صلاحية كاملة.
// ────────────────────────────────────────────────────────────

interface PermissionsModalProps {
  target: Staff | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

function PermissionsModal({ target, onClose, onDone }: PermissionsModalProps) {
  const queryClient = useQueryClient();
  const { user } = useSession();

  const [selected, setSelected] = useState<string[]>([]);

  const staffId = target?.id ?? null;
  const catalog = usePermissionCatalog(target !== null);

  const save = useMutation({
    mutationFn: (permissions: string[]) =>
      put<PermissionsUpdate>(`/admin/users/${staffId ?? ''}/permissions`, { permissions }),
    onSuccess: (updated) => {
      void queryClient.invalidateQueries({ queryKey: ['team'] });
      onDone(
        updated.fullAccess
          ? `${updated.fullName} بقى بصلاحية كاملة (بدون قيود)`
          : `اتحفظت صلاحيات ${updated.fullName} — ${num(updated.permissions.length)} صلاحية`,
      );
    },
  });

  // كل ما نفتح موظف جديد نبدأ من صلاحياته الحالية ونمسح خطأ الحفظ القديم
  const { reset } = save;
  useEffect(() => {
    setSelected(target?.permissions ?? []);
    reset();
  }, [target, reset]);

  if (!target) return null;

  const options = catalog.data ?? [];
  const fullAccess = selected.length === 0;

  /**
   * السيرفر بيرفض (٤٠٣) إن الأدمن يقيّد نفسه من غير «إدارة المستخدمين» — بنمنعها
   * قبل الإرسال، والرسالة الراجعة من السيرفر بتتعرض تحت لو حصلت برضه.
   */
  const selfLockout = user?.id === target.id && selected.length > 0 && !selected.includes('users.manage');

  const toggle = (key: string, on: boolean) =>
    setSelected((current) => (on ? [...current, key] : current.filter((entry) => entry !== key)));

  return (
    <Modal
      open
      onClose={onClose}
      width={520}
      title={`صلاحيات — ${target.fullName}`}
      footer={
        <>
          <Button variant="ghost" size="sm" disabled={save.isPending} onClick={onClose}>
            إلغاء
          </Button>
          <Button
            variant="brand"
            size="sm"
            loading={save.isPending}
            disabled={selfLockout || catalog.isPending || catalog.isError}
            onClick={() => save.mutate(selected)}
          >
            حفظ الصلاحيات
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {/* الحالة اللي هتتحفظ دلوقتي — بتوضّح دلالة «كل المفاتيح مقفولة» */}
        <div className={cx('rounded-[10px] border p-3', fullAccess ? 'border-brand/40 bg-tint' : 'border-line bg-soft')}>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={fullAccess ? 'warn' : 'brand'}>
              {fullAccess ? 'صلاحية كاملة' : `${num(selected.length)} صلاحية`}
            </Pill>
            <span className="text-[12px] font-extrabold text-ink">
              {fullAccess ? 'مسموح له بكل العمليات من غير قيد' : 'مقصور على المفاتيح المفتوحة أدناه فقط'}
            </span>
          </div>

          <p className="mt-1.5 text-[11.5px] font-bold leading-relaxed text-muted">
            لو سيبت كل المفاتيح مقفولة بتتبعت قايمة فاضية — والفاضية معناها{' '}
            <span className="font-extrabold text-ink">صلاحية كاملة (بدون قيود)</span>، مش «بدون صلاحيات». عشان تقيّد
            الموظف افتح المفاتيح اللي تخصّه بس.
          </p>
        </div>

        {catalog.isPending ? (
          <Loading rows={6} height={40} />
        ) : catalog.isError ? (
          <ErrorState message={catalog.error.message} onRetry={() => void catalog.refetch()} />
        ) : (
          <ul className="flex flex-col">
            {options.map((option) => (
              <li key={option.key} className="flex flex-col gap-1 border-b border-hair py-2.5 last:border-0">
                <Toggle
                  checked={selected.includes(option.key)}
                  disabled={save.isPending}
                  onChange={(next) => toggle(option.key, next)}
                  label={option.label}
                />
                <span className="ps-[50px] text-[10.5px] font-bold leading-tight text-faint">
                  {PERMISSION_NOTES[option.key] ?? option.key}
                </span>
              </li>
            ))}
          </ul>
        )}

        {options.length ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={fullAccess || save.isPending}
              onClick={() => setSelected([])}
            >
              اقفل الكل (صلاحية كاملة)
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={save.isPending || selected.length === options.length}
              onClick={() => setSelected(options.map((option) => option.key))}
            >
              افتح الكل
            </Button>
          </div>
        ) : null}

        {selfLockout ? (
          <p className="text-[11.5px] font-bold text-bad">
            ماينفعش تشيل صلاحية «إدارة المستخدمين والصلاحيات» من نفسك — السيرفر بيرفضها عشان ما تتقفلش برّه اللوحة.
          </p>
        ) : null}

        {save.isError ? <p className="text-[11.5px] font-bold text-bad">{save.error.message}</p> : null}

        <MissingDataNote>
          الصلاحيات بتتفحص من قاعدة البيانات مع كل طلب — التعديل بيسري فوراً من غير ما الموظف يسجّل دخول من جديد، وكل
          تغيير متسجّل في «سجل التدقيق».
        </MissingDataNote>
      </div>
    </Modal>
  );
}

// ── دليل الصلاحيات — كتالوج السيرفر + شرح إيه اللي كل مفتاح بيفتحه ──

function PermissionsLegend() {
  const catalog = usePermissionCatalog();
  const options = catalog.data ?? [];

  return (
    <Card padding="lg">
      <SectionTitle aside={catalog.data ? `${num(options.length)} صلاحية` : 'متطبّقة'}>دليل الصلاحيات</SectionTitle>

      <p className="mb-2.5 text-[12px] font-bold leading-relaxed text-muted">
        الصلاحيات بقت لكل موظف على حدة (مش للدور) — السيرفر بيقراها من قاعدة البيانات مع كل طلب وبيرفض العملية اللي
        الموظف مالوش صلاحيتها. ظبّطها من زر «الصلاحيات» جنب الموظف.
      </p>

      <p className="mb-3 rounded-[10px] border border-brand/40 bg-tint p-2.5 text-[11.5px] font-bold leading-relaxed text-ink">
        <Pill tone="warn" className="me-1.5 align-middle">
          صلاحية كاملة
        </Pill>
        قايمة فاضية = وصول كامل لكل العمليات (سوبر أدمن)، مش «بدون صلاحيات» — ودي الحالة الافتراضية للحسابات الموجودة.
      </p>

      {catalog.isPending ? (
        <Loading rows={6} height={40} />
      ) : catalog.isError ? (
        <ErrorState message={catalog.error.message} onRetry={() => void catalog.refetch()} />
      ) : (
        <ul className="flex flex-col">
          {options.map((option) => (
            <li key={option.key} className="flex flex-col gap-0.5 border-b border-hair py-2.5 last:border-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-[12.5px] font-extrabold text-ink">{option.label}</span>
                <bdi className="font-num text-[10.5px] font-bold text-faint" dir="ltr">
                  {option.key}
                </bdi>
              </div>
              <span className="text-[10.5px] font-bold leading-tight text-faint">
                {PERMISSION_NOTES[option.key] ?? '—'}
              </span>
            </li>
          ))}
        </ul>
      )}

      <MissingDataNote className="mt-3">
        كل المفاتيح دي **بتتفحص فعلاً** على مساراتها بـ <span className="num">@RequirePermission</span>، والفحص بيتقرا من
        قاعدة البيانات مع كل طلب — فأي تعديل صلاحيات بيسري فوراً من غير ما الموظف يعمل تسجيل دخول من جديد.
      </MissingDataNote>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// سجل التدقيق — تغذية العمليات الحسّاسة (GET /audit)
// نفس نمط RefundsCard: شرائح فلتر + Pagination، بس معروضة كتغذية مش جدول
// عشان كل صف حكاية (فاعل + ملخّص + وسم + وقت + تفاصيل).
// ────────────────────────────────────────────────────────────

function AuditLog() {
  const [action, setAction] = useState<'' | AuditAction>('');
  const [page, setPage] = useState(1);

  const params = useMemo(
    () => ({ page, pageSize: AUDIT_PAGE_SIZE, ...(action ? { action } : {}) }),
    [page, action],
  );

  const audit = useQuery({
    queryKey: ['audit', 'list', params],
    queryFn: () => get<AuditPage>('/audit', params),
  });

  const rows = audit.data?.data ?? [];

  return (
    <Card padding="none" className="flex flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-hair p-[14px]">
        <h2 className="me-auto text-[14.5px] font-black text-ink">
          سجل التدقيق
          {audit.data ? (
            <span className="ms-1.5 font-num text-[11.5px] font-bold text-muted">{num(audit.data.total)}</span>
          ) : null}
        </h2>

        {AUDIT_FILTERS.map((filter) => (
          <Chip
            key={filter.value || 'all'}
            tone={filter.tone}
            active={action === filter.value}
            onClick={() => {
              setAction(filter.value);
              setPage(1);
            }}
          >
            {filter.label}
          </Chip>
        ))}
      </div>

      <div className="flex flex-col p-[14px]">
        {audit.isPending ? (
          <Loading rows={6} height={66} className="mt-1" />
        ) : audit.isError ? (
          <ErrorState message={audit.error.message} onRetry={() => void audit.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="🧾"
            title={action ? 'لا توجد عمليات في هذا الفلتر' : 'لا توجد عمليات مسجَّلة بعد'}
            description={
              action
                ? 'أزل الفلتر أو اختر إجراءً آخر من الشرائح أعلاه.'
                : 'أول ما يتعمل استرداد أو تسوية أو أي عملية مالية/حساب حسّاسة، هتتسجّل هنا تلقائياً.'
            }
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}

        {audit.data ? (
          <Pagination page={page} pageSize={audit.data.pageSize} total={audit.data.total} onChange={setPage} />
        ) : null}

        <MissingDataNote className="pt-2">
          السجل بيقيّد كل عملية مال/حساب حسّاسة (استرداد، تسوية، تحويل بنكي، حساب استلام، سحب، مراجعة وثيقة، وإدارة
          الموظفين والصلاحيات) بفاعلها ووقتها — غير قابل للتعديل أو المسح. والمنع نفسه بقى بالصلاحيات المفصّلة: الموظف
          اللي مالوش الصلاحية بيترفض طلبه من السيرفر، والسجل بيوثّق اللي اتنفّذ فعلاً.
        </MissingDataNote>
      </div>
    </Card>
  );
}

// ── صف واحد في التغذية — الملخّص هو السطر الأساسي، والتفاصيل بتتفتح عند الطلب ──

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);

  const meta = ACTION_META[entry.action] ?? { label: entry.action, tone: 'neutral' as Tone };
  const actorRole = ROLE_META[entry.actorRole] ?? { label: entry.actorRole, tone: 'neutral' as Tone };
  const details = metaRows(entry.metadata);

  return (
    <li className="rounded-[12px] border border-hair p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={meta.tone}>{meta.label}</Pill>
        <span className="text-[12.5px] font-extrabold text-ink">{entry.actorName}</span>
        <Pill tone={actorRole.tone}>{actorRole.label}</Pill>
        <bdi className="ms-auto shrink-0 font-num text-[11px] font-bold text-muted" dir="ltr">
          {dateTime(entry.createdAt)}
        </bdi>
      </div>

      <p className="mt-1.5 text-[13px] font-bold leading-snug text-ink">{entry.summaryAr}</p>

      {details.length ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="mt-1.5 text-[11px] font-extrabold text-muted transition-colors hover:text-ink"
          >
            {open ? 'إخفاء التفاصيل ▴' : 'التفاصيل ▾'}
          </button>

          {open ? (
            <dl className="mt-1.5 flex flex-col gap-1 rounded-[10px] bg-soft p-2.5">
              {details.map((detail) => (
                <div key={detail.key} className="flex items-baseline justify-between gap-3 text-[11.5px]">
                  <dt className="shrink-0 font-extrabold text-label">{detail.label}</dt>
                  <dd className="min-w-0 truncate text-end font-bold text-ink" title={detail.value}>
                    {detail.latin ? (
                      <bdi className="font-num" dir="ltr">
                        {detail.value}
                      </bdi>
                    ) : (
                      detail.value
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </>
      ) : null}
    </li>
  );
}
