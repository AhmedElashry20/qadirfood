// axios + JWT
import axios, {
  AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { clear, getTokens, setTokens } from './auth';

/** خطأ موحّد — الرسالة دايماً عربية وجاهزة للعرض للمستخدم. */
export class ApiError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const FALLBACK_MESSAGE = 'حدث خطأ غير متوقع';
const OFFLINE_MESSAGE = 'تعذّر الاتصال بالخادم — تأكّد أن الـ API يعمل على المنفذ 3000';
const TIMEOUT_MESSAGE = 'انتهت مهلة الطلب — الخادم لا يستجيب';

/**
 * عنوان الـ API.
 *
 * في التطوير يبقى '/api' فيمرّ على بروكسي Vite إلى المنفذ 3000. أما بعد البناء
 * للاستضافة الثابتة فلا يوجد بروكسي — لذا يُمرَّر العنوان الكامل وقت البناء:
 *     VITE_API_URL=https://xxx.onrender.com npm run build
 * بدونه كانت اللوحة تطلب '/api' من دومين الاستضافة نفسه فتحصل على 404.
 */
/**
 * عنوان الـ API.
 *
 * الترتيب: إعداد وقت التشغيل من `config.js` ← متغيّر وقت البناء ← '/api'.
 *
 * إعداد وقت التشغيل هو ما يُعتمد عند النشر على استضافة ثابتة: يُبنى الملف مرة
 * ويُضبط العنوان بعد الرفع بتعديل سطر — بلا إعادة بناء. ونفس الملف تقرؤه
 * تطبيقات الويب الثلاثة، فمصدر العنوان واحد في كل الواجهات.
 *
 * و'/api' يبقى الافتراضي في التطوير فيمرّ على بروكسي Vite كما كان.
 */
function resolveApiBase(): string {
  const runtime = (window as { qadirConfig?: { apiUrl?: string } }).qadirConfig?.apiUrl?.trim();
  const chosen =
    runtime && !runtime.includes('REPLACE_ME')
      ? runtime
      : (import.meta.env.VITE_API_URL ?? '').trim();

  return chosen ? `${chosen.replace(/\/$/, '')}/api` : '/api';
}

const API_BASE = resolveApiBase();

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  /**
   * الفلاتر المصفوفة بتتبعت بأقواس: `status[]=PENDING&status[]=READY`.
   * مهم إنها تفضل بأقواس: `qs` في express بيحوّل `status[]=PENDING` لمصفوفة
   * فيها عنصر واحد، لكن `status=PENDING` (من غير أقواس) بيحوّلها لنص —
   * وساعتها `@IsArray()` في ListOrdersDto بيرفض الطلب.
   */
  paramsSerializer: {
    indexes: false,
  },
});

// ── طلب: إرفاق التوكن ──
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getTokens()?.accessToken;
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

// ── رد: تجديد التوكن مرة واحدة عند 401 ──

/** طلب التجديد الجاري — عشان عشر طلبات فشلوا مع بعض ما يعملوش عشر تجديدات. */
let refreshInFlight: Promise<string> | null = null;

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

function endSession(): never {
  clear();
  if (!window.location.pathname.startsWith('/login')) {
    window.location.replace('/login');
  }
  throw new ApiError('جلسة منتهية — سجّل الدخول من جديد', 401);
}

async function refreshAccessToken(): Promise<string> {
  const tokens = getTokens();
  if (!tokens?.refreshToken) endSession();

  // axios خام — مش الـ instance — عشان ما يدخلش في الـ interceptor تاني
  const { data } = await axios.post<{ accessToken: string; refreshToken: string }>(
    '/api/auth/refresh',
    { refreshToken: tokens.refreshToken },
    { headers: { 'Content-Type': 'application/json' } },
  );

  if (!data?.accessToken || !data?.refreshToken) endSession();

  setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  return data.accessToken;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    const status = error.response?.status;

    const isAuthRoute = config?.url?.includes('/auth/login') || config?.url?.includes('/auth/refresh');

    if (status !== 401 || !config || config._retried || isAuthRoute) {
      return Promise.reject(error);
    }

    config._retried = true;

    try {
      refreshInFlight ??= refreshAccessToken().finally(() => {
        refreshInFlight = null;
      });
      const accessToken = await refreshInFlight;

      config.headers.set('Authorization', `Bearer ${accessToken}`);
      return await api.request(config);
    } catch {
      return endSession();
    }
  },
);

/**
 * بيحوّل رد axios لبيانات، وأي خطأ لـ ApiError برسالة السيرفر العربية.
 * الـ message من Nest ممكن يكون نص أو مصفوفة (أخطاء class-validator).
 */
export async function unwrap<T>(promise: Promise<AxiosResponse<T>>): Promise<T> {
  try {
    const response = await promise;
    return response.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;

    if (axios.isAxiosError(error)) {
      const status = error.response?.status;

      if (error.code === 'ECONNABORTED') throw new ApiError(TIMEOUT_MESSAGE, undefined);

      // مافيش رد أصلاً = الشبكة واقعة (بناء إنتاج بلا بروكسي)
      if (!error.response) throw new ApiError(OFFLINE_MESSAGE, undefined);

      const body = error.response.data as { message?: unknown; error?: unknown } | undefined;
      const raw = body?.message ?? body?.error;

      const message = Array.isArray(raw)
        ? raw.filter((m): m is string => typeof m === 'string').join(' · ') || null
        : typeof raw === 'string' && raw.trim()
          ? raw
          : null;

      /**
       * الخادم مقفول **خلف بروكسي**: بروكسي Vite (وnginx كذلك) بيحوّل رفض
       * الاتصال لرد 500/502 بـ `text/plain` — يعني `error.response` موجود،
       * فشرط «لا اتصال» فوق مابيتنفّذش والرسالة كانت بتقع على «حدث خطأ غير
       * متوقع» وتخفي السبب الحقيقي.
       *
       * العلامة: حالة 5xx بلا رسالة JSON صالحة. الـ API بتاعنا بيرجّع دايماً
       * `{ message }` عربية حتى في أخطاء ٥٠٠ (عبر `HttpExceptionFilter`)،
       * فغيابها معناه إن الرد مش من الـ API أصلاً.
       */
      if (!message && status !== undefined && status >= 500) {
        throw new ApiError(OFFLINE_MESSAGE, status);
      }

      throw new ApiError(message ?? FALLBACK_MESSAGE, status);
    }

    throw new ApiError(FALLBACK_MESSAGE);
  }
}

/** اختصارات — كل نداء في اللوحة بيعدّي من هنا. */
export const get = <T>(url: string, params?: Record<string, unknown>): Promise<T> =>
  unwrap(api.get<T>(url, { params }));

export const post = <T>(url: string, body?: unknown): Promise<T> => unwrap(api.post<T>(url, body));

export const patch = <T>(url: string, body?: unknown): Promise<T> => unwrap(api.patch<T>(url, body));

export const put = <T>(url: string, body?: unknown): Promise<T> => unwrap(api.put<T>(url, body));

export const del = <T>(url: string): Promise<T> => unwrap(api.delete<T>(url));
