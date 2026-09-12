import { describe, expect, it } from 'vitest';
import { checkServices } from './services';
import type { CatalogProduct } from '../catalog/schema';
import type { Placement, ServicePoint } from '../scene/schema';

const product = (sku: string, role: CatalogProduct['role']): CatalogProduct =>
  ({ sku, name: sku, role, widthMm: 600, heightMm: 820, depthMm: 560, resize: {} }) as CatalogProduct;

const catalog = new Map<string, CatalogProduct>([
  ['SINK', product('SINK', 'sink')],
  ['DISH', product('DISH', 'dishwasher')],
  ['HOB', product('HOB', 'hob')],
  ['HOOD', product('HOOD', 'hood')],
  ['BASE', product('BASE', 'base')],
]);

const at = (sku: string, x = 0, z = 0): Placement =>
  ({
    instanceId: `${sku}-${x}`,
    sku,
    position: { x, y: 0, z },
    rotationY: 0,
    options: {},
    params: {},
    size: {},
  }) as Placement;

let counter = 0;
const service = (kind: ServicePoint['kind'], x = 0, y = 0): ServicePoint => ({
  id: `s${counter++}`,
  kind,
  position: { x, y },
  heightMm: 500,
  wallId: null,
  note: '',
});

const codes = (findings: { code: string }[]): string[] => findings.map((finding) => finding.code);

describe('проверка подключений', () => {
  it('без размеченной инженерии молчит', () => {
    // Пустой список означает «ещё не размечали», а не «подключений нет»
    expect(checkServices([at('SINK')], catalog, [])).toEqual([]);
  });

  it('мойка без воды и слива — предупреждение', () => {
    const findings = checkServices([at('SINK')], catalog, [service('socket', 5000, 0)]);
    expect(codes(findings)).toContain('service-sink');
    expect(findings[0]?.message).toContain('вывода воды');
  });

  it('мойка с водой и сливом рядом замечаний не даёт', () => {
    const services = [service('water', 300, 0), service('drain', 200, 0)];
    expect(checkServices([at('SINK')], catalog, services)).toEqual([]);
  });

  it('далёкий вывод не считается: шланг не резиновый', () => {
    const services = [service('water', 4000, 0), service('drain', 4000, 0)];
    expect(codes(checkServices([at('SINK')], catalog, services))).toContain('service-sink');
  });

  it('посудомойке нужны и вода, и слив, и розетка', () => {
    const findings = checkServices([at('DISH')], catalog, [service('water', 200, 0)]);
    expect(findings[0]?.message).toContain('слива');
    expect(findings[0]?.message).toContain('розетки');
  });

  it('плите годится и газ, и розетка', () => {
    expect(checkServices([at('HOB')], catalog, [service('gas', 200, 0)])).toEqual([]);
    expect(checkServices([at('HOB')], catalog, [service('socket', 200, 0)])).toEqual([]);
  });

  it('плита без питания — предупреждение', () => {
    const findings = checkServices([at('HOB')], catalog, [service('water', 200, 0)]);
    expect(codes(findings)).toContain('hob-no-supply');
  });

  it('вытяжке нужен вентканал, и тянуть до него дальше, чем розетку', () => {
    // Гофру тянут дальше, чем провод: предел у вытяжки свой
    expect(checkServices([at('HOOD')], catalog, [service('vent', 2000, 0)])).toEqual([]);
    expect(codes(checkServices([at('HOOD')], catalog, [service('vent', 4000, 0)]))).toContain(
      'service-hood',
    );
  });

  it('обычному модулю подключение не нужно', () => {
    expect(checkServices([at('BASE')], catalog, [service('socket', 9000, 0)])).toEqual([]);
  });

  it('товар не из каталога пропускается молча', () => {
    expect(checkServices([at('НЕТ')], catalog, [service('socket')])).toEqual([]);
  });
});
