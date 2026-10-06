// الالتزام — مصفوفة وثائق الكباتن + اعتماد/رفض
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { PageBody, TopBar } from '../components/Shell';
import {
  Button,
  Card,
  Chip,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  KpiCard,
  Loading,
  MissingDataNote,
  Modal,
  Pagination,
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
  type Tone,
} from '../components/ui';
import { get, patch } from '../lib/api';
import { DASH, dateOnly, dateTime, ltr, num } from '../lib/format';

// ────────────────────────────────────────────────────────────
// أشكال الـ API — apps/api/src/captains/captains.service.ts
// (ComplianceRowView / CaptainDocumentView)
// ────────────────────────────────────────────────────────────

type CaptainStatus = 'OFFLINE' | 'ONLINE' | 'ON_TRIP';
type DocumentType = 'IDENTITY' | 'LICENSE' | 'VEHICLE_REG' | 'INSURANCE' | 'PHOTO';
type DocumentStatus = 'MISSING' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';

interface CaptainDocument {
  /** null لما الوثيقة لم تُرفَع بعد — ساعتها مافيش حاجة تتراجع. */
  id: string | null;
  type: DocumentType;
  status: DocumentStatus;
  fileUrl: string | null;
  rejectReason: string | null;
  expiresAt: string | null;
  /** موجب = باقي أيام · سالب = منتهية من كام يوم · null = مافيش تاريخ انتهاء. */
  daysUntilExpiry: number | null;
  reviewedAt: string | null;
  updatedAt: string | null;
  /** false للصورة الشخصية بس. */
  isRequired: boolean;
}

interface ComplianceRow {
  captainId: string;
  fullName: string;
  phone: string;
  status: CaptainStatus;
  isVerified: boolean;
  documents: CaptainDocument[];
  /** true بس لما الأربع وثائق الإلزامية كلها APPROVED. */
  dispatchAllowed: boolean;
}

interface CompliancePage {
  data: ComplianceRow[];
  total: number;
  page: number;
  pageSize: number;
}

type ComplianceFilter = 'all' | 'expiring' | 'expired';

// ────────────────────────────────────────────────────────────
// خرائط العرض
// ────────────────────────────────────────────────────────────

const DOCUMENT_AR: Record<DocumentType, string> = {
  IDENTITY: 'بطاقة الهوية',
  LICENSE: 'رخصة القيادة',
  VEHICLE_REG: 'استمارة المركبة',
  INSURANCE: 'التأمين',
  PHOTO: 'الصورة الشخصية',
};

/** أعمدة المصفوفة — الإلزامية الأربعة بس. الصورة الشخصية بتبان في اللوح الجانبي. */
const DOCUMENT_COLUMNS: DocumentType[] = ['IDENTITY', 'LICENSE', 'VEHICLE_REG', 'INSURANCE'];

const FILTERS: Array<{ value: ComplianceFilter; label: string; tone: Tone }> = [
  { value: 'all', label: 'الكل', tone: 'neutral' },
  { value: 'expiring', label: 'تنتهي قريباً', tone: 'warn' },
  { value: 'expired', label: 'منتهية', tone: 'bad' },
];

/** الوثيقة «قربت تنتهي» = باقي لها ٣٠ يوم أو أقل — نفس عتبة السيرفر. */
const EXPIRING_SOON_DAYS = 30;

const PAGE_SIZE = 25;

const REJECT_REASONS = [
  'الصورة غير واضحة',
  'الوثيقة منتهية',
  'الاسم غير مطابق',
  'الوثيقة غير مكتملة',
  'سبب آخر',
];

const CAPTAIN_STATUS_AR: Record<CaptainStatus, string> = {
  ONLINE: 'متاح',
  ON_TRIP: 'في رحلة',
  OFFLINE: 'أوفلاين',
};

// ── حالة الخلية ──

interface CellMeta {
  label: string;
  tone: Tone | 'muted';
}

/**
 * شكل الخلية المختصر في المصفوفة.
 * المعتمدة اللي باقي لها ٣٠ يوم أو أقل بتتحوّل تحذير — الأدمن لازم يشوفها
 * قبل ما تنتهي وتوقف الكابتن عن التوزيع فجأة.
 */
function cellMeta(document: CaptainDocument): CellMeta {
  switch (document.status) {
    case 'APPROVED': {
      const days = document.daysUntilExpiry;
      if (days === null) return { label: '✅', tone: 'ok' };
      if (days < 0) return { label: `⛔ منتهية من ${ltr(Math.abs(days))} يوم`, tone: 'bad' };
      return { label: `✅ ${ltr(days)} يوم`, tone: days <= EXPIRING_SOON_DAYS ? 'warn' : 'ok' };
    }
    case 'PENDING':
      return { label: '⏳ مراجعة', tone: 'warn' };
    case 'REJECTED':
      return { label: '✕ مرفوضة', tone: 'bad' };
    case 'EXPIRED':
      return { label: '⛔ منتهية', tone: 'bad' };
    case 'MISSING':
    default:
      return { label: '— لم تُرفع', tone: 'muted' };
  }
}

/**
 * الملفات المرفوعة بتتقدّم من الـ API برّه `/api`. البروكسي في vite.config.ts
 * بيمرّر `/uploads` لنفس السيرفر، فالرابط النسبي بيشتغل من نفس الأصل —
 * من غير CORS ومن غير origin متشفّر في الكود.
 */
function fileHref(fileUrl: string): string {
  return fileUrl;
}

function isPdf(fileUrl: string): boolean {
  return fileUrl.toLowerCase().split('?')[0].endsWith('.pdf');
}

// ────────────────────────────────────────────────────────────
// الصفحة — مبدّل بين «وثائق الكباتن» و«التحقق اليومي بالوجه»
// ────────────────────────────────────────────────────────────

type ComplianceView = 'documents' | 'face';

export default function Compliance() {
  const [view, setView] = useState<ComplianceView>('documents');

  // مبدّل العرض — بيتحقن في أول تبويبات الشريط العلوي للعرضين، عشان يفضل
  // باين وواحد بس هو المرسوم في نفس اللحظة.
  const viewTabs = (
    <>
      <Chip tone="neutral" active={view === 'documents'} onClick={() => setView('documents')}>
        📄 وثائق الكباتن
      </Chip>
      <Chip tone="neutral" active={view === 'face'} onClick={() => setView('face')}>
        🤳 التحقق اليومي بالوجه
      </Chip>
      <span className="mx-1 h-5 w-px self-center bg-hair" aria-hidden />
    </>
  );

  return view === 'documents' ? <DocumentsReview viewTabs={viewTabs} /> : <FaceReview viewTabs={viewTabs} />;
}

// ────────────────────────────────────────────────────────────
// عرض وثائق الكباتن — المصفوفة + اعتماد/رفض (زي ما كان)
// ────────────────────────────────────────────────────────────

function DocumentsReview({ viewTabs }: { viewTabs: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkCaptain = searchParams.get('captain');

  const [filter, setFilter] = useState<ComplianceFilter>('all');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [openCaptainId, setOpenCaptainId] = useState<string | null>(null);
  const [review, setReview] = useState<{ document: CaptainDocument; captainName: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const params = useMemo(() => ({ filter, page, pageSize: PAGE_SIZE }), [filter, page]);

  const compliance = useQuery({
    queryKey: ['captains', 'compliance', params],
    queryFn: () => get<CompliancePage>('/captains/compliance', params),
  });

  const all = useMemo(() => compliance.data?.data ?? [], [compliance.data]);

  /**
   * الرابط العميق `?captain=` — بنقصر الصفحة المحمّلة على الكابتن ده
   * (الـ endpoint مافيهوش فلتر بالكابتن) وبنفتح لوحه أوتوماتيك **مرة واحدة**
   * بس: من غير الحارس ده أي إعادة تحميل للاستعلام هتفتح اللوح تاني بعد ما
   * الأدمن يقفله.
   */
  const autoOpened = useRef<string | null>(null);

  useEffect(() => {
    if (!deepLinkCaptain || autoOpened.current === deepLinkCaptain) return;
    if (!all.some((row) => row.captainId === deepLinkCaptain)) return;

    autoOpened.current = deepLinkCaptain;
    setOpenCaptainId(deepLinkCaptain);
  }, [deepLinkCaptain, all]);

  const deepLinkFound = deepLinkCaptain ? all.some((row) => row.captainId === deepLinkCaptain) : false;

  // البحث محلي على الصفحة المحمّلة — الـ endpoint مافيهوش باراميتر بحث
  const rows = useMemo(() => {
    let list = all;

    if (deepLinkCaptain && deepLinkFound) {
      list = list.filter((row) => row.captainId === deepLinkCaptain);
    }

    const term = search.trim().toLowerCase();
    if (!term) return list;

    return list.filter(
      (row) => row.fullName.toLowerCase().includes(term) || row.phone.includes(term),
    );
  }, [all, search, deepLinkCaptain, deepLinkFound]);

  // ── مؤشرات محسوبة من الصفحة المحمّلة بس ──
  const kpis = useMemo(() => {
    let dispatchAllowed = 0;
    let expiringSoon = 0;
    let expired = 0;
    let unverified = 0;

    for (const row of all) {
      if (row.dispatchAllowed) dispatchAllowed += 1;
      if (!row.isVerified) unverified += 1;

      for (const document of row.documents) {
        const days = document.daysUntilExpiry;

        if (document.status === 'EXPIRED' || (days !== null && days < 0)) {
          expired += 1;
        } else if (days !== null && days >= 0 && days <= EXPIRING_SOON_DAYS) {
          expiringSoon += 1;
        }
      }
    }

    return { dispatchAllowed, expiringSoon, expired, unverified };
  }, [all]);

  const openCaptain = openCaptainId ? all.find((row) => row.captainId === openCaptainId) : undefined;

  const clearDeepLink = () => {
    if (!deepLinkCaptain) return;
    const next = new URLSearchParams(searchParams);
    next.delete('captain');
    setSearchParams(next, { replace: true });
  };

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 3_000);
  };

  return (
    <>
      <TopBar
        title="🛡 الالتزام — وثائق الكباتن"
        tabs={
          <>
            {viewTabs}
            {FILTERS.map((entry) => (
              <Chip
                key={entry.value}
                tone={entry.tone}
                active={filter === entry.value}
                count={filter === entry.value ? compliance.data?.total : undefined}
                onClick={() => {
                  setFilter(entry.value);
                  setPage(1);
                  setOpenCaptainId(null);
                }}
              >
                {entry.label}
              </Chip>
            ))}
          </>
        }
        actions={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder="⌕ اسم / جوال الكابتن…" width={220} />
            <Button variant="outline" size="sm" icon="📄" disabled title="لا يوجد endpoint لتصدير تقرير الهيئة">
              تقرير جاهز للهيئة
            </Button>
          </>
        }
      />

      <PageBody>
        {/* ── المؤشرات ── */}
        <div className="grid shrink-0 grid-cols-4 gap-3">
          <KpiCard
            label="كباتن مسموح لهم بالتوزيع"
            value={num(kpis.dispatchAllowed)}
            note="من الصفحة المحمّلة"
            inverted
          />
          <KpiCard
            label={`وثائق تنتهي خلال ${ltr(EXPIRING_SOON_DAYS)} يوم`}
            value={num(kpis.expiringSoon)}
            note="من الصفحة المحمّلة"
          />
          <KpiCard label="وثائق منتهية" value={num(kpis.expired)} note="من الصفحة المحمّلة" />
          <KpiCard label="كباتن غير موثّقين" value={num(kpis.unverified)} note="من الصفحة المحمّلة" />
        </div>

        <div className="flex flex-1 overflow-hidden">
          <Card padding="none" className="flex flex-1 flex-col overflow-hidden">
            {deepLinkCaptain && deepLinkFound ? (
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hair bg-tint-soft p-[14px]">
                <span className="text-[12px] font-extrabold text-ink">
                  معروض كابتن واحد بس (جاي من صفحة الكباتن).
                </span>
                <Button variant="ghost" size="sm" onClick={clearDeepLink}>
                  عرض الكل
                </Button>
              </div>
            ) : null}

            <div className="flex flex-1 flex-col overflow-hidden p-[14px]">
              <div className="flex flex-1 flex-col overflow-auto">
                <Table gridTemplateColumns="1.3fr repeat(4, 1fr) 0.9fr">
                  <THead>
                    <TH>الكابتن</TH>
                    {DOCUMENT_COLUMNS.map((type) => (
                      <TH key={type}>{DOCUMENT_AR[type]}</TH>
                    ))}
                    <TH>حالة التوزيع</TH>
                  </THead>

                  {compliance.isPending ? (
                    <Loading rows={8} height={44} className="mt-2" />
                  ) : compliance.isError ? (
                    <ErrorState message={compliance.error.message} onRetry={() => void compliance.refetch()} />
                  ) : rows.length === 0 ? (
                    <EmptyState
                      icon="🛡"
                      title={search ? 'لا توجد نتائج للبحث' : 'لا يوجد كباتن في هذا الفلتر'}
                      description={
                        search
                          ? 'يعمل البحث على الصفحة المعروضة فقط — لا يوجد بحث نصي في الـ endpoint.'
                          : 'غيّر الفلتر من الشريط العلوي.'
                      }
                    />
                  ) : (
                    rows.map((row) => (
                      <TR
                        key={row.captainId}
                        selected={row.captainId === openCaptainId}
                        danger={!row.dispatchAllowed}
                        onClick={() => setOpenCaptainId(row.captainId)}
                      >
                        <TD>
                          <span className="font-extrabold">{row.fullName}</span>
                          <span className="text-faint"> · </span>
                          <bdi className="font-num text-[11.5px] text-muted" dir="ltr">
                            {row.phone}
                          </bdi>
                        </TD>

                        {DOCUMENT_COLUMNS.map((type) => {
                          const document = row.documents.find((entry) => entry.type === type);

                          return (
                            <TD key={type}>
                              <DocumentCell
                                document={document}
                                onOpen={() => {
                                  if (!document) return;
                                  setReview({ document, captainName: row.fullName });
                                }}
                              />
                            </TD>
                          );
                        })}

                        <TD>
                          <Pill tone={row.dispatchAllowed ? 'ok' : 'bad'}>
                            {row.dispatchAllowed ? 'مسموح ✓' : 'ممنوع ⛔'}
                          </Pill>
                        </TD>
                      </TR>
                    ))
                  )}
                </Table>
              </div>

              {compliance.data ? (
                <Pagination
                  page={page}
                  pageSize={compliance.data.pageSize}
                  total={compliance.data.total}
                  onChange={(next) => {
                    setPage(next);
                    setOpenCaptainId(null);
                  }}
                />
              ) : null}

              <MissingDataNote className="pt-2">
                «حالة التوزيع» بتيجي من السيرفر: مسموح بس لما الأربع وثائق الإلزامية كلها معتمدة. الصورة الشخصية مش
                إلزامية فمالهاش عمود — بتتراجع من لوح الكابتن. سجل التحقق بالوجه، وفئات الكباتن، وتصدير تقرير الهيئة
                لسه محتاجين endpoints.
              </MissingDataNote>
            </div>
          </Card>
        </div>
      </PageBody>

      {/* ── لوح الكابتن — كل الوثائق بما فيها الصورة الشخصية ── */}
      <Drawer
        open={Boolean(openCaptain)}
        onClose={() => setOpenCaptainId(null)}
        title={openCaptain?.fullName ?? 'وثائق الكابتن'}
        side="start"
        width={440}
      >
        {!openCaptain ? null : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <bdi className="font-num text-[12.5px] font-bold text-muted" dir="ltr">
                {openCaptain.phone}
              </bdi>
              <span className="flex items-center gap-1.5">
                <Pill tone="neutral">{CAPTAIN_STATUS_AR[openCaptain.status]}</Pill>
                <Pill tone={openCaptain.dispatchAllowed ? 'ok' : 'bad'}>
                  {openCaptain.dispatchAllowed ? 'مسموح ✓' : 'ممنوع ⛔'}
                </Pill>
              </span>
            </div>

            <ul className="flex flex-col gap-2">
              {openCaptain.documents.map((document) => {
                const meta = cellMeta(document);

                return (
                  <li key={document.type}>
                    <button
                      type="button"
                      disabled={!document.id}
                      onClick={() => setReview({ document, captainName: openCaptain.fullName })}
                      className={cx(
                        'flex w-full items-center justify-between gap-3 rounded-[12px] border border-line p-3 text-start transition-colors',
                        document.id ? 'hover:bg-soft' : 'cursor-not-allowed opacity-60',
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block text-[12.5px] font-extrabold text-ink">
                          {DOCUMENT_AR[document.type]}
                          {!document.isRequired ? (
                            <span className="font-bold text-faint"> · اختيارية</span>
                          ) : null}
                        </span>
                        <span className="block text-[11px] font-bold text-muted">
                          {document.expiresAt ? `تنتهي ${ltr(dateOnly(document.expiresAt))}` : 'من غير تاريخ انتهاء'}
                        </span>
                      </span>

                      {meta.tone === 'muted' ? (
                        <span className="shrink-0 text-[11.5px] font-bold text-faint">{meta.label}</span>
                      ) : (
                        <Pill tone={meta.tone} className="shrink-0">
                          {meta.label}
                        </Pill>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            <MissingDataNote>
              الوثيقة اللي حالتها «لم تُرفع» مالهاش صف في قاعدة البيانات — الكابتن لازم يرفعها من تطبيقه الأول عشان
              تتراجع من هنا.
            </MissingDataNote>
          </div>
        )}
      </Drawer>

      <ReviewModal
        entry={review}
        onClose={() => setReview(null)}
        onDone={() => {
          setReview(null);
          showToast('تم تحديث الوثيقة');
        }}
      />

      {/* ── إشعار نجاح ── */}
      {toast ? (
        <div className="fixed bottom-6 start-6 z-[60] rounded-[12px] bg-ink px-4 py-3 text-[12.5px] font-extrabold text-white shadow-float">
          ✓ {toast}
        </div>
      ) : null}
    </>
  );
}

// ────────────────────────────────────────────────────────────
// خلية وثيقة في المصفوفة
// ────────────────────────────────────────────────────────────

interface DocumentCellProps {
  document?: CaptainDocument;
  onOpen: () => void;
}

function DocumentCell({ document, onOpen }: DocumentCellProps) {
  if (!document) return <span className="text-[11.5px] font-bold text-faint">{DASH}</span>;

  const meta = cellMeta(document);

  // الوثيقة اللي لم تُرفَع بعد مالهاش id — مافيش حاجة تتراجع
  if (!document.id) {
    return <span className="text-[11.5px] font-bold text-faint">{meta.label}</span>;
  }

  return (
    <button
      type="button"
      title="مراجعة الوثيقة"
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      className="min-w-0 text-start"
    >
      {meta.tone === 'muted' ? (
        <span className="text-[11.5px] font-bold text-faint">{meta.label}</span>
      ) : (
        <Pill tone={meta.tone}>{meta.label}</Pill>
      )}
    </button>
  );
}

// ────────────────────────────────────────────────────────────
// نافذة المراجعة — PATCH /captains/documents/:id/review
// ────────────────────────────────────────────────────────────

interface ReviewModalProps {
  entry: { document: CaptainDocument; captainName: string } | null;
  onClose: () => void;
  onDone: () => void;
}

function ReviewModal({ entry, onClose, onDone }: ReviewModalProps) {
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<'idle' | 'reject'>('idle');
  const [expiresAt, setExpiresAt] = useState('');
  const [reasonChoice, setReasonChoice] = useState(REJECT_REASONS[0]);
  const [reasonText, setReasonText] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const documentId = entry?.document.id ?? null;

  // كل ما نفتح وثيقة جديدة نرجّع الفورم لأصله
  useEffect(() => {
    setMode('idle');
    setReasonChoice(REJECT_REASONS[0]);
    setReasonText('');
    setLocalError(null);
    setExpiresAt(entry?.document.expiresAt ? dateOnly(entry.document.expiresAt) : '');
  }, [entry]);

  const review = useMutation({
    mutationFn: (body: { approved: boolean; rejectReason?: string; expiresAt?: string }) =>
      patch<CaptainDocument>(`/captains/documents/${documentId ?? ''}/review`, body),
    onSuccess: () => {
      // الاعتماد بيغيّر `isVerified` كمان — فبنبطّل كل استعلامات الكباتن
      void queryClient.invalidateQueries({ queryKey: ['captains'] });
      onDone();
    },
  });

  if (!entry) return null;

  const { document, captainName } = entry;
  const meta = cellMeta(document);

  const finalReason = reasonChoice === 'سبب آخر' ? reasonText.trim() : reasonChoice;

  const approve = () => {
    setLocalError(null);
    review.mutate({
      approved: true,
      // input[type=date] بيدّي «YYYY-MM-DD» — الـ API عايز ISO كامل
      ...(expiresAt ? { expiresAt: new Date(`${expiresAt}T00:00:00`).toISOString() } : {}),
    });
  };

  const reject = () => {
    if (!finalReason) {
      setLocalError('سبب الرفض مطلوب');
      return;
    }
    setLocalError(null);
    review.mutate({ approved: false, rejectReason: finalReason });
  };

  return (
    <Modal
      open
      onClose={onClose}
      width={520}
      title={`${DOCUMENT_AR[document.type]} — ${captainName}`}
      footer={
        mode === 'reject' ? (
          <>
            <Button variant="ghost" size="sm" onClick={() => setMode('idle')}>
              رجوع
            </Button>
            <Button variant="danger" size="sm" loading={review.isPending} onClick={reject}>
              تأكيد الرفض
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" size="sm" disabled={review.isPending} onClick={() => setMode('reject')}>
              رفض
            </Button>
            <Button variant="brand" size="sm" loading={review.isPending} onClick={approve}>
              اعتماد ✓
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-3">
        {/* ── الملف ── */}
        <div className="flex min-h-[180px] items-center justify-center overflow-hidden rounded-[12px] border border-line bg-soft">
          {!document.fileUrl ? (
            <span className="p-6 text-[12px] font-bold text-faint">مافيش ملف مرفوع للوثيقة دي.</span>
          ) : isPdf(document.fileUrl) ? (
            <a
              href={fileHref(document.fileUrl)}
              target="_blank"
              rel="noreferrer"
              className="p-6 text-[12.5px] font-extrabold text-gold-deep hover:underline"
            >
              📄 فتح الملف
            </a>
          ) : (
            <a href={fileHref(document.fileUrl)} target="_blank" rel="noreferrer" className="block w-full">
              <img
                src={fileHref(document.fileUrl)}
                alt={DOCUMENT_AR[document.type]}
                className="max-h-[320px] w-full object-contain"
              />
            </a>
          )}
        </div>

        {/* ── الحقائق ── */}
        <dl className="flex flex-col gap-2 rounded-[13px] bg-soft p-3">
          <Fact label="النوع">
            {DOCUMENT_AR[document.type]}
            {!document.isRequired ? <span className="font-bold text-faint"> · اختيارية</span> : null}
          </Fact>

          <Fact label="الحالة الحالية">
            {meta.tone === 'muted' ? (
              <span className="text-faint">{meta.label}</span>
            ) : (
              <Pill tone={meta.tone}>{meta.label}</Pill>
            )}
          </Fact>

          <Fact label="تاريخ الانتهاء">
            {document.expiresAt ? (
              <bdi className="font-num" dir="ltr">
                {dateOnly(document.expiresAt)}
              </bdi>
            ) : (
              <span className="text-faint">{DASH}</span>
            )}
          </Fact>

          <Fact label="آخر مراجعة">
            {document.reviewedAt ? (
              <bdi className="font-num" dir="ltr">
                {dateOnly(document.reviewedAt)}
              </bdi>
            ) : (
              <span className="text-faint">{DASH}</span>
            )}
          </Fact>
        </dl>

        {document.rejectReason ? (
          <p className="rounded-[10px] border border-bad-line bg-bad-row px-3 py-2 text-[11.5px] font-bold text-bad-deep">
            سبب الرفض السابق: {document.rejectReason}
          </p>
        ) : null}

        {/* ── الإجراء ── */}
        {mode === 'reject' ? (
          <div className="flex flex-col gap-3">
            <Field label="سبب الرفض" required error={localError ?? (review.isError ? review.error.message : null)}>
              <Select
                value={reasonChoice}
                onChange={setReasonChoice}
                options={REJECT_REASONS.map((reason) => ({ value: reason, label: reason }))}
                className="h-[42px] w-full"
              />
            </Field>

            {reasonChoice === 'سبب آخر' ? (
              <Field label="اكتب السبب" required hint="يصل السبب إلى الكابتن في تطبيقه ليعرف ما يصلحه.">
                <TextInput
                  value={reasonText}
                  onChange={(event) => setReasonText(event.target.value)}
                  placeholder="مثلاً: تاريخ الانتهاء غير ظاهر في الصورة"
                  maxLength={300}
                  autoFocus
                />
              </Field>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Field
              label="تاريخ الانتهاء (اختياري)"
              hint="إن أدخلته سيُسجَّل مع الاعتماد — واتركه فارغاً إن لم يكن للوثيقة تاريخ انتهاء."
              error={review.isError ? review.error.message : null}
            >
              <TextInput
                type="date"
                latin
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
            </Field>

            {document.isRequired ? (
              <MissingDataNote>
                اعتماد الأربع وثائق الإلزامية كلها بيحوّل الكابتن لـ «موثّق» ويسمح بتوزيع الطلبات عليه في نفس اللحظة.
              </MissingDataNote>
            ) : null}
          </div>
        )}
      </div>
    </Modal>
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

// ════════════════════════════════════════════════════════════
// التحقق اليومي بالوجه — طبقة المراجعة البشرية
// أشكال الـ API — apps/api/src/face/face.service.ts (roster / review)
// ════════════════════════════════════════════════════════════

type FaceStatus = 'VERIFIED' | 'PENDING' | 'REJECTED' | 'MISSING';

/** صف روستر النهاردة — واحد لكل مندوب، بآخر فحص اتعمل النهاردة (أو MISSING). */
interface FaceRosterRow {
  captainId: string;
  name: string;
  phone: string;
  /** null = مافيش فحص النهاردة — ساعتها مافيش إجراء يتعمل. */
  checkId: string | null;
  status: FaceStatus;
  checkedAt: string | null;
  /** مسار زي `/uploads/selfies/xxx.jpg` — بيتقدّم من نفس الأصل عبر البروكسي. */
  selfieUrl: string | null;
  provider: string | null;
}

/** رد PATCH /face/checks/:id/review — الفحص بعد التحديث. */
interface FaceCheckView {
  id: string;
  status: FaceStatus;
  confidence: number | null;
  selfieUrl: string;
  rejectReason: string | null;
  checkedAt: string | null;
  createdAt: string;
}

const FACE_STATUS_META: Record<FaceStatus, { label: string; tone: Tone }> = {
  VERIFIED: { label: '✓ موثّق', tone: 'ok' },
  PENDING: { label: '⏳ بانتظار', tone: 'warn' },
  REJECTED: { label: '✕ مرفوض', tone: 'bad' },
  MISSING: { label: '— مطلوب', tone: 'neutral' },
};

/** شرائح العدّ فوق الجدول — نفس ألوان الحالة. */
const FACE_COUNT_CHIPS: Array<{ key: FaceStatus; label: string; tone: Tone }> = [
  { key: 'VERIFIED', label: 'موثّق', tone: 'ok' },
  { key: 'REJECTED', label: 'مرفوض', tone: 'bad' },
  { key: 'PENDING', label: 'بانتظار', tone: 'warn' },
  { key: 'MISSING', label: 'مطلوب', tone: 'neutral' },
];

function FaceReview({ viewTabs }: { viewTabs: ReactNode }) {
  const [search, setSearch] = useState('');
  const [rejectTarget, setRejectTarget] = useState<FaceRosterRow | null>(null);
  const [lightbox, setLightbox] = useState<{ name: string; url: string } | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  const roster = useQuery({
    queryKey: ['face', 'roster'],
    queryFn: () => get<FaceRosterRow[]>('/face/roster'),
  });

  const all = useMemo(() => roster.data ?? [], [roster.data]);

  const counts = useMemo(() => {
    const acc: Record<FaceStatus, number> = { VERIFIED: 0, PENDING: 0, REJECTED: 0, MISSING: 0 };
    for (const row of all) acc[row.status] += 1;
    return acc;
  }, [all]);

  // البحث محلي على الروستر المحمّل — الـ endpoint مافيهوش باراميتر بحث
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return all;
    return all.filter((row) => row.name.toLowerCase().includes(term) || row.phone.includes(term));
  }, [all, search]);

  const showToast = (text: string, ok = true) => {
    setToast({ text, ok });
    window.setTimeout(() => setToast(null), 3_500);
  };

  return (
    <>
      <TopBar
        title="🛡 الالتزام — التحقق اليومي بالوجه"
        tabs={
          <>
            {viewTabs}
            {FACE_COUNT_CHIPS.map((chip) => (
              <Chip key={chip.key} tone={chip.tone} count={counts[chip.key]}>
                {chip.label}
              </Chip>
            ))}
          </>
        }
        actions={<SearchInput value={search} onChange={setSearch} placeholder="⌕ اسم / جوال الكابتن…" width={220} />}
      />

      <PageBody>
        <FaceReviewBanner />

        <div className="flex flex-1 overflow-hidden">
          <Card padding="none" className="flex flex-1 flex-col overflow-hidden">
            <div className="flex flex-1 flex-col overflow-hidden p-[14px]">
              <div className="flex flex-1 flex-col overflow-auto">
                <Table gridTemplateColumns="1.7fr 0.7fr 1fr 1.1fr 0.9fr 1.5fr">
                  <THead>
                    <TH>الكابتن</TH>
                    <TH align="center">السيلفي</TH>
                    <TH>المزوّد</TH>
                    <TH>وقت المراجعة</TH>
                    <TH>الحالة</TH>
                    <TH align="end">الإجراءات</TH>
                  </THead>

                  {roster.isPending ? (
                    <Loading rows={8} height={52} className="mt-2" />
                  ) : roster.isError ? (
                    <ErrorState message={roster.error.message} onRetry={() => void roster.refetch()} />
                  ) : rows.length === 0 ? (
                    <EmptyState
                      icon="🤳"
                      title={search ? 'لا توجد نتائج للبحث' : 'لا يوجد كباتن'}
                      description={
                        search
                          ? 'يعمل البحث على الأسماء والجوالات المعروضة فقط.'
                          : 'أول ما يتسجّل كباتن هيبان هنا مع حالة تحقّقه النهاردة.'
                      }
                    />
                  ) : (
                    rows.map((row) => {
                      const meta = FACE_STATUS_META[row.status];

                      return (
                        <TR key={row.captainId} danger={row.status === 'REJECTED'}>
                          <TD>
                            <span className="font-extrabold">{row.name}</span>
                            <span className="text-faint"> · </span>
                            <bdi className="font-num text-[11.5px] text-muted" dir="ltr">
                              {row.phone}
                            </bdi>
                          </TD>

                          <TD align="center">
                            <SelfieThumb
                              url={row.selfieUrl}
                              name={row.name}
                              onOpen={() => {
                                if (row.selfieUrl) setLightbox({ name: row.name, url: row.selfieUrl });
                              }}
                            />
                          </TD>

                          <TD>
                            {row.provider ? (
                              <bdi className="font-num text-[11.5px] font-bold text-muted" dir="ltr">
                                {row.provider}
                              </bdi>
                            ) : (
                              <span className="text-[11.5px] font-bold text-faint">{DASH}</span>
                            )}
                          </TD>

                          <TD>
                            {row.checkedAt ? (
                              <bdi className="font-num text-[11.5px] font-bold text-ink" dir="ltr">
                                {dateTime(row.checkedAt)}
                              </bdi>
                            ) : (
                              <span className="text-[11.5px] font-bold text-faint">{DASH}</span>
                            )}
                          </TD>

                          <TD>
                            <Pill tone={meta.tone}>{meta.label}</Pill>
                          </TD>

                          <TD align="end">
                            <FaceRowActions row={row} onReject={setRejectTarget} onToast={showToast} />
                          </TD>
                        </TR>
                      );
                    })
                  )}
                </Table>
              </div>

              <MissingDataNote className="pt-2">
                المطابقة البيومترية الآلية لسه مش مفعّلة (المزوّد stub) — دي طبقة مراجعة بشرية: الاعتماد بيسمح للمندوب
                يشتغل النهاردة، والرفض بيلغي تحقّقه ويوقفه. الصف اللي حالته «مطلوب» معناه إن المندوب لسه ما رفعش سيلفي
                النهاردة، فمافيش إجراء عليه لحد ما يصوّر.
              </MissingDataNote>
            </div>
          </Card>
        </div>
      </PageBody>

      {/* ── نافذة الرفض — سبب إلزامي ── */}
      <FaceRejectModal
        target={rejectTarget}
        onClose={() => setRejectTarget(null)}
        onDone={(message) => {
          setRejectTarget(null);
          showToast(message);
        }}
        onError={(message) => showToast(message, false)}
      />

      {/* ── عارض السيلفي كامل ── */}
      <SelfieLightbox target={lightbox} onClose={() => setLightbox(null)} />

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

// ── لافتة أمانة: المطابقة البيومترية مش مفعّلة، دي مراجعة بشرية ──

function FaceReviewBanner() {
  return (
    <Card className="shrink-0">
      <div className="flex items-start gap-3">
        <span className="text-[22px] leading-none" aria-hidden>
          🤳
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[14px] font-black text-ink">التحقق اليومي بالوجه</h2>
            <Pill tone="warn">مراجعة بشرية · المطابقة البيومترية مش مفعّلة</Pill>
          </div>

          <p className="mt-1.5 text-[12px] font-bold leading-relaxed text-muted">
            المطابقة البيومترية الآلية لسه مش شغّالة (المزوّد{' '}
            <bdi className="font-num text-ink" dir="ltr">
              stub
            </bdi>
            ) — عشان كده دي طبقة المراجعة البشرية: كل يوم المندوب بيرفع سيلفي، والأدمن هنا بيتأكّد منها ويعتمدها أو
            يرفضها بنفسه. الاعتماد بيسمح للمندوب يشتغل النهاردة، والرفض بيوقفه ولازم يتكتب معاه سبب.
          </p>
        </div>
      </div>
    </Card>
  );
}

// ── صورة السيلفي المصغّرة — بديل نظيف «لا توجد صورة» لو الرابط فاضي أو الصورة وقعت ──

function SelfieThumb({ url, name, onOpen }: { url: string | null; name: string; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);

  // كل ما يتغيّر الرابط (إعادة استخدام الصف) نرجّع حالة الخطأ لأصلها
  useEffect(() => setFailed(false), [url]);

  if (!url || failed) {
    return (
      <span
        title="لا توجد صورة"
        className="inline-flex h-[40px] w-[40px] items-center justify-center rounded-[9px] border border-dashed border-line bg-soft px-1 text-center text-[8.5px] font-bold leading-tight text-faint"
      >
        لا توجد صورة
      </span>
    );
  }

  return (
    <button
      type="button"
      title="اضغط لعرض السيلفي كامل"
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      className="inline-block h-[40px] w-[40px] overflow-hidden rounded-[9px] border border-line bg-soft transition-opacity hover:opacity-80"
    >
      <img
        src={fileHref(url)}
        alt={`سيلفي ${name}`}
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />
    </button>
  );
}

// ── إجراءات الصف — اعتماد مباشر · رفض بيفتح نافذة السبب ──

interface FaceRowActionsProps {
  row: FaceRosterRow;
  onReject: (row: FaceRosterRow) => void;
  onToast: (text: string, ok?: boolean) => void;
}

function FaceRowActions({ row, onReject, onToast }: FaceRowActionsProps) {
  const queryClient = useQueryClient();

  const approve = useMutation({
    mutationFn: () => patch<FaceCheckView>(`/face/checks/${row.checkId ?? ''}/review`, { approve: true }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['face'] });
      onToast(`تم اعتماد سيلفي ${row.name}`);
    },
    onError: (error: Error) => onToast(error.message, false),
  });

  // مافيش فحص النهاردة — مافيش حاجة تتراجع
  if (!row.checkId) {
    return <span className="text-[11.5px] font-bold text-faint">مطلوب — لسه ما صوّرش</span>;
  }

  return (
    <span className="flex items-center justify-end gap-1.5">
      <Button variant="outline" size="sm" disabled={approve.isPending} onClick={() => onReject(row)}>
        رفض
      </Button>
      <Button variant="brand" size="sm" loading={approve.isPending} onClick={() => approve.mutate()}>
        اعتماد ✓
      </Button>
    </span>
  );
}

// ── نافذة الرفض — PATCH { approve:false, reason } · السبب إلزامي ──

interface FaceRejectModalProps {
  target: FaceRosterRow | null;
  onClose: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}

function FaceRejectModal({ target, onClose, onDone, onError }: FaceRejectModalProps) {
  const queryClient = useQueryClient();

  const [reason, setReason] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  // كل ما نفتح مندوب جديد نرجّع الفورم لأصله
  useEffect(() => {
    setReason('');
    setLocalError(null);
  }, [target]);

  const reject = useMutation({
    mutationFn: (value: string) =>
      patch<FaceCheckView>(`/face/checks/${target?.checkId ?? ''}/review`, { approve: false, reason: value }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['face'] });
      onDone(`تم رفض سيلفي ${target?.name ?? ''}`);
    },
    onError: (error: Error) => onError(error.message),
  });

  if (!target) return null;

  const submit = () => {
    const value = reason.trim();
    if (!value) {
      setLocalError('سبب الرفض مطلوب');
      return;
    }
    setLocalError(null);
    reject.mutate(value);
  };

  return (
    <Modal
      open
      onClose={onClose}
      width={480}
      title={`رفض سيلفي التحقق — ${target.name}`}
      footer={
        <>
          <Button variant="ghost" size="sm" disabled={reject.isPending} onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="danger" size="sm" loading={reject.isPending} onClick={submit}>
            تأكيد الرفض
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field
          label="سبب الرفض"
          required
          hint="السبب بيتسجّل في التدقيق، والرفض بيلغي تحقّق المندوب فمايقدرش يشتغل النهاردة."
          error={localError ?? (reject.isError ? reject.error.message : null)}
        >
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={300}
            autoFocus
            placeholder="مثلاً: الوجه غير واضح · الصورة ليست للمندوب · إضاءة سيئة"
            className="w-full resize-none rounded-[10px] border border-line bg-surface p-3 text-[12.5px] font-bold text-ink outline-none transition-colors placeholder:font-bold placeholder:text-faint focus:border-brand"
          />
        </Field>
      </div>
    </Modal>
  );
}

// ── عارض السيلفي كامل — نفس البديل النظيف لو الصورة وقعت ──

function SelfieLightbox({ target, onClose }: { target: { name: string; url: string } | null; onClose: () => void }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [target]);

  if (!target) return null;

  return (
    <Modal open onClose={onClose} width={560} title={`سيلفي التحقق — ${target.name}`}>
      <div className="flex min-h-[280px] items-center justify-center overflow-hidden rounded-[12px] border border-line bg-soft">
        {failed ? (
          <span className="p-8 text-center text-[12.5px] font-bold text-faint">
            لا توجد صورة — الرابط مكسور أو الصورة مش متاحة على السيرفر.
          </span>
        ) : (
          <img
            src={fileHref(target.url)}
            alt={`سيلفي ${target.name}`}
            onError={() => setFailed(true)}
            className="max-h-[60vh] w-full object-contain"
          />
        )}
      </div>
    </Modal>
  );
}
