import { describe, expect, it } from 'vitest';
import { checkModel, modelPublishable, type ModelFacts } from './modelCheck';

/** Корректная модель нижнего шкафа: по ней и меряется всё остальное. */
const good = (over: Partial<ModelFacts> = {}): ModelFacts => ({
  widthMm: 800,
  heightMm: 820,
  depthMm: 560,
  minYMm: 0,
  centreXMm: 0,
  centreZMm: 0,
  triangles: 1200,
  materials: ['white', 'oak', 'steel'],
  maxTextureSize: 1024,
  nodeNames: ['carcass', 'door1'],
  ...over,
});

const codes = (facts: ModelFacts): string[] => checkModel(facts).map((issue) => issue.code);

describe('приёмка модели', () => {
  it('правильная модель проходит без замечаний', () => {
    expect(checkModel(good())).toEqual([]);
    expect(modelPublishable(checkModel(good()))).toBe(true);
  });

  it('модель в метрах не пропускается', () => {
    // 0.8 «единицы» вместо 800 мм: шкаф размером со спичечный коробок
    expect(codes(good({ widthMm: 0.8, heightMm: 0.82, depthMm: 0.56 }))).toContain('units-tiny');
    expect(modelPublishable(checkModel(good({ widthMm: 0.8, heightMm: 0.82, depthMm: 0.56 })))).toBe(
      false,
    );
  });

  it('подозрительно большая модель — предупреждение, а не запрет', () => {
    const issues = checkModel(good({ heightMm: 9000 }));
    expect(issues.map((i) => i.code)).toContain('units-huge');
    // Бывают и такие изделия: решение за магазином
    expect(modelPublishable(issues)).toBe(true);
  });

  it('origin в центре габарита — ошибка с точным советом', () => {
    const issues = checkModel(good({ minYMm: -410 }));
    const origin = issues.find((issue) => issue.code === 'origin-height')!;
    expect(origin.level).toBe('error');
    expect(origin.message).toContain('утонет в полу');
    expect(origin.fix).toContain('в центре габарита');
  });

  it('модель, висящая над полом, тоже ошибка', () => {
    const issues = checkModel(good({ minYMm: 150 }));
    expect(issues.find((i) => i.code === 'origin-height')?.message).toContain('повиснет');
  });

  it('округление экспортёра не считается смещением', () => {
    expect(codes(good({ minYMm: 1, centreXMm: -1 }))).toEqual([]);
  });

  it('смещение в полкорпуса ломает стыковку', () => {
    const issues = checkModel(good({ centreXMm: 400 }));
    expect(issues.find((i) => i.code === 'origin-plan')?.level).toBe('error');
  });

  it('торчащая ручка сдвигает коробку, но это не ошибка', () => {
    // Наш же нижний шкаф: корпус 560, фасад с ручкой выносит коробку
    // вперёд на 29 мм. Центрировать по коробке нельзя — спинка отойдёт
    // от стены при примагничивании
    const issues = checkModel(good({ depthMm: 618, centreZMm: 29 }));
    const found = issues.find((i) => i.code === 'origin-protrusion');
    expect(found?.level).toBe('warning');
    expect(modelPublishable(issues)).toBe(true);
  });

  it('превышение бюджета треугольников не публикуется', () => {
    const issues = checkModel(good({ triangles: 120_000 }));
    expect(issues.find((i) => i.code === 'triangles')?.level).toBe('error');
    expect(modelPublishable(issues)).toBe(false);
  });

  it('слишком крупная текстура не публикуется', () => {
    expect(codes(good({ maxTextureSize: 4096 }))).toContain('texture-size');
  });

  it('модель без материалов не публикуется', () => {
    expect(codes(good({ materials: [] }))).toContain('materials-none');
  });

  it('материалов больше бюджета — ошибка', () => {
    const many = Array.from({ length: 12 }, (_, i) => `m${i}`);
    expect(codes(good({ materials: many }))).toContain('materials-many');
  });

  it('один материал на изделие — заметка: отделку не сменить', () => {
    const issues = checkModel(good({ materials: ['white'] }));
    expect(issues.find((i) => i.code === 'materials-single')?.level).toBe('note');
    expect(modelPublishable(issues)).toBe(true);
  });

  it('без узлов door и drawer дверцы не откроются', () => {
    const issues = checkModel(good({ nodeNames: ['carcass', 'shelf'] }));
    expect(issues.find((i) => i.code === 'movable-none')?.level).toBe('note');
  });

  it('узел drawer1 считается подвижной деталью', () => {
    expect(codes(good({ nodeNames: ['box', 'drawer1', 'drawer2'] }))).not.toContain('movable-none');
  });
});
