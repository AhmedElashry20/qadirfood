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

const FALLBACK_MESSAGE = 'حصل خطأ غير متوقع';
const OFFLINE_MESSAGE = 'مافيش اتصال بالسيرفر';

export const api: AxiosInstance = axios.create({
  baseURL: '/api',
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

      // مافيش رد أصلاً = السيرفر مقفول أو الشبكة واقعة
      if (!error.response) throw new ApiError(OFFLINE_MESSAGE, undefined);

      const body = error.response.data as { message?: unknown; error?: unknown } | undefined;
      const raw = body?.message ?? body?.error;

      const message = Array.isArray(raw)
        ? raw.filter((m): m is string => typeof m === 'string').join(' · ') || FALLBACK_MESSAGE
        : typeof raw === 'string' && raw.trim()
          ? raw
          : FALLBACK_MESSAGE;

      throw new ApiError(message, status);
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
