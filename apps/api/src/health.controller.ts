import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from './prisma/prisma.service';
import { RedisService } from './redis/redis.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    const [db, cache] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.raw.ping(),
    ]);

    const healthy = db.status === 'fulfilled' && cache.status === 'fulfilled';
    // 503 لما أي اعتمادية ساقطة — عشان الـ load balancer / Docker healthcheck
    // يوجّه بعيد أو يعيد تشغيل الحاوية بدل ما يفضل يبعتلها ترافيك وهي مكسورة.
    res.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return {
      status: healthy ? 'ok' : 'degraded',
      db: db.status === 'fulfilled' ? 'up' : 'down',
      redis: cache.status === 'fulfilled' ? 'up' : 'down',
      at: new Date().toISOString(),
    };
  }
}
