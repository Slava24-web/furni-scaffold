import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import { emptySceneDoc, type Placement, type SceneDoc } from '@furni/shared';

/**
 * Стор сцены. Хранит ТОЛЬКО сериализуемый документ.
 * Ни одного объекта Three.js здесь быть не может (CLAUDE.md, правило 1).
 * Позиции во время перетаскивания сюда не пишутся (правило 3).
 */
export const useSceneStore = defineStore('scene', () => {
  const doc = shallowRef<SceneDoc>(emptySceneDoc());
  const sceneId = ref<string | null>(null);
  const dirty = ref(false);
  const saving = ref(false);

  const undoStack = shallowRef<SceneDoc[]>([]);
  const redoStack = shallowRef<SceneDoc[]>([]);
  const MAX_HISTORY = 50; // ТЗ FR-PLN-11

  function pushHistory(): void {
    undoStack.value = [...undoStack.value.slice(-(MAX_HISTORY - 1)), doc.value];
    redoStack.value = [];
  }

  function updatePlacement(instanceId: string, patch: Partial<Placement>): void {
    pushHistory();
    doc.value = {
      ...doc.value,
      placements: doc.value.placements.map((p) =>
        p.instanceId === instanceId ? { ...p, ...patch } : p,
      ),
    };
    dirty.value = true;
  }

  function undo(): void {
    const prev = undoStack.value.at(-1);
    if (!prev) return;
    redoStack.value = [...redoStack.value, doc.value];
    undoStack.value = undoStack.value.slice(0, -1);
    doc.value = prev;
    dirty.value = true;
  }

  function redo(): void {
    const next = redoStack.value.at(-1);
    if (!next) return;
    undoStack.value = [...undoStack.value, doc.value];
    redoStack.value = redoStack.value.slice(0, -1);
    doc.value = next;
    dirty.value = true;
  }

  return { doc, sceneId, dirty, saving, updatePlacement, undo, redo, pushHistory };
});
