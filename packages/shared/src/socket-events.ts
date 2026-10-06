// أحداث Socket.IO — العقد بين السيرفر وكل عميل (مطعم / كابتن / عميل / أدمن).
// الغرف (rooms): branch:{branchId} · order:{orderId} · captain:{captainId} · customer:{customerId} · admin

import type { OrderStatus, CaptainStatus, RestaurantStatus } from './enums';

/** أحداث السيرفر → العميل */
export const ServerEvents = {
  // ── تطبيق المطعم ──
  ORDER_NEW: 'order:new', // طلب وارد جديد — يشغّل صوت التنبيه المتكرر
  ORDER_CANCELLED_BY_CUSTOMER: 'order:cancelled_by_customer',
  CAPTAIN_ASSIGNED: 'order:captain_assigned', // بيانات الكابتن المسند للفرع
  CAPTAIN_ARRIVED_AT_BRANCH: 'order:captain_arrived',

  // ── تطبيق الكابتن ──
  TRIP_OFFER: 'trip:offer', // عرض مهمة (مع مهلة قبول)
  TRIP_OFFER_EXPIRED: 'trip:offer_expired',
  TRIP_CANCELLED: 'trip:cancelled',
  ORDER_READY: 'order:ready', // المطعم خلّص التحضير

  // ── تطبيق العميل ──
  ORDER_STATUS_CHANGED: 'order:status_changed',
  CAPTAIN_LOCATION: 'captain:location', // تتبع لحظي على الخريطة
  ETA_UPDATED: 'order:eta_updated',

  // ── محادثة الطلب (عميل ↔ مندوب) ──
  ORDER_MESSAGE: 'order:message',

  // ── مشترك ──
  BRANCH_STATUS_CHANGED: 'branch:status_changed',
  ERROR: 'error',
} as const;

/** أحداث العميل → السيرفر */
export const ClientEvents = {
  JOIN: 'join', // { rooms: string[] }
  LEAVE: 'leave',
  CAPTAIN_LOCATION_UPDATE: 'captain:location_update', // كل ٥ ثواني وهو في مهمة
  CAPTAIN_STATUS_UPDATE: 'captain:status_update',
  TRIP_OFFER_RESPONSE: 'trip:offer_response', // { orderId, accepted }
  HEARTBEAT: 'heartbeat',
} as const;

// ── أشكال الحمولة (Payloads) ──

export interface LatLng {
  lat: number;
  lng: number;
}

export interface OrderNewPayload {
  orderId: string;
  orderNumber: string;
  branchId: string;
  total: number;
  itemCount: number;
  customerNotes?: string;
  placedAt: string; // ISO — منه يتحسب العداد الزمني في كارت الطلب
  items: { nameAr: string; quantity: number; notes?: string; options: string[] }[];
}

export interface OrderStatusChangedPayload {
  orderId: string;
  status: OrderStatus;
  etaMinutes?: number;
  captain?: { id: string; name: string; phone: string; plateNumber?: string; rating: number };
  changedAt: string;
}

export interface CaptainLocationPayload {
  captainId: string;
  orderId?: string;
  location: LatLng;
  heading?: number;
  speedKmh?: number;
  at: string;
}

export interface TripOfferPayload {
  orderId: string;
  orderNumber: string;
  branch: { id: string; nameAr: string; location: LatLng; address: string };
  dropoff: { location: LatLng; district: string };
  distanceKm: number;
  payout: number;
  expiresInSeconds: number; // مهلة القبول
}

export interface BranchStatusChangedPayload {
  branchId: string;
  status: RestaurantStatus;
  busyExtraMinutes?: number;
}

export interface CaptainStatusUpdatePayload {
  status: CaptainStatus;
  location?: LatLng;
}

export interface OrderMessagePayload {
  id: string;
  orderId: string;
  senderRole: 'CUSTOMER' | 'CAPTAIN' | 'SYSTEM';
  body: string;
  createdAt: string; // ISO
}
