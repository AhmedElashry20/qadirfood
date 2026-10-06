import {
  Module,
  Global,
  Injectable,
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard, Roles, RolesGuard } from '../common';

// ── كتالوج التكاملات والربط مع الهيئات ──
// كل تكامل ليه حقوله، و«مربوط» لو كل الحقول الإلزامية (required) متعبّاة.
interface FieldDef {
  key: string;
  label: string;
  secret?: boolean;
  placeholder?: string;
}
interface IntegrationDef {
  id: string;
  name: string;
  desc: string;
  fields: FieldDef[];
  required: string[];
  docsUrl?: string;
}

export const INTEGRATIONS: IntegrationDef[] = [
  {
    id: 'payment',
    name: 'بوابة الدفع — ميسّر',
    desc: 'تحصيل إلكتروني (مدى/Apple Pay/بطاقات). محتاج حساب تاجر وسجل تجاري.',
    fields: [
      { key: 'PAYMENT_PROVIDER', label: 'المزوّد', placeholder: 'moyasar' },
      { key: 'MOYASAR_SECRET_KEY', label: 'المفتاح السري', secret: true },
      { key: 'MOYASAR_WEBHOOK_SECRET', label: 'سر الـ Webhook', secret: true },
    ],
    required: ['PAYMENT_PROVIDER', 'MOYASAR_SECRET_KEY'],
    docsUrl: 'https://moyasar.com',
  },
  {
    id: 'sms',
    name: 'رسائل OTP — Unifonic',
    desc: 'إرسال رمز التحقق الحقيقي للعملاء والكباتن.',
    fields: [
      { key: 'SMS_PROVIDER', label: 'المزوّد', placeholder: 'unifonic' },
      { key: 'UNIFONIC_APPSID', label: 'App SID', secret: true },
      { key: 'SMS_SENDER_ID', label: 'اسم المُرسِل' },
    ],
    required: ['UNIFONIC_APPSID'],
    docsUrl: 'https://unifonic.com',
  },
  {
    id: 'fcm',
    name: 'إشعارات Push — Firebase',
    desc: 'إشعارات للعميل والكابتن عند تغيّر حالة الطلب.',
    fields: [
      { key: 'FCM_PROJECT_ID', label: 'Project ID' },
      { key: 'FCM_CLIENT_EMAIL', label: 'Client Email' },
      { key: 'FCM_PRIVATE_KEY', label: 'Private Key', secret: true },
    ],
    required: ['FCM_PROJECT_ID', 'FCM_PRIVATE_KEY'],
    docsUrl: 'https://console.firebase.google.com',
  },
  {
    id: 'zatca',
    name: 'الفوترة الضريبية — ZATCA (فاتورة)',
    desc: 'اعتماد الفاتورة الإلكترونية (المرحلة الثانية). محتاج CSID من هيئة الزكاة.',
    fields: [
      { key: 'ZATCA_VAT_NUMBER', label: 'الرقم الضريبي (١٥ رقم)' },
      { key: 'ZATCA_SELLER_NAME', label: 'اسم البائع المسجّل' },
      { key: 'ZATCA_CSID', label: 'شهادة CSID', secret: true },
      { key: 'ZATCA_ENV', label: 'البيئة', placeholder: 'sandbox | production' },
    ],
    required: ['ZATCA_VAT_NUMBER', 'ZATCA_CSID'],
    docsUrl: 'https://zatca.gov.sa',
  },
  {
    id: 'tga',
    name: 'هيئة النقل — بطاقة التوصيل',
    desc: 'التحقق الآلي من بطاقة تشغيل الكابتن. محتاج رقم منشأة ومفتاح من الهيئة.',
    fields: [
      { key: 'TGA_ESTABLISHMENT_NUMBER', label: 'رقم المنشأة' },
      { key: 'TGA_API_KEY', label: 'مفتاح API', secret: true },
      { key: 'TGA_ENFORCE', label: 'إلزام التحقق (1/0)', placeholder: '0' },
    ],
    required: ['TGA_ESTABLISHMENT_NUMBER', 'TGA_API_KEY'],
    docsUrl: 'https://tga.gov.sa',
  },
  {
    id: 'loyalty',
    name: 'نقاط الولاء والإحالة',
    desc: 'نقاط على كل ريال، تُستبدل كخصم. ومكافأة إحالة للداعي والمدعو بعد أول طلب تم تسليمه.',
    fields: [
      { key: 'LOYALTY_ENABLED', label: 'تفعيل البرنامج (1/0)', placeholder: '0' },
      { key: 'LOYALTY_POINTS_PER_SAR', label: 'نقاط لكل ريال', placeholder: '1' },
      { key: 'LOYALTY_POINT_VALUE_SAR', label: 'قيمة النقطة بالريال', placeholder: '0.05' },
      { key: 'LOYALTY_REFERRAL_POINTS', label: 'نقاط مكافأة الإحالة', placeholder: '500' },
    ],
    required: ['LOYALTY_ENABLED'],
  },
  {
    id: 'routing',
    name: 'المسافات والمسارات — OSRM',
    desc: 'مسافة طريق فعلية بدل التقدير الهوائي. تحدّد مستحق الكابتن والوقت المتوقع. الخادم العام ليس للإنتاج — استضف نسختك.',
    fields: [
      { key: 'ROUTING_PROVIDER', label: 'المزوّد', placeholder: 'osrm (فارغ = تقدير هوائي)' },
      { key: 'ROUTING_OSRM_URL', label: 'عنوان سيرفر OSRM', placeholder: 'https://osrm.example.com' },
      { key: 'ROUTING_TIMEOUT_MS', label: 'مهلة النداء (ملّي ثانية)', placeholder: '2500' },
    ],
    required: ['ROUTING_PROVIDER', 'ROUTING_OSRM_URL'],
    docsUrl: 'https://project-osrm.org',
  },
  {
    id: 'storage',
    name: 'التخزين السحابي — S3',
    desc: 'رفع صور المنتجات والوثائق والسيلفي على سحابة بدل القرص المحلي.',
    fields: [
      { key: 'S3_BUCKET', label: 'اسم الـ Bucket' },
      { key: 'S3_REGION', label: 'المنطقة' },
      { key: 'S3_ACCESS_KEY', label: 'Access Key', secret: true },
      { key: 'S3_SECRET_KEY', label: 'Secret Key', secret: true },
    ],
    required: ['S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'],
  },
];

const isSecret = (key: string) =>
  INTEGRATIONS.some((i) => i.fields.some((f) => f.key === key && f.secret));

class SettingItemDto {
  @IsString() key!: string;
  @IsOptional() @IsString() value?: string;
}
class SaveSettingsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SettingItemDto)
  items!: SettingItemDto[];
}

@Global()
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** القيمة الفعّالة = إعداد اللوحة (DB) وإلا متغيّر البيئة. المصدر اللي التكاملات المفروض تقراه. */
  async get(key: string): Promise<string | undefined> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    if (row?.value != null && row.value !== '') return row.value;
    return this.config.get<string>(key) ?? undefined;
  }

  async setMany(items: { key: string; value?: string }[]) {
    const allowed = new Set(INTEGRATIONS.flatMap((i) => i.fields.map((f) => f.key)));
    for (const it of items) {
      if (!allowed.has(it.key)) continue; // نقبل مفاتيح الكتالوج بس
      // فراغ = مسح (نرجع لمتغيّر البيئة).
      if (it.value == null || it.value === '') {
        await this.prisma.setting.deleteMany({ where: { key: it.key } });
      } else {
        await this.prisma.setting.upsert({
          where: { key: it.key },
          create: { key: it.key, value: it.value },
          update: { value: it.value },
        });
      }
    }
    return this.integrationsStatus();
  }

  /** كتالوج التكاملات + الحالة (مربوط/لأ) + قيم مقنّعة للأسرار. */
  async integrationsStatus() {
    const keys = INTEGRATIONS.flatMap((i) => i.fields.map((f) => f.key));
    const effective: Record<string, string | undefined> = {};
    for (const k of keys) effective[k] = await this.get(k);

    return INTEGRATIONS.map((integ) => ({
      id: integ.id,
      name: integ.name,
      desc: integ.desc,
      docsUrl: integ.docsUrl,
      linked: integ.required.every((k) => !!effective[k]),
      fields: integ.fields.map((f) => {
        const val = effective[f.key];
        return {
          key: f.key,
          label: f.label,
          secret: !!f.secret,
          placeholder: f.placeholder,
          set: !!val,
          // الأسرار: مابنرجّعش قيمتها، بس معاينة آخر ٤ خانات.
          value: f.secret ? undefined : (val ?? ''),
          preview: f.secret && val ? `••••${val.slice(-4)}` : undefined,
        };
      }),
    }));
  }
}

@ApiTags('admin/settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('integrations')
  @ApiOperation({ summary: 'كل التكاملات وحالتها ومفاتيحها (الأسرار مقنّعة)' })
  integrations() {
    return this.settings.integrationsStatus();
  }

  @Put()
  @ApiOperation({ summary: 'حفظ مفاتيح التكاملات' })
  save(@Body() dto: SaveSettingsDto) {
    return this.settings.setMany(dto.items);
  }
}

@Global()
@Module({
  providers: [SettingsService],
  controllers: [SettingsController],
  exports: [SettingsService],
})
export class SettingsModule {}
