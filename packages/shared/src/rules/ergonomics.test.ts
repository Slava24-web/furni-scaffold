import { describe, expect, it } from 'vitest';
import {
  GOOD_AISLE_MM,
  MIN_AISLE_MM,
  checkErgonomics,
  type ErgonomicFinding,
} from './ergonomics';
import type { CatalogProduct } from '../catalog/schema';
import type { Placement } from '../scene/schema';

const product = (
  sku: string,
  role: CatalogProduct['role'],
  size = { widthMm: 600, heightMm: 820, depthMm: 560 },
): CatalogProduct => ({ sku, name: sku, role, ...size }) as CatalogProduct;

const catalog = new Map<string, CatalogProduct>([
  ['SINK', product('SINK', 'sink', { widthMm: 500, heightMm: 200, depthMm: 440 })],
  ['HOB', product('HOB', 'hob', { widthMm: 580, heightMm: 50, depthMm: 510 })],
  ['FRIDGE', product('FRIDGE', 'fridge', { widthMm: 600, heightMm: 2000, depthMm: 650 })],
  ['HOOD', product('HOOD', 'hood', { widthMm: 600, heightMm: 900, depthMm: 500 })],
  ['DISH', product('DISH', 'dishwasher')],
  ['BASE', product('BASE', 'base')],
  ['OVEN', product('OVEN', 'oven', { widthMm: 600, heightMm: 595, depthMm: 550 })],
]);

let counter = 0;
const at = (sku: string, x: number, z: number, rotationY = 0): Placement =>
  ({
    instanceId: `${sku}-${counter++}`,
    sku,
    position: { x, y: 0, z },
    rotationY,
    options: {},
    params: {},
  }) as Placement;

const codes = (findings: ErgonomicFinding[]): string[] => findings.map((f) => f.code);

describe('эргономика кухни', () => {
  it('пустая сцена замечаний не даёт', () => {
    expect(checkErgonomics([], catalog)).toEqual([]);
  });

  it('товар не из каталога пропускается молча', () => {
    expect(checkErgonomics([at('НЕТ', 0, 0)], catalog)).toEqual([]);
  });

  it('мойка вплотную к плите — предупреждение', () => {
    const findings = checkErgonomics([at('SINK', 0, 0), at('HOB', 600, 0)], catalog);
    expect(codes(findings)).toContain('sink-hob-close');
  });

  it('разрыв 500 мм — ещё не ошибка, но и не удобно', () => {
    const findings = checkErgonomics([at('SINK', 0, 0), at('HOB', 1040, 0)], catalog);
    expect(codes(findings)).toContain('sink-hob-tight');
    expect(codes(findings)).not.toContain('sink-hob-close');
  });

  it('нормальный разрыв замечаний не даёт', () => {
    const findings = checkErgonomics([at('SINK', 0, 0), at('HOB', 1400, 0)], catalog);
    expect(codes(findings).filter((code) => code.startsWith('sink-hob'))).toEqual([]);
  });

  it('холодильник у плиты греется', () => {
    const findings = checkErgonomics([at('HOB', 0, 0), at('FRIDGE', 600, 0)], catalog);
    expect(codes(findings)).toContain('fridge-heat');
  });

  it('плита без вытяжки — заметка', () => {
    expect(codes(checkErgonomics([at('HOB', 0, 0)], catalog))).toContain('hood-missing');
  });

  it('вытяжка над плитой замечаний не даёт', () => {
    const findings = checkErgonomics([at('HOB', 0, 0), at('HOOD', 0, 0)], catalog);
    expect(codes(findings).filter((code) => code.startsWith('hood'))).toEqual([]);
  });

  it('вытяжка в стороне от плиты не тянет', () => {
    const findings = checkErgonomics([at('HOB', 0, 0), at('HOOD', 1500, 0)], catalog);
    expect(codes(findings)).toContain('hood-offset');
  });

  it('посудомойка далеко от мойки — заметка', () => {
    const findings = checkErgonomics([at('SINK', 0, 0), at('DISH', 3000, 0)], catalog);
    expect(codes(findings)).toContain('dishwasher-far');
  });

  it('посудомойка рядом с мойкой замечаний не даёт', () => {
    const findings = checkErgonomics([at('SINK', 0, 0), at('DISH', 700, 0)], catalog);
    expect(codes(findings)).not.toContain('dishwasher-far');
  });

  it('узкий проход между встречными рядами', () => {
    // Фронты смотрят навстречу, между ними 300 мм
    const findings = checkErgonomics(
      [at('BASE', 0, 0, 0), at('BASE', 0, 560 + 300, 180)],
      catalog,
    );
    expect(codes(findings)).toContain('aisle-narrow');
  });

  it('проход между минимумом и комфортом — заметка', () => {
    const gap = (MIN_AISLE_MM + GOOD_AISLE_MM) / 2;
    const findings = checkErgonomics(
      [at('BASE', 0, 0, 0), at('BASE', 0, 560 + gap, 180)],
      catalog,
    );
    expect(codes(findings)).toContain('aisle-tight');
  });

  it('широкий проход замечаний не даёт', () => {
    const findings = checkErgonomics(
      [at('BASE', 0, 0, 0), at('BASE', 0, 560 + 1400, 180)],
      catalog,
    );
    expect(codes(findings).filter((code) => code.startsWith('aisle'))).toEqual([]);
  });

  it('ряды спиной друг к другу проходу не мешают', () => {
    const findings = checkErgonomics(
      [at('BASE', 0, 0, 180), at('BASE', 0, 560 + 300, 0)],
      catalog,
    );
    expect(codes(findings).filter((code) => code.startsWith('aisle'))).toEqual([]);
  });

  it('ряды, разъехавшиеся вбок, проходу не мешают', () => {
    const findings = checkErgonomics(
      [at('BASE', 0, 0, 0), at('BASE', 3000, 860, 180)],
      catalog,
    );
    expect(codes(findings).filter((code) => code.startsWith('aisle'))).toEqual([]);
  });

  it('тесный рабочий треугольник', () => {
    const findings = checkErgonomics(
      [at('SINK', 0, 0), at('HOB', 800, 0), at('FRIDGE', 400, 500)],
      catalog,
    );
    expect(codes(findings)).toContain('triangle-tight');
  });

  it('растянутый рабочий треугольник', () => {
    const findings = checkErgonomics(
      [at('SINK', 0, 0), at('HOB', 3000, 0), at('FRIDGE', 0, 3000)],
      catalog,
    );
    expect(codes(findings)).toContain('triangle-wide');
  });

  it('треугольник в норме замечаний не даёт', () => {
    const findings = checkErgonomics(
      [at('SINK', 0, 0), at('HOB', 1600, 0), at('FRIDGE', 0, 1600)],
      catalog,
    );
    expect(codes(findings).filter((code) => code.startsWith('triangle'))).toEqual([]);
  });

  it('без одной из трёх вершин треугольник не считается', () => {
    const findings = checkErgonomics([at('SINK', 0, 0), at('HOB', 1600, 0)], catalog);
    expect(codes(findings).filter((code) => code.startsWith('triangle'))).toEqual([]);
  });

  it('предупреждения идут раньше заметок', () => {
    const findings = checkErgonomics(
      [at('SINK', 0, 0), at('HOB', 600, 0), at('FRIDGE', 4000, 4000)],
      catalog,
    );
    const severities = findings.map((finding) => finding.severity);
    expect(severities).toEqual([...severities].sort((a, b) => (a === 'warning' ? -1 : 1)));
  });

  it('замечание называет виновников: их надо подсветить', () => {
    const [finding] = checkErgonomics([at('SINK', 0, 0), at('HOB', 600, 0)], catalog);
    expect(finding?.instanceIds.length).toBeGreaterThanOrEqual(2);
  });
});
