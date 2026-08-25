// فاتورة ضريبية مبسّطة (ZATCA المرحلة الأولى) لطلب.
//
// البائع المسجّل هو المنصة: هي اللي بتحصّل الدفع وبتصدر فاتورة واحدة للعميل
// عن الطلب كله (أكل + توصيل). الرقم الضريبي واسم البائع من إعدادات المنصة
// (env)، مش من المطعم — المطعم بيتحاسب مع المنصة بفاتورة B2B منفصلة (بره النطاق).

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus, UserRole } from '@prisma/client';
import Decimal from 'decimal.js';
import * as QRCode from 'qrcode';

import type { AuthUser } from '../common';
import { PrismaService } from '../prisma/prisma.service';
import { encodeZatcaQr } from './zatca';

/** الفواتير بتتصدر للبيع اللي تمّ فعلاً — مش لطلب لسه ماتدفعش أو فشل دفعه. */
const INVOICEABLE: PaymentStatus[] = [
  PaymentStatus.PAID,
  PaymentStatus.PARTIALLY_REFUNDED,
  PaymentStatus.REFUNDED,
];

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private seller() {
    return {
      name: this.config.get<string>('ZATCA_SELLER_NAME') ?? 'قادر فود',
      vatNumber: this.config.get<string>('ZATCA_VAT_NUMBER') ?? '',
    };
  }

  async invoiceForOrder(user: AuthUser, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        customer: { include: { user: true } },
        branch: { include: { restaurant: true } },
      },
    });
    if (!order) throw new NotFoundException('الطلب غير موجود');

    // العميل بيشوف فاتورته بس؛ المطعم فواتير فرعه؛ الأدمن الكل.
    if (user.role === UserRole.CUSTOMER && order.customerId !== user.customerId) {
      throw new ForbiddenException();
    }
    if (user.role === UserRole.MERCHANT && order.branchId !== user.branchId) {
      throw new ForbiddenException();
    }
    if (
      user.role !== UserRole.CUSTOMER &&
      user.role !== UserRole.MERCHANT &&
      user.role !== UserRole.ADMIN
    ) {
      throw new ForbiddenException();
    }

    if (!INVOICEABLE.includes(order.paymentStatus)) {
      throw new ForbiddenException('مافيش فاتورة ضريبية لطلب لسه ماتدفعش');
    }

    const seller = this.seller();

    const totalWithVat = new Decimal(order.total.toString());
    const vatTotal = new Decimal(order.vat.toString());
    const totalExclVat = totalWithVat.minus(vatTotal);

    // وقت الفاتورة = وقت التسليم (وقت إتمام البيع)، وإلا وقت الطلب. بـ UTC (Z).
    const issuedAt = order.deliveredAt ?? order.placedAt;
    const timestamp = new Date(issuedAt).toISOString().replace(/\.\d{3}Z$/, 'Z');

    const qrPayload = encodeZatcaQr({
      sellerName: seller.name,
      vatNumber: seller.vatNumber,
      timestamp,
      totalWithVat: totalWithVat.toFixed(2),
      vatTotal: vatTotal.toFixed(2),
    });

    // صورة الـ QR كـ data-URI جاهزة للطباعة/العرض — الفاتورة بتبقى مكتملة
    // من غير ما الواجهة تحتاج مكتبة QR.
    const qrImage = await QRCode.toDataURL(qrPayload, { margin: 1, width: 220 });

    return {
      invoiceNumber: order.orderNumber,
      invoiceType: 'SIMPLIFIED' as const,
      issuedAt: timestamp,
      seller: {
        name: seller.name,
        vatNumber: seller.vatNumber,
        // علم صريح لو الرقم الضريبي مش متظبّط — الفاتورة تبان بس مش صالحة رسمياً.
        vatNumberConfigured: seller.vatNumber.length === 15,
      },
      buyer: { name: order.customer.user.fullName },
      restaurant: { nameAr: order.branch.restaurant.nameAr, branchAr: order.branch.nameAr },
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      lines: order.items.map((item) => ({
        descriptionAr: item.nameAr,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        lineTotal: Number(item.lineTotal),
      })),
      deliveryFee: Number(order.deliveryFee),
      discount: Number(order.discount),
      // كل المبالغ بتوصف الفاتورة نفسها؛ الضريبة ١٥٪ على الوعاء الخاضع.
      totals: {
        totalExclVat: Number(totalExclVat.toFixed(2)),
        vatTotal: Number(vatTotal.toFixed(2)),
        totalWithVat: Number(totalWithVat.toFixed(2)),
        vatRate: 15,
      },
      qr: {
        // محتوى الـ QR الرسمي (TLV base64) — ده اللي تطبيق التحقق بيقراه.
        payload: qrPayload,
        image: qrImage,
      },
      // ملاحظة صريحة إن دي المرحلة الأولى — توليد بس، من غير توقيع/اعتماد.
      note: 'فاتورة ضريبية مبسّطة — توليد المرحلة الأولى. مافيش ربط أو اعتماد مسبق مع هيئة الزكاة (المرحلة الثانية).',
    };
  }
}
