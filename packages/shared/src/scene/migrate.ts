import { SCENE_DOC_VERSION, SceneDocSchema, type SceneDoc } from './schema';

type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

/**
 * Миграции документа сцены. Ключ — версия, ИЗ которой мигрируем.
 * При добавлении поля в схему обязательно добавить миграцию,
 * иначе старые сохранённые сцены перестанут открываться.
 */
const MIGRATIONS: Record<number, Migration> = {
  // 1: (doc) => ({ ...doc, version: 2, newField: default }),
};

export function migrateSceneDoc(raw: unknown): SceneDoc {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Документ сцены повреждён: ожидался объект');
  }
  let doc = raw as Record<string, unknown>;
  let version = typeof doc.version === 'number' ? doc.version : 0;

  while (version < SCENE_DOC_VERSION) {
    const migration = MIGRATIONS[version];
    if (!migration) {
      throw new Error(`Нет миграции документа сцены с версии ${version}`);
    }
    doc = migration(doc);
    version = doc.version as number;
  }

  return SceneDocSchema.parse(doc);
}
