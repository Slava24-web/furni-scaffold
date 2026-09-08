import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

interface TenantLookup {
  id: string;
  allowed_origins: string[];
}

declare module 'express' {
  interface Request {
    tenantId?: string;
  }
}

/**
 * Определяет тенанта: по API-ключу (кабинет) или по публичному slug
 * с проверкой Origin (встроенный виджет на сайте магазина).
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const slug = req.header('x-tenant-slug');
    if (!slug) throw new UnauthorizedException('Не указан тенант');

    // Через resolve_tenant, а не через обычный SELECT: политика RLS на
    // tenants пускает только к своей строке, а tenant_id на этом шаге ещё
    // не известен. Функция объявлена SECURITY DEFINER и отдаёт ровно два
    // поля по одному slug — см. migrations/0001_init/rls.sql.
    const [tenant] = await this.prisma.$queryRaw<TenantLookup[]>`
      SELECT id, allowed_origins FROM resolve_tenant(${slug})
    `;
    if (!tenant) throw new UnauthorizedException('Тенант не найден');

    // Защита виджета от встраивания на чужих доменах (ТЗ 11.2)
    const origin = req.header('origin');
    if (origin && tenant.allowed_origins.length > 0) {
      const allowed = tenant.allowed_origins.some((o) => originMatches(origin, o));
      if (!allowed) throw new UnauthorizedException('Домен не разрешён для этого тенанта');
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }

    req.tenantId = tenant.id;
    next();
  }
}

function originMatches(origin: string, pattern: string): boolean {
  if (pattern === origin) return true;
  if (pattern.startsWith('*.')) {
    const host = new URL(origin).hostname;
    return host.endsWith(pattern.slice(1));
  }
  return false;
}
