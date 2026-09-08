import {
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  HemisphereLight,
  type Scene,
} from 'three';

export type EnvironmentPreset = 'daylight' | 'evening' | 'studio';

interface PresetConfig {
  background: number;
  sky: number;
  ground: number;
  hemiIntensity: number;
  sun: number;
  sunIntensity: number;
  /** Положение солнца в метрах */
  sunPosition: readonly [number, number, number];
  grid: number;
}

/**
 * Пресеты освещения из схемы документа сцены (`environment.preset`).
 *
 * Две динамические лампы и ни одной тени: shadow map в интерактивном режиме
 * запрещён (CLAUDE.md, ТЗ 7.4). Мягкость подбирается полусферическим светом,
 * контактные тени добавляются только в refined-проходе.
 */
const PRESETS: Record<EnvironmentPreset, PresetConfig> = {
  daylight: {
    background: 0xeef1f4,
    sky: 0xffffff,
    ground: 0xb9bdc4,
    hemiIntensity: 2.2,
    sun: 0xfff4e6,
    sunIntensity: 2.0,
    sunPosition: [4, 8, 5],
    grid: 0xc4c9d0,
  },
  evening: {
    background: 0x2b2f36,
    sky: 0x8fa2c0,
    ground: 0x2a2622,
    hemiIntensity: 1.1,
    sun: 0xffb877,
    sunIntensity: 1.4,
    sunPosition: [-5, 4, 3],
    grid: 0x454b55,
  },
  studio: {
    background: 0xf7f7f8,
    sky: 0xffffff,
    ground: 0xdadce0,
    hemiIntensity: 2.8,
    sun: 0xffffff,
    sunIntensity: 1.2,
    sunPosition: [2, 6, 4],
    grid: 0xd0d3d8,
  },
};

/**
 * Освещение и опорная сетка пола. Владеет своими ресурсами и освобождает их
 * сама — в SceneRegistry не регистрируется, объектом сцены не является.
 */
export class Environment {
  readonly root = new Group();
  private grid: GridHelper | null = null;
  private preset: EnvironmentPreset = 'daylight';

  private readonly hemisphere = new HemisphereLight(0xffffff, 0xb9bdc4, 2.2);
  private readonly sun = new DirectionalLight(0xfff4e6, 2.0);

  constructor(private readonly scene: Scene) {
    this.root.name = 'environment';
    this.root.add(this.hemisphere, this.sun);
    scene.add(this.root);
    this.apply('daylight');
  }

  apply(preset: EnvironmentPreset): void {
    const cfg = PRESETS[preset];
    this.preset = preset;

    this.scene.background = new Color(cfg.background);
    this.hemisphere.color.setHex(cfg.sky);
    this.hemisphere.groundColor.setHex(cfg.ground);
    this.hemisphere.intensity = cfg.hemiIntensity;
    this.sun.color.setHex(cfg.sun);
    this.sun.intensity = cfg.sunIntensity;
    this.sun.position.set(...cfg.sunPosition);

    this.rebuildGrid(cfg.grid);
  }

  get current(): EnvironmentPreset {
    return this.preset;
  }

  setGridVisible(visible: boolean): void {
    if (this.grid) this.grid.visible = visible;
  }

  /** Сетка 20×20 м с шагом 0.5 м. Один draw call, в бюджет укладывается. */
  private rebuildGrid(color: number): void {
    this.disposeGrid();
    const grid = new GridHelper(20, 40, color, color);
    grid.position.y = -0.001; // чуть ниже пола, иначе z-fighting с полом комнаты
    this.grid = grid;
    this.root.add(grid);
  }

  private disposeGrid(): void {
    if (!this.grid) return;
    this.root.remove(this.grid);
    this.grid.geometry.dispose();
    const material = this.grid.material;
    if (Array.isArray(material)) {
      for (const m of material) m.dispose();
    } else {
      material.dispose();
    }
    this.grid = null;
  }

  dispose(): void {
    this.disposeGrid();
    this.hemisphere.dispose();
    this.sun.dispose();
    this.scene.remove(this.root);
  }
}
