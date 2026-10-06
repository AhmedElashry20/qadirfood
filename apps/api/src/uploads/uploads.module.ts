// رفع الملفات — الأساس اللي الوثائق وصور الأصناف وإثبات التسليم بيعتمدوا عليه.
//
// التخزين محلي دلوقتي (مجلد `uploads/` بيتقدّم كملفات ثابتة). لما نربط S3،
// الحاجة الوحيدة اللي بتتغيّر هي [StorageDriver] — الـ controller والمستهلكين
// مايتغيّروش لأن كلهم بيتعاملوا مع URL بس.
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

import {
  BadRequestException,
  Controller,
  Injectable,
  Module,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

import { CurrentUser, JwtAuthGuard, type AuthUser } from '../common';

/// الأنواع المسموح بيها — أي حاجة تانية بتترفض.
const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

/** ٨ ميجا — كفاية لصورة وثيقة أو صنف. */
const MAX_BYTES = 8 * 1024 * 1024;

/// المجلدات المسموح الرفع جواها — عشان محدش يكتب في مسار عشوائي.
const FOLDERS = ['documents', 'menu', 'delivery', 'avatars', 'selfies'] as const;
type Folder = (typeof FOLDERS)[number];

class UploadDto {
  @IsOptional()
  @IsString()
  @IsIn(FOLDERS as unknown as string[], { message: 'مجلد غير مسموح' })
  folder?: Folder;
}

export interface StoredFile {
  url: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
}

/** واجهة التخزين — استبدلها بـ S3 من غير ما تلمس أي حاجة تانية. */
export abstract class StorageDriver {
  abstract save(file: Express.Multer.File, folder: Folder): Promise<StoredFile>;
  abstract remove(url: string): Promise<void>;
}

@Injectable()
export class LocalStorageDriver extends StorageDriver {
  /** الجذر اللي main.ts بيقدّمه كملفات ثابتة على /uploads. */
  private readonly root = join(process.cwd(), 'uploads');

  async save(file: Express.Multer.File, folder: Folder): Promise<StoredFile> {
    const ext = ALLOWED_MIME[file.mimetype] ?? extname(file.originalname).toLowerCase();

    // اسم عشوائي + بصمة المحتوى: مايبقاش فيه تخمين للمسارات ولا تصادم أسماء.
    const digest = createHash('sha256').update(file.buffer).digest('hex').slice(0, 12);
    const fileName = `${randomUUID()}-${digest}${ext}`;
    const dir = join(this.root, folder);

    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, fileName), file.buffer);

    return {
      url: `/uploads/${folder}/${fileName}`,
      fileName,
      sizeBytes: file.size,
      mimeType: file.mimetype,
    };
  }

  async remove(url: string): Promise<void> {
    // بنقبل بس المسارات اللي إحنا مولّدينها — حماية من path traversal.
    const match = /^\/uploads\/([a-z]+)\/([\w.-]+)$/.exec(url);
    if (!match) return;

    const [, folder, fileName] = match;
    if (!FOLDERS.includes(folder as Folder)) return;

    await unlink(join(this.root, folder, fileName)).catch(() => undefined);
  }
}

@ApiTags('uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly storage: StorageDriver) {}

  @Post()
  @ApiOperation({ summary: 'رفع ملف (وثيقة، صورة صنف، إثبات تسليم)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDto,
  ) {
    if (!file) throw new BadRequestException('لا يوجد ملف مرفوع');

    if (!ALLOWED_MIME[file.mimetype]) {
      throw new BadRequestException('نوع الملف غير مدعوم — الصور وملفات PDF فقط');
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('حجم الملف أكبر من ٨ ميجا');
    }

    const stored = await this.storage.save(file, dto.folder ?? 'documents');
    return { ...stored, uploadedBy: user.userId };
  }
}

@Module({
  controllers: [UploadsController],
  providers: [{ provide: StorageDriver, useClass: LocalStorageDriver }],
  exports: [StorageDriver],
})
export class UploadsModule {}
