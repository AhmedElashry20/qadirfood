// جلسة الأدمن — مخزّنة في localStorage
import { useCallback, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';

const TOKENS_KEY = 'qadir.admin.tokens';
const USER_KEY = 'qadir.admin.user';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

/** شكل المستخدم الراجع من POST /auth/login (auth.service.issueTokens). */
export interface SessionUser {
  id: string;
  fullName: string;
  role: string;
  email?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
}

// ── مخزن بسيط للاشتراك (useSyncExternalStore) ──
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // تغيير الجلسة من تبويب تاني كمان لازم يتعكس هنا
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

// ── التوكنات ──

export function getTokens(): Tokens | null {
  const tokens = readJson<Partial<Tokens>>(TOKENS_KEY);
  if (!tokens?.accessToken || !tokens.refreshToken) return null;
  return { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
}

export function setTokens(tokens: Tokens): void {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  emit();
}

export function getAccessToken(): string | null {
  return getTokens()?.accessToken ?? null;
}

// ── المستخدم ──

export function getUser(): SessionUser | null {
  return readJson<SessionUser>(USER_KEY);
}

export function setUser(user: SessionUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  emit();
}

// ── الجلسة ──

export function clear(): void {
  localStorage.removeItem(TOKENS_KEY);
  localStorage.removeItem(USER_KEY);
  emit();
}

export function isLoggedIn(): boolean {
  return getTokens() !== null;
}

/**
 * لقطة ثابتة للجلسة — useSyncExternalStore بيقارن بالمرجع، فلازم نرجّع
 * نفس الكائن طول ما الـ localStorage ما اتغيّرش.
 */
let snapshot: { user: SessionUser | null; loggedIn: boolean } = {
  user: getUser(),
  loggedIn: isLoggedIn(),
};
let snapshotKey = `${localStorage.getItem(USER_KEY) ?? ''}|${localStorage.getItem(TOKENS_KEY) ?? ''}`;

function getSnapshot(): { user: SessionUser | null; loggedIn: boolean } {
  const key = `${localStorage.getItem(USER_KEY) ?? ''}|${localStorage.getItem(TOKENS_KEY) ?? ''}`;
  if (key !== snapshotKey) {
    snapshotKey = key;
    snapshot = { user: getUser(), loggedIn: isLoggedIn() };
  }
  return snapshot;
}

export interface Session {
  user: SessionUser | null;
  isLoggedIn: boolean;
  logout: () => void;
}

/** الجلسة الحالية + تسجيل الخروج. بيعيد الرسم لوحده لما الجلسة تتغيّر. */
export function useSession(): Session {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const navigate = useNavigate();

  const logout = useCallback(() => {
    clear();
    navigate('/login', { replace: true });
  }, [navigate]);

  return { user: state.user, isLoggedIn: state.loggedIn, logout };
}
