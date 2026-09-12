import {
  BufferGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  type Object3D,
  type Scene,
  type Texture,
} from 'three';
import type { WallDimension } from '@furni/shared';

/**
 * Размерные линии помещения.
 *
 * Рисуются на полу, как на плане: линия вдоль стены, засечки по концам
 * и подпись размера посередине. По подписи пользователь и вводит точный
 * размер — она же служит целью для луча, поэтому плашка заведомо крупнее
 * текста, иначе в неё невозможно попасть пальцем.
 *
 * Глубина не проверяется: размеры должны читаться поверх мебели, иначе
 * в заставленной комнате их не видно. Отсюда же renderOrder.
 *
 * Текст рисуется на canvas. Фабрика подписи вынесена в конструктор:
 * в тестах DOM нет, и без подмены пришлось бы тащить туда браузер.
 */

const MM = 1000;
/** Высота линий над полом: ниже начинается мерцание с плоскостью пола. */
const HEIGHT_MM = 30;
/** Длина засечки по концам размерной линии. */
const TICK_MM = 160;
/** Плашка подписи в миллиметрах плана. */
const LABEL_WIDTH_MM = 760;
const LABEL_HEIGHT_MM = 260;
const RENDER_ORDER = 10;

const LINE_COLOR = 0x2f6fed;
const LINE_COLOR_STATIC = 0x98a2b3;

export type DimensionLabelFactory = (text: string, editable: boolean) => Texture | null;

interface DimensionLabel {
  sprite: Sprite;
  wallId: string;
  clearLengthMm: number;
  editable: boolean;
}

export class DimensionOverlay {
  readonly root = new Group();

  private readonly lineMaterial = new LineBasicMaterial({
    color: LINE_COLOR,
    depthTest: false,
    transparent: true,
    opacity: 0.9,
    vertexColors: true,
  });

  private lines: LineSegments | null = null;
  private labels: DimensionLabel[] = [];

  constructor(
    private readonly scene: Scene,
    private readonly makeLabel: DimensionLabelFactory = drawLabel,
  ) {
    this.root.name = 'dimensions';
    this.root.renderOrder = RENDER_ORDER;
    scene.add(this.root);
  }

  /** Полная пересборка: размерных линий единицы, инкрементальность не окупается. */
  build(dimensions: readonly WallDimension[]): void {
    this.clear();
    if (dimensions.length === 0) return;

    const positions: number[] = [];
    const colors: number[] = [];
    const editableColor = new Color(LINE_COLOR);
    const staticColor = new Color(LINE_COLOR_STATIC);

    for (const dimension of dimensions) {
      const tint = dimension.editable ? editableColor : staticColor;
      for (const [a, b] of segmentsOf(dimension)) {
        positions.push(a.x / MM, HEIGHT_MM / MM, a.y / MM);
        positions.push(b.x / MM, HEIGHT_MM / MM, b.y / MM);
        colors.push(tint.r, tint.g, tint.b, tint.r, tint.g, tint.b);
      }
      this.addLabel(dimension);
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
    this.lines = new LineSegments(geometry, this.lineMaterial);
    this.lines.renderOrder = RENDER_ORDER;
    this.lines.frustumCulled = false;
    this.root.add(this.lines);
  }

  private addLabel(dimension: WallDimension): void {
    const texture = this.makeLabel(String(dimension.clearLengthMm), dimension.editable);
    const material = new SpriteMaterial({
      depthTest: false,
      transparent: true,
      ...(texture ? { map: texture } : { color: 0xffffff }),
    });

    const sprite = new Sprite(material);
    sprite.scale.set(LABEL_WIDTH_MM / MM, LABEL_HEIGHT_MM / MM, 1);
    sprite.position.set(dimension.labelAt.x / MM, HEIGHT_MM / MM, dimension.labelAt.y / MM);
    sprite.renderOrder = RENDER_ORDER + 1;
    sprite.name = `dimension:${dimension.wallId}`;
    this.root.add(sprite);

    this.labels.push({
      sprite,
      wallId: dimension.wallId,
      clearLengthMm: dimension.clearLengthMm,
      editable: dimension.editable,
    });
  }

  /**
   * Цели для луча: только правимые размеры.
   * Подпись, по которой ничего не изменится, не должна ловить тапы —
   * иначе она молча съедает выделение объекта под ней.
   */
  get targets(): Object3D[] {
    return this.labels.filter((label) => label.editable).map((label) => label.sprite);
  }

  /** Размер, которому принадлежит объект под лучом. */
  resolve(object: Object3D): { wallId: string; clearLengthMm: number } | null {
    const label = this.labels.find(
      (candidate) => candidate.editable && candidate.sprite === object,
    );
    return label ? { wallId: label.wallId, clearLengthMm: label.clearLengthMm } : null;
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  get visible(): boolean {
    return this.root.visible;
  }

  private clear(): void {
    for (const label of this.labels) {
      this.root.remove(label.sprite);
      label.sprite.material.map?.dispose();
      label.sprite.material.dispose();
    }
    this.labels = [];

    if (this.lines) {
      this.root.remove(this.lines);
      this.lines.geometry.dispose();
      this.lines = null;
    }
  }

  dispose(): void {
    this.clear();
    this.lineMaterial.dispose();
    this.scene.remove(this.root);
  }
}

/** Сама линия и две засечки по её концам. */
function segmentsOf(dimension: WallDimension): [
  { x: number; y: number },
  { x: number; y: number },
][] {
  const dx = dimension.end.x - dimension.start.x;
  const dy = dimension.end.y - dimension.start.y;
  const length = Math.hypot(dx, dy) || 1;
  // Засечка перпендикулярна линии и симметрична относительно неё
  const tick = { x: (-dy / length) * (TICK_MM / 2), y: (dx / length) * (TICK_MM / 2) };

  const tickAt = (point: { x: number; y: number }): [
    { x: number; y: number },
    { x: number; y: number },
  ] => [
    { x: point.x - tick.x, y: point.y - tick.y },
    { x: point.x + tick.x, y: point.y + tick.y },
  ];

  return [[dimension.start, dimension.end], tickAt(dimension.start), tickAt(dimension.end)];
}

/** Подпись размера на canvas. Возвращает null там, где DOM недоступен. */
function drawLabel(text: string, editable: boolean): Texture | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 88;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = editable ? '#2f6fed' : '#c2c7d0';
  ctx.lineWidth = 5;
  roundedRect(ctx, 3, 3, canvas.width - 6, canvas.height - 6, 18);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = editable ? '#1a2b4a' : '#6b7280';
  ctx.font = '600 46px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}
