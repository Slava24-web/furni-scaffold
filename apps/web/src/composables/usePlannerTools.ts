import { computed, ref } from 'vue';
import type { Viewer } from '@furni/viewer';
import {
  defaultStyle,
  planOpening,
  randomUUID,
  serviceInfo,
  snapToWall,
  type ServicePointKind,
  type Wall,
} from '@furni/shared';
import { useSceneStore } from '../stores/scene';
import { useWallDrawing } from './useWallDrawing';
import type { FloorPoint } from '../lib/ScreenProjector';
import type { PlannerMode } from './useSceneEditing';

/**
 * Инструменты планировки: что делает тап по полу.
 *
 * Режим, рисование стен, вставка проёмов и разметка инженерии — одна
 * связка: все они читают тап по полу и все переключают режим обратно
 * в выделение. Держать их в странице значило смешивать с панелями,
 * сметой и инспектором.
 */
export function usePlannerTools(deps: { viewer: () => Viewer | null | undefined }) {
  const scene = useSceneStore();

  const mode = ref<PlannerMode>('select');
  const drawing = useWallDrawing({ onWall: (wall: Wall) => scene.addWall(wall) });

  /**
   * Вид точки инженерии остаётся выбранным: розетки ставят пачкой,
   * и переключаться на каждую значит удвоить число нажатий.
   */
  const serviceKind = ref<ServicePointKind>('socket');

  function setMode(next: PlannerMode): void {
    mode.value = next;
    if (next === 'draw-wall') drawing.start();
    else drawing.finish();
  }

  function finishDrawing(): void {
    drawing.finish();
    mode.value = 'select';
  }

  function pickServiceKind(kind: ServicePointKind): void {
    // Повторное нажатие на активный вид выходит из режима разметки
    if (mode.value === 'add-service' && serviceKind.value === kind) {
      mode.value = 'select';
      return;
    }
    serviceKind.value = kind;
    mode.value = 'add-service';
  }

  /** Вид проёма, который ставит текущий режим. null — режим не про проёмы. */
  function openingKind(): 'door' | 'window' | null {
    if (mode.value === 'add-door') return 'door';
    if (mode.value === 'add-window') return 'window';
    return null;
  }

  function onFloorTap(point: FloorPoint): void {
    if (mode.value === 'add-service') {
      addService(point);
      return;
    }
    if (mode.value === 'draw-wall') {
      if (drawing.addPoint(point)) mode.value = 'select';
      return;
    }
    const kind = openingKind();
    if (kind) insertOpening(point, kind);
  }

  /** Точка ставится на ближайшую стену: инженерия живёт на стенах. */
  function addService(point: FloorPoint): void {
    const [room] = scene.doc.rooms;
    if (!room) return;

    const info = serviceInfo(serviceKind.value);
    const snapped = snapToWall(room, { x: point.x, y: point.z });

    scene.addService({
      id: randomUUID(),
      kind: serviceKind.value,
      position: { x: Math.round(snapped.position.x), y: Math.round(snapped.position.y) },
      heightMm: info.heightMm,
      wallId: snapped.wallId,
      note: '',
    });
  }

  /**
   * Проём ставится в ближайшую стену: пользователь целится в стену, а не
   * задаёт её идентификатор. Смещение центрируется по точке клика и
   * прижимается к границам стены, иначе дверь вылезет за её торец.
   */
  function insertOpening(point: FloorPoint, kind: 'door' | 'window'): void {
    const [room] = scene.doc.rooms;
    if (!room) return;

    // Размеры берутся у изделия, а не задаются здесь: проём и то, что
    // в него встанет, обязаны совпадать с первого клика
    const style = defaultStyle(kind);
    const plan = planOpening(room, { x: point.x, y: point.z }, style.widthMm);
    if (!plan) return;

    deps.viewer()?.openings.previewAt(null, null, null);
    scene.addOpening({
      id: randomUUID(),
      wallId: plan.wall.id,
      kind,
      offset: plan.offsetMm,
      width: plan.widthMm,
      height: style.heightMm,
      sillHeight: style.sillHeightMm,
      swingRadius: null,
      hinge: 'left',
      swingInward: true,
      sku: style.code,
      options: {},
    });
    mode.value = 'select';
  }

  /**
   * Подсветка будущего проёма под указателем.
   *
   * Место считается той же функцией, что и вставка: подсветка обязана
   * показывать ровно тот прямоугольник, который получится после тапа.
   */
  function onAim(point: FloorPoint | null): void {
    const viewer = deps.viewer();
    const [room] = scene.doc.rooms;
    const kind = openingKind();

    if (!viewer || !room || !point || !kind) {
      viewer?.openings.previewAt(null, null, null);
      viewer?.invalidate();
      return;
    }

    const style = defaultStyle(kind);
    const plan = planOpening(room, { x: point.x, y: point.z }, style.widthMm);
    viewer.openings.previewAt(
      room,
      plan?.wall ?? null,
      plan
        ? {
            offsetMm: plan.offsetMm,
            widthMm: plan.widthMm,
            heightMm: style.heightMm,
            sillMm: style.sillHeightMm,
          }
        : null,
    );
    viewer.invalidate();
  }

  /** Подсказка активного инструмента. null — инструмент ничего не ждёт. */
  const hint = computed<string | null>(() => {
    if (mode.value === 'draw-wall') {
      return drawing.points.value.length === 0
        ? 'Тапните по полу, чтобы поставить первую точку'
        : 'Тап достраивает стену, тап по первой точке замыкает контур, двойной тап завершает';
    }
    if (mode.value === 'add-door') return 'Тапните по стене, куда поставить дверь';
    if (mode.value === 'add-window') return 'Тапните по стене, куда поставить окно';
    if (mode.value === 'add-service') {
      return `Тапните по стене: ${serviceInfo(serviceKind.value).name.toLowerCase()}. Тап по метке удаляет её`;
    }
    return null;
  });

  return {
    mode,
    drawing,
    serviceKind,
    hint,
    setMode,
    finishDrawing,
    pickServiceKind,
    onFloorTap,
    onAim,
  };
}
