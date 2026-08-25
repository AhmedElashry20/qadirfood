// الهيكل العام — القائمة الجانبية + الشريط العلوي + محتوى الصفحة
import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useSession } from '../lib/auth';
import { useSocketConnection } from '../lib/socket';
import { cx } from './ui';

// ────────────────────────────────────────────────────────────
// عقد الشريط العلوي
//
// الشريط العلوي مش context — كل صفحة بترسمه بنفسها كأول عنصر في الـ Outlet.
// ده أبسط: مافيش useEffect بيتسابق، والعنوان بيتغيّر مع الصفحة في نفس الرندر.
//
//   export default function Orders() {
//     return (
//       <>
//         <TopBar title="الطلبات" tabs={…} actions={<Button…/>} />
//         <PageBody>…</PageBody>
//       </>
//     );
//   }
//
// ملحوظة: الصفحة لازم ترجّع Fragment فيه الاتنين — مش <div> — عشان الـ flex
// بتاع عمود المحتوى يفضل شغال.
// ────────────────────────────────────────────────────────────

export interface TopBarProps {
  /** عنوان الصفحة — 19px/900. */
  title: string;
  /** تبويبات أو شرائح عدد جنب العنوان. */
  tabs?: ReactNode;
  /** فلاتر/بحث/تصدير — على الجهة المقابلة. */
  actions?: ReactNode;
}

export function TopBar({ title, tabs, actions }: TopBarProps) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-7 py-[14px]">
      <div className="flex min-w-0 items-center gap-3">
        <h1 className="shrink-0 text-[19px] font-black text-ink">{title}</h1>
        {tabs ? <div className="flex min-w-0 items-center gap-2 overflow-x-auto">{tabs}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export interface PageBodyProps {
  children: ReactNode;
  className?: string;
}

/** جسم الصفحة — التمرير بيحصل هنا، مش في الصفحة كلها. */
export function PageBody({ children, className }: PageBodyProps) {
  return <div className={cx('flex flex-1 flex-col gap-3 overflow-auto p-[16px_22px]', className)}>{children}</div>;
}

// ────────────────────────────────────────────────────────────
// القائمة الجانبية
// ────────────────────────────────────────────────────────────

interface NavItem {
  to: string;
  icon: string;
  label: string;
  /**
   * عدّاد أحمر. الـ API الحالي مافيهوش endpoints للالتزام أو الشكاوى
   * (شوف apps/api/src/app.module.ts) — فالعدّاد بيفضل undefined ومش بيترسم.
   * أول ما الـ endpoints تنزل، اربطها هنا بـ react-query وحطّ الرقم.
   */
  badge?: number;
  /** الجذر بس هو اللي بيتطابق بالضبط — باقي المسارات prefix. */
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', icon: '📊', label: 'الرئيسية', end: true },
  { to: '/map', icon: '🗺', label: 'الخريطة اللايف' },
  { to: '/dispatch', icon: '🎯', label: 'التوزيع Dispatch' },
  { to: '/relay', icon: '🕋', label: 'التوصيل بالتناوب (الحرم)' },
  { to: '/orders', icon: '📦', label: 'الطلبات' },
  { to: '/restaurants', icon: '🍔', label: 'المطاعم' },
  { to: '/captains', icon: '🛵', label: 'الكباتن' },
  { to: '/companies', icon: '🚚', label: 'الشركات' },
  { to: '/compliance', icon: '🛡', label: 'الالتزام' },
  { to: '/tga', icon: '🚦', label: 'ربط هيئة النقل' },
  { to: '/finance', icon: '💰', label: 'المالية والتسويات' },
  { to: '/wallets', icon: '👛', label: 'المحافظ والسحب' },
  { to: '/coupons', icon: '🎟', label: 'الكوبونات' },
  { to: '/support', icon: '🎧', label: 'الشكاوى والدعم' },
  { to: '/quality', icon: '⭐', label: 'الجودة' },
  { to: '/reports', icon: '📈', label: 'التقارير وBI' },
  { to: '/users', icon: '👥', label: 'الصلاحيات' },
  { to: '/integrations', icon: '🔌', label: 'المفاتيح والربط' },
  { to: '/settings', icon: '🗺️', label: 'الإعدادات والمناطق (رسم)' },
];

/** أسماء الأدوار بالعربي — الـ API بيرجّع الدور بالإنجليزي. */
const ROLE_AR: Record<string, string> = {
  ADMIN: 'مدير المنصة',
  MERCHANT: 'مدير مطعم',
  CAPTAIN: 'كابتن',
  CUSTOMER: 'عميل',
  COMPANY: 'شركة',
};

function Sidebar() {
  const { user, logout } = useSession();

  return (
    <aside className="flex w-[216px] shrink-0 flex-col gap-[2px] bg-ink p-[18px_14px]">
      {/* الهوية */}
      <div className="mb-4 flex items-center gap-2.5 px-1">
        <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] bg-brand">
          <span className="font-num text-[19px] font-extrabold text-ink">Q</span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-black text-white">قادر فود</p>
          <p className="truncate text-[10.5px] font-bold text-dim">لوحة الأدمن</p>
        </div>
      </div>

      {/* التنقل */}
      <nav className="flex flex-1 flex-col gap-[2px] overflow-y-auto">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cx(
                'flex items-center gap-[9px] rounded-[10px] px-3 py-[9px] text-[12.5px] transition-colors',
                isActive ? 'bg-brand font-extrabold text-ink' : 'font-bold text-dim hover:bg-ink-soft hover:text-white',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className="w-[17px] shrink-0 text-center text-[13px] leading-none" aria-hidden>
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
                {typeof item.badge === 'number' && item.badge > 0 ? (
                  <span
                    className={cx(
                      'num me-auto rounded-pill px-[7px] py-px text-[10px] font-extrabold text-white',
                      isActive ? 'bg-bad' : 'bg-ink-line',
                    )}
                    dir="ltr"
                  >
                    {item.badge}
                  </span>
                ) : null}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* المستخدم */}
      <button
        type="button"
        onClick={logout}
        title="تسجيل الخروج"
        className="mt-3 flex shrink-0 items-center gap-2.5 rounded-xl bg-ink-soft p-2.5 text-start transition-colors hover:bg-ink-card"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand font-num text-[13px] font-extrabold text-ink">
          {user?.fullName?.trim()?.[0] ?? 'A'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-extrabold text-white">{user?.fullName ?? 'الأدمن'}</span>
          <span className="block truncate text-[10px] font-bold text-dim">
            {ROLE_AR[user?.role ?? ''] ?? user?.role ?? '—'}
          </span>
        </span>
        <span className="shrink-0 text-[12px] text-dim" aria-hidden>
          ⏻
        </span>
      </button>
    </aside>
  );
}

/** الهيكل — القائمة ثابتة، والصفحة بترسم شريطها العلوي وجسمها. */
export default function Shell() {
  // الأدمن بيدخل غرفة `admin` أوتوماتيك من السيرفر بمجرد الاتصال
  useSocketConnection();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-canvas">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
