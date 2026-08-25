// تسجيل دخول الأدمن
import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { post } from '../lib/api';
import { isLoggedIn, setTokens, setUser, type SessionUser } from '../lib/auth';
import { Button, Field, TextInput, cx } from '../components/ui';

/** رد POST /auth/login للأدمن — auth.service.issueTokens. */
interface LoginResponse {
  accessToken?: string;
  refreshToken?: string;
  user?: SessionUser | null;
  /** بيرجع للمطاعم متعددة الفروع بس — الأدمن ما بيشوفهاش. */
  requiresBranchSelection?: boolean;
}

/**
 * ملاحظة عن الإحصائيات في اللوحة اليسار:
 * التصميم فيه ٣ أرقام (طلبات/كباتن/مطاعم) تحت الشعار. الـ API الحالي مافيهوش
 * أي endpoint عام يرجّعها — `GET /reports/platform` محمي بـ JwtAuthGuard + @Roles(ADMIN)،
 * يعني مش متاح قبل تسجيل الدخول أصلاً. فالقسم ده مش بيترسم بدل ما نحط أرقام مخترعة.
 * لو اتضاف endpoint عام (مثلاً GET /public/stats)، اربطه هنا وارجّع <Stats />.
 */
const HAS_PUBLIC_STATS_ENDPOINT = false;

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/';

  const login = useMutation<LoginResponse, Error, void>({
    // الأدمن المزروع في السيد: admin@delivery.sa / 123456
    mutationFn: async () => {
      const data = await post<LoginResponse>('/auth/login', { identifier: identifier.trim(), password });

      // التحقق لازم يكون هنا مش في onSuccess — الاستثناء في onSuccess
      // مش بيتحوّل لحالة خطأ في react-query.
      if (!data.accessToken || !data.refreshToken || !data.user) {
        throw new Error('رد غير متوقع من السيرفر — تواصل مع الدعم');
      }
      if (data.user.role !== 'ADMIN') {
        throw new Error('هذا الحساب مش أدمن — لوحة الأدمن للمديرين بس');
      }

      return data;
    },
    onSuccess: (data) => {
      setTokens({ accessToken: data.accessToken!, refreshToken: data.refreshToken! });
      setUser(data.user!);
      navigate(redirectTo, { replace: true });
    },
  });

  if (isLoggedIn()) return <Navigate to="/" replace />;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!identifier.trim() || !password) return;
    login.mutate();
  };

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* ── اللوحة اليسار: الهوية ── */}
      <section
        className="flex flex-[1.2] flex-col items-center justify-center gap-6 px-10"
        style={{ background: 'radial-gradient(circle at 30% 30%, #26231A, #1C1C1C)' }}
      >
        <div className="flex h-[120px] w-[120px] items-center justify-center rounded-[30px] bg-brand">
          <span className="font-num text-[60px] font-extrabold leading-none text-ink">Q</span>
        </div>

        <div className="text-center">
          <h1 className="font-num text-[32px] font-extrabold tracking-[4px] text-white">QADIR ADMIN</h1>
          <p className="mt-2 text-[16px] font-bold text-dim">لوحة تحكم منظومة قادر فود</p>
        </div>

        {/* الإحصائيات الـ٣ في التصميم — مش بتترسم من غير endpoint عام. */}
        {HAS_PUBLIC_STATS_ENDPOINT ? null : (
          <p className="max-w-[360px] text-center text-[11.5px] font-bold leading-relaxed text-dim/70">
            إحصائيات المنصة بتظهر بعد تسجيل الدخول — مؤشرات المنصة محمية ومحتاجة صلاحية أدمن
          </p>
        )}
      </section>

      {/* ── اللوحة اليمين: النموذج ── */}
      <section className="flex w-[520px] shrink-0 flex-col justify-center overflow-y-auto bg-soft px-16 py-10">
        <h2 className="text-[28px] font-black text-ink">تسجيل الدخول</h2>

        <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-4">
          <Field label="البريد الإلكتروني" htmlFor="identifier">
            <TextInput
              id="identifier"
              latin
              type="text"
              autoComplete="username"
              inputMode="email"
              placeholder="admin@delivery.sa"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              invalid={login.isError}
            />
          </Field>

          <Field label="كلمة المرور" htmlFor="password">
            <TextInput
              id="password"
              latin
              type="password"
              autoComplete="current-password"
              placeholder="••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              invalid={login.isError}
            />
          </Field>

          <TwoFactorBlock />

          {login.isError ? (
            <p className="rounded-[10px] border border-bad-line bg-bad-tint px-3 py-2.5 text-[12.5px] font-bold text-bad-deep">
              {login.error.message}
            </p>
          ) : null}

          <Button
            type="submit"
            size="lg"
            block
            loading={login.isPending}
            disabled={!identifier.trim() || !password}
            className="mt-1"
          >
            دخول اللوحة
          </Button>
        </form>
      </section>
    </div>
  );
}

/**
 * التحقق بخطوتين — الـ API مافيهوش 2FA (شوف auth.module.ts: login بياخد
 * identifier + password بس). فبنرسم البلوك معطّل بملاحظة أمينة بدل ما نعمل
 * حقل كود شكلي بيتجاهل أصلاً.
 */
function TwoFactorBlock() {
  return (
    <div className="mt-1 rounded-[12px] border border-line bg-surface p-4 opacity-60" aria-disabled>
      <p className="text-[12.5px] font-extrabold text-label">🔐 التحقق بخطوتين (2FA)</p>

      <div className="mt-3 flex justify-between gap-2" dir="ltr">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className={cx(
              'flex h-[54px] w-[48px] items-center justify-center rounded-[11px]',
              'border border-line bg-soft font-num text-[20px] font-extrabold text-faint',
            )}
            aria-hidden
          >
            ·
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] font-bold leading-relaxed text-faint">
        التحقق بخطوتين هيتفعّل مع ربط المصادقة الثنائية
      </p>
    </div>
  );
}
