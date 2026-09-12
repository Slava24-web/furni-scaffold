/**
 * Изделия, которые ставят в проём: межкомнатные двери и окна.
 *
 * Описание параметрическое, а не ссылка на готовый GLB: проёмы бывают
 * любой ширины, а масштабирование готовой модели растягивает вместе с
 * полотном и профиль коробки — рама 60 мм превращается в 90, и окно
 * перестаёт быть тем изделием, которое заказали.
 *
 * Ряд размеров и типов взят из ходовой практики: межкомнатные полотна
 * 600/700/800/900 × 2000, окна ПВХ и дерево-алюминий со створками
 * 1–3 штук, подоконник на отметке 800–900.
 *
 * Все размеры — миллиметры целыми (CLAUDE.md).
 */

export type OpeningStyleKind = 'door' | 'window';

/** Из чего сделана коробка: от этого зависят профиль и материал. */
export type FrameProfile = 'wood' | 'pvc' | 'aluminium';

/** Заполнение полотна. */
export type LeafFill =
  /** Глухое гладкое полотно */
  | 'flush'
  /** Филёнчатое: обвязка и утопленные филёнки */
  | 'panel'
  /** Остеклённое: обвязка и стекло */
  | 'glazed';

export interface OpeningStyle {
  code: string;
  name: string;
  kind: OpeningStyleKind;
  profile: FrameProfile;
  /** Полотно двери; у окна заполнение всегда остеклённое */
  fill: LeafFill;
  /** Число створок: у окна их бывает до трёх, у двери одна или две */
  sashes: number;
  /** Размеры по умолчанию */
  widthMm: number;
  heightMm: number;
  sillHeightMm: number;
  /** Ширина профиля коробки */
  frameWidthMm: number;
  /** Материалы, в которых изделие выпускается. Первый — по умолчанию */
  materials: string[];
}

/**
 * Межкомнатные двери.
 *
 * Материалы берутся из каталога тенанта: цвет полотна — это та же
 * отделка, что у мебели, и отдельный набор цветов разошёлся бы с ним.
 */
const DOORS: OpeningStyle[] = [
  {
    code: 'door-flush',
    name: 'Дверь гладкая',
    kind: 'door',
    profile: 'wood',
    fill: 'flush',
    sashes: 1,
    widthMm: 800,
    heightMm: 2000,
    sillHeightMm: 0,
    frameWidthMm: 75,
    materials: ['white', 'oak', 'graphite'],
  },
  {
    code: 'door-panel',
    name: 'Дверь филёнчатая',
    kind: 'door',
    profile: 'wood',
    fill: 'panel',
    sashes: 1,
    widthMm: 900,
    heightMm: 2000,
    sillHeightMm: 0,
    frameWidthMm: 75,
    materials: ['oak', 'white', 'graphite'],
  },
  {
    code: 'door-glazed',
    name: 'Дверь со стеклом',
    kind: 'door',
    profile: 'wood',
    fill: 'glazed',
    sashes: 1,
    widthMm: 800,
    heightMm: 2000,
    sillHeightMm: 0,
    frameWidthMm: 75,
    materials: ['white', 'oak', 'graphite'],
  },
  {
    code: 'door-double',
    name: 'Дверь двустворчатая',
    kind: 'door',
    profile: 'wood',
    fill: 'panel',
    sashes: 2,
    widthMm: 1400,
    heightMm: 2000,
    sillHeightMm: 0,
    frameWidthMm: 75,
    materials: ['oak', 'white', 'graphite'],
  },
];

/**
 * Окна.
 *
 * Три профиля ходовой практики: ПВХ (самый массовый), деревянный
 * евробрус и алюминиевый. Отличаются шириной профиля и материалом —
 * алюминий тонкий, дерево толстое.
 */
const WINDOWS: OpeningStyle[] = [
  {
    code: 'window-pvc-1',
    name: 'Окно ПВХ одностворчатое',
    kind: 'window',
    profile: 'pvc',
    fill: 'glazed',
    sashes: 1,
    widthMm: 900,
    heightMm: 1400,
    sillHeightMm: 850,
    frameWidthMm: 70,
    materials: ['white', 'oak', 'graphite'],
  },
  {
    code: 'window-pvc-2',
    name: 'Окно ПВХ двустворчатое',
    kind: 'window',
    profile: 'pvc',
    fill: 'glazed',
    sashes: 2,
    widthMm: 1300,
    heightMm: 1400,
    sillHeightMm: 850,
    frameWidthMm: 70,
    materials: ['white', 'oak', 'graphite'],
  },
  {
    code: 'window-pvc-3',
    name: 'Окно ПВХ трёхстворчатое',
    kind: 'window',
    profile: 'pvc',
    fill: 'glazed',
    sashes: 3,
    widthMm: 2000,
    heightMm: 1400,
    sillHeightMm: 850,
    frameWidthMm: 70,
    materials: ['white', 'graphite', 'oak'],
  },
  {
    code: 'window-wood-2',
    name: 'Окно деревянное двустворчатое',
    kind: 'window',
    profile: 'wood',
    fill: 'glazed',
    sashes: 2,
    widthMm: 1300,
    heightMm: 1400,
    sillHeightMm: 850,
    frameWidthMm: 86,
    materials: ['oak', 'white', 'graphite'],
  },
  {
    code: 'window-alu-2',
    name: 'Окно алюминиевое двустворчатое',
    kind: 'window',
    profile: 'aluminium',
    fill: 'glazed',
    sashes: 2,
    widthMm: 1500,
    heightMm: 1600,
    sillHeightMm: 800,
    frameWidthMm: 52,
    materials: ['steel', 'graphite', 'white'],
  },
];

export const OPENING_STYLES: readonly OpeningStyle[] = [...DOORS, ...WINDOWS];

export function openingStyle(code: string | null | undefined): OpeningStyle | undefined {
  return OPENING_STYLES.find((style) => style.code === code);
}

/** Изделия, подходящие проёму этого вида. */
export function stylesForKind(kind: OpeningStyleKind): OpeningStyle[] {
  return OPENING_STYLES.filter((style) => style.kind === kind);
}

/** Стиль по умолчанию: первый в ряду своего вида. */
export function defaultStyle(kind: OpeningStyleKind): OpeningStyle {
  return stylesForKind(kind)[0]!;
}

/** Код выбранного материала изделия; по умолчанию первый из ряда. */
export function openingMaterial(
  style: OpeningStyle,
  options: Readonly<Record<string, string>>,
): string {
  const chosen = options['material'];
  return chosen && style.materials.includes(chosen) ? chosen : style.materials[0]!;
}
