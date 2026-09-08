import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { SceneDocSchema, emptySceneDoc, migrateSceneDoc, type SceneDoc } from '@furni/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ScenesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, ownerSession: string): Promise<{ id: string; shareCode: string; doc: SceneDoc }> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const doc = emptySceneDoc();
      const scene = await tx.scene.create({
        data: {
          tenantId,
          ownerSession,
          shareCode: shortCode(),
          doc: doc as unknown as object,
          docVersion: doc.version,
        },
      });
      return { id: scene.id, shareCode: scene.shareCode, doc };
    });
  }

  async get(tenantId: string, id: string): Promise<SceneDoc> {
    return this.prisma.withTenant(tenantId, async (tx) => {
      const scene = await tx.scene.findFirst({ where: { id } });
      if (!scene) throw new NotFoundException('Сцена не найдена');
      // Прогоняем через миграции: старые сохранённые сцены должны открываться
      return migrateSceneDoc(scene.doc);
    });
  }

  /**
   * Сохранение сцены. Автосохранение шлёт документ целиком каждые 10 с (ТЗ FR-PLN-12).
   * Документ маленький (ссылки на SKU + трансформации), diff тут избыточен.
   */
  async save(tenantId: string, id: string, raw: unknown): Promise<{ updatedAt: Date }> {
    const doc = SceneDocSchema.parse(raw);
    return this.prisma.withTenant(tenantId, async (tx) => {
      const scene = await tx.scene.updateMany({
        where: { id, editable: true },
        data: { doc: doc as unknown as object, docVersion: doc.version },
      });
      if (scene.count === 0) throw new NotFoundException('Сцена не найдена или закрыта для правки');
      const updated = await tx.scene.findFirstOrThrow({ where: { id }, select: { updatedAt: true } });
      return updated;
    });
  }
}

/** Код для шаринга. 8 символов base32 без похожих глифов. */
function shortCode(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
