// socket.io-client — غرفة admin
import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getTokens } from './auth';

/**
 * أسماء الأحداث — مطابقة حرف بحرف لـ apps/api/src/tracking/tracking.gateway.ts.
 * الأدمن بيدخل غرفة `admin` تلقائياً من السيرفر وقت الاتصال، مش محتاج join.
 */
export const EV = {
  ORDER_NEW: 'order:new',
  ORDER_CANCELLED_BY_CUSTOMER: 'order:cancelled_by_customer',
  CAPTAIN_ASSIGNED: 'order:captain_assigned',
  CAPTAIN_ARRIVED_AT_BRANCH: 'order:captain_arrived',
  ORDER_READY: 'order:ready',
  ORDER_STATUS_CHANGED: 'order:status_changed',
  CAPTAIN_LOCATION: 'captain:location',
  ETA_UPDATED: 'order:eta_updated',
  BRANCH_STATUS_CHANGED: 'branch:status_changed',
  ADMIN_ALERT: 'admin:alert',
  ERROR: 'error',
} as const;

export type SocketEvent = (typeof EV)[keyof typeof EV];

let socket: Socket | null = null;

/** بينشئ الاتصال لو مش موجود، وبيرجّع نفس الـ socket في أي نداء تاني. */
export function connectSocket(): Socket | null {
  const token = getTokens()?.accessToken;
  if (!token) return null;

  if (socket?.connected || socket?.active) return socket;

  socket ??= io({
    // نفس الأصل — vite بيعمل proxy لـ /socket.io على :3000
    path: '/socket.io',
    transports: ['websocket'],
    auth: { token },
    autoConnect: true,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 5_000,
  });

  return socket;
}

export function getSocket(): Socket | null {
  return socket;
}

export function disconnectSocket(): void {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}

/**
 * اشتراك في حدث سوكيت مع تنظيف صحيح.
 * الـ handler متخزّن في ref عشان ما نفضّش الاشتراك مع كل رندر.
 */
export function useSocketEvent<T>(event: SocketEvent | string, handler: (payload: T) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const instance = connectSocket();
    if (!instance) return;

    const listener = (payload: T) => handlerRef.current(payload);
    instance.on(event, listener);

    return () => {
      instance.off(event, listener);
    };
  }, [event]);
}

/** يوصل السوكيت طول ما الكومبوننت شغال — بيتنادى مرة في الـ Shell. */
export function useSocketConnection(): void {
  useEffect(() => {
    connectSocket();
    return () => {
      // مش بنقفل هنا: الـ Shell بيفضل شغال طول الجلسة،
      // والقفل الحقيقي بيحصل في logout().
    };
  }, []);
}

/** الدخول/الخروج من غرف إضافية (زي `order:<id>`) — الأدمن مسموح له بأي غرفة. */
export function joinRooms(rooms: string[]): void {
  connectSocket()?.emit('join', { rooms });
}

export function leaveRooms(rooms: string[]): void {
  getSocket()?.emit('leave', { rooms });
}
