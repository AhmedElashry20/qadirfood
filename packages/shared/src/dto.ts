// أشكال الردود (Response DTOs) المشتركة بين الـ API واللوحات.

import type {
  OrderStatus,
  RestaurantStatus,
  ItemAvailability,
  PaymentMethod,
  CaptainStatus,
} from './enums';

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OrderItemDto {
  id: string;
  nameAr: string;
  nameEn: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  notes?: string;
  options: { groupNameAr: string; nameAr: string; extraPrice: number }[];
}

export interface OrderDto {
  id: string;
  orderNumber: string;
  pickupCode: string;
  status: OrderStatus;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  vat: number;
  total: number;
  paymentMethod: PaymentMethod;
  customerNotes?: string;
  prepMinutes?: number;
  rejectReason?: string;
  placedAt: string;
  acceptedAt?: string;
  readyAt?: string;
  deliveredAt?: string;
  items: OrderItemDto[];
  customer: { id: string; fullName: string; phone: string };
  address: { label: string; district?: string; street?: string; notes?: string; lat: number; lng: number };
  branch: { id: string; nameAr: string; lat: number; lng: number };
  captain?: { id: string; fullName: string; phone: string; plateNumber?: string; rating: number };
}

export interface BranchDto {
  id: string;
  restaurantId: string;
  nameAr: string;
  nameEn: string;
  city: string;
  address: string;
  status: RestaurantStatus;
  busyExtraMinutes: number;
  avgPrepMinutes: number;
  rating: number;
  lat: number;
  lng: number;
}

export interface MenuItemDto {
  id: string;
  categoryId: string;
  nameAr: string;
  nameEn: string;
  descriptionAr?: string;
  imageUrl?: string;
  price: number;
  calories?: number;
  availability: ItemAvailability;
  optionGroups: OptionGroupDto[];
}

export interface OptionGroupDto {
  id: string;
  nameAr: string;
  nameEn: string;
  type: 'SINGLE' | 'MULTI';
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  options: { id: string; nameAr: string; nameEn: string; extraPrice: number; isAvailable: boolean }[];
}

export interface CaptainDto {
  id: string;
  fullName: string;
  phone: string;
  status: CaptainStatus;
  vehicleType: string;
  plateNumber?: string;
  rating: number;
  isVerified: boolean;
  lat?: number;
  lng?: number;
}

// ── تقارير المطعم (شاشة ١٢) ──
export interface MerchantReportDto {
  range: { from: string; to: string };
  totalSales: number;
  orderCount: number;
  avgOrderValue: number;
  rejectionRate: number; // %
  cancellationRate: number; // %
  topItems: { menuItemId: string; nameAr: string; count: number; revenue: number }[];
  salesByDay: { date: string; sales: number; orders: number }[];
  settlement: { netPayout: number; commission: number; status: string; transferredAt?: string };
}

// ── طلبات الإنشاء (Request DTOs) ──
export interface AcceptOrderRequest {
  prepMinutes: number; // 10 | 15 | 20 | 30 | مخصص
}

export interface RejectOrderRequest {
  reason: string; // إلزامي
}

export interface UpdateBranchStatusRequest {
  status: RestaurantStatus;
  busyExtraMinutes?: number; // مطلوب لما الحالة BUSY
}

export interface UpdateItemAvailabilityRequest {
  availability: ItemAvailability;
}

export interface CreateOrderRequest {
  branchId: string;
  addressId: string;
  paymentMethod: PaymentMethod;
  couponCode?: string;
  customerNotes?: string;
  items: {
    menuItemId: string;
    quantity: number;
    notes?: string;
    optionIds: string[];
  }[];
}
