<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { RouterLink } from 'vue-router';
import {
  PhArrowLeft,
  PhCheckCircle,
  PhDownloadSimple,
  PhInfo,
  PhUploadSimple,
  PhWarningCircle,
  PhXCircle,
} from '@phosphor-icons/vue';
import { ModelInspector, type InspectedModel } from '@furni/viewer';
import { checkModel, modelPublishable, type ModelIssue } from '@furni/shared';
import ModelForm from '../components/model/ModelForm.vue';
import { blankDraft, productFromDraft, type ModelDraft } from '../lib/modelDraft';

/**
 * Приёмка модели в каталог.
 *
 * Сейчас изделия попадают в каталог только через пайплайн: разработчик
 * пишет геометрию кодом. Для демо-тенанта это нормально, для магазина —
 * нет: у него уже есть модели, и ему нужен способ отдать их, не трогая
 * репозиторий.
 *
 * Страница делает клиентскую половину: читает файл, меряет его, проверяет
 * по бюджетам и конвенциям проекта и собирает карточку каталога. Серверной
 * половины — загрузки в хранилище и записи в базу — ещё нет, поэтому
 * карточка выгружается файлом (см. docs/BACKLOG.md, кабинет тенанта).
 */
const canvas = ref<HTMLCanvasElement | null>(null);
const inspector = shallowRef<ModelInspector | null>(null);

const fileName = ref<string | null>(null);
const fileBytes = ref(0);
const facts = shallowRef<InspectedModel | null>(null);
const issues = shallowRef<ModelIssue[]>([]);
const loading = ref(false);
const failure = ref<string | null>(null);
const dropActive = ref(false);

const draft = ref<ModelDraft>(blankDraft());

const errors = computed(() => issues.value.filter((issue) => issue.level === 'error'));
const publishable = computed(
  () => facts.value !== null && modelPublishable(issues.value) && draft.value.name.trim() !== '',
);

/** Инспектор создаётся на первый файл: пустой канвас движок не греет. */
function ensureInspector(): ModelInspector | null {
  if (inspector.value) return inspector.value;
  if (!canvas.value) return null;

  const created = markRaw(new ModelInspector(canvas.value));
  const box = canvas.value.getBoundingClientRect();
  created.resize(box.width, box.height);
  inspector.value = created;
  return created;
}

async function accept(file: File | undefined): Promise<void> {
  if (!file) return;

  failure.value = null;
  loading.value = true;
  try {
    const engine = ensureInspector();
    if (!engine) throw new Error('Просмотрщик не готов');

    const measured = await engine.load(file);
    facts.value = measured;
    issues.value = checkModel(measured);
    fileName.value = file.name;
    fileBytes.value = file.size;
    // Габариты подставляются из самой модели: перепечатывать их руками
    // значит рано или поздно разойтись с геометрией
    draft.value = {
      ...draft.value,
      name: draft.value.name || file.name.replace(/\.(glb|gltf)$/i, ''),
      widthMm: measured.widthMm,
      heightMm: measured.heightMm,
      depthMm: measured.depthMm,
      materials: measured.materials,
    };
  } catch (error) {
    failure.value =
      error instanceof Error
        ? `Не удалось прочитать файл: ${error.message}`
        : 'Не удалось прочитать файл';
    facts.value = null;
    issues.value = [];
  } finally {
    loading.value = false;
  }
}

function onDrop(event: DragEvent): void {
  dropActive.value = false;
  void accept(event.dataTransfer?.files?.[0]);
}

function onPick(event: Event): void {
  void accept((event.target as HTMLInputElement).files?.[0] ?? undefined);
}

/** Карточка каталога файлом: серверной приёмки пока нет. */
function download(): void {
  if (!facts.value) return;

  const product = productFromDraft(draft.value, facts.value);
  const blob = new Blob([JSON.stringify(product, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${product.sku || 'model'}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

const sizeLabel = computed(() =>
  fileBytes.value > 0 ? `${(fileBytes.value / 1024 / 1024).toFixed(2)} МБ` : '',
);

// Канвас тянется вместе с колонкой: без пересчёта картинка растягивается
let observer: ResizeObserver | null = null;
watch(canvas, (element) => {
  observer?.disconnect();
  if (!element) return;
  observer = new ResizeObserver(() => {
    const box = element.getBoundingClientRect();
    inspector.value?.resize(box.width, box.height);
  });
  observer.observe(element);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  inspector.value?.dispose();
});
</script>

<template>
  <main class="import">
    <header class="bar">
      <RouterLink to="/planner" class="back">
        <PhArrowLeft :size="16" weight="regular" />
        Планировщик
      </RouterLink>
      <h1 class="bar__title">Модель в каталог</h1>
    </header>

    <div class="import__body">
      <section class="stage">
        <div
          class="drop"
          :class="{ 'drop--active': dropActive, 'drop--filled': Boolean(facts) }"
          @dragover.prevent="dropActive = true"
          @dragleave="dropActive = false"
          @drop.prevent="onDrop"
        >
          <canvas ref="canvas" class="drop__canvas" :class="{ 'drop__canvas--on': Boolean(facts) }" />

          <div v-if="!facts" class="drop__empty">
            <PhUploadSimple :size="26" weight="regular" class="drop__icon" />
            <p class="drop__title">Перетащите сюда файл GLB или glTF</p>
            <p class="drop__note">
              Миллиметры целыми, ось Y вверх, начало координат — низ-центр габарита
            </p>
            <label class="btn btn--primary">
              Выбрать файл
              <input type="file" accept=".glb,.gltf,model/gltf-binary" @change="onPick" />
            </label>
          </div>

          <p v-if="loading" class="drop__status">Читаем модель…</p>
          <p v-if="failure" class="drop__status drop__status--bad">{{ failure }}</p>
        </div>

        <dl v-if="facts" class="facts">
          <div class="facts__item">
            <dt>Файл</dt>
            <dd :title="fileName ?? ''">{{ fileName }} · {{ sizeLabel }}</dd>
          </div>
          <div class="facts__item">
            <dt>Габарит</dt>
            <dd>{{ facts.widthMm }} × {{ facts.heightMm }} × {{ facts.depthMm }} мм</dd>
          </div>
          <div class="facts__item">
            <dt>Треугольников</dt>
            <dd>{{ facts.triangles.toLocaleString('ru-RU') }}</dd>
          </div>
          <div class="facts__item">
            <dt>Материалов</dt>
            <dd>{{ facts.materials.length || '—' }}</dd>
          </div>
        </dl>
      </section>

      <section class="side scroll-thin">
        <div v-if="facts" class="checks">
          <p v-if="issues.length === 0" class="check check--ok">
            <PhCheckCircle :size="16" weight="regular" />
            <span>Модель проходит приёмку</span>
          </p>

          <div v-for="issue in issues" :key="issue.code" class="check" :class="`check--${issue.level}`">
            <PhXCircle v-if="issue.level === 'error'" :size="16" weight="regular" />
            <PhWarningCircle v-else-if="issue.level === 'warning'" :size="16" weight="regular" />
            <PhInfo v-else :size="16" weight="regular" />
            <span class="check__text">
              <span class="check__message">{{ issue.message }}</span>
              <span v-if="issue.fix" class="check__fix">{{ issue.fix }}</span>
            </span>
          </div>
        </div>

        <ModelForm v-if="facts" v-model="draft" :materials="facts.materials" />

        <p v-if="!facts" class="side__empty">
          Загрузите модель — дальше появятся её обмер, проверка и карточка каталога
        </p>

        <footer v-if="facts" class="side__foot">
          <p v-if="errors.length > 0" class="side__blocked">
            {{ errors.length }} ошибк{{ errors.length === 1 ? 'а' : 'и' }} мешают публикации
          </p>
          <button type="button" class="btn btn--primary" :disabled="!publishable" @click="download">
            <PhDownloadSimple :size="16" weight="regular" />
            Скачать карточку
          </button>
          <p class="side__note">
            Загрузки в хранилище пока нет: карточка выгружается файлом, её кладут
            рядом с моделью в манифест каталога
          </p>
        </footer>
      </section>
    </div>
  </main>
</template>

<style scoped>
.import {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--c-bg-sunken);
}

.bar {
  display: flex;
  align-items: center;
  gap: var(--gap-3);
  flex: none;
  height: 56px;
  padding: 0 var(--gap-4);
  border-bottom: 1px solid var(--c-line);
  background: var(--c-bg);
}

.back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: var(--r-sm);
  color: var(--c-text-muted);
  font-size: var(--t-md);
  text-decoration: none;
}

.back:hover {
  background: var(--c-bg-hover);
  color: var(--c-text);
}

.bar__title {
  margin: 0;
  font-size: var(--t-lg);
  font-weight: 600;
}

.import__body {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* --- Сцена приёмки --- */
.stage {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--gap-3);
  padding: var(--gap-4);
}

.drop {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
  border: 1px dashed var(--c-line-strong);
  border-radius: var(--r-lg);
  background: var(--c-bg);
  transition: border-color 0.15s var(--ease), background-color 0.15s var(--ease);
}

.drop--active {
  border-color: var(--c-accent);
  background: var(--c-accent-soft);
}

.drop--filled {
  border-style: solid;
}

.drop__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: var(--r-lg);
  opacity: 0;
}

.drop__canvas--on {
  opacity: 1;
}

.drop__empty {
  position: relative;
  display: grid;
  justify-items: center;
  gap: var(--gap-2);
  max-width: 380px;
  padding: var(--gap-5);
  text-align: center;
}

.drop__icon {
  color: var(--c-text-faint);
}

.drop__title {
  margin: 0;
  font-size: var(--t-lg);
  font-weight: 600;
}

.drop__note {
  margin: 0 0 var(--gap-2);
  font-size: var(--t-sm);
  line-height: 1.45;
  color: var(--c-text-muted);
}

.drop__status {
  position: absolute;
  left: 50%;
  bottom: var(--gap-3);
  transform: translateX(-50%);
  margin: 0;
  padding: 7px 13px;
  border-radius: var(--r-pill);
  background: rgb(22 24 29 / 0.86);
  color: #fff;
  font-size: var(--t-sm);
}

.drop__status--bad {
  background: var(--c-danger);
}

input[type='file'] {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

/* --- Обмер --- */
.facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: var(--gap-2);
  margin: 0;
  flex: none;
}

.facts__item {
  padding: 9px 11px;
  border: 1px solid var(--c-line);
  border-radius: var(--r-md);
  background: var(--c-bg);
}

.facts dt {
  font-size: var(--t-xs);
  color: var(--c-text-faint);
}

.facts dd {
  margin: 2px 0 0;
  font-size: var(--t-md);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* --- Правая колонка --- */
.side {
  width: 380px;
  flex: none;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--gap-4);
  padding: var(--gap-4);
  border-left: 1px solid var(--c-line);
  background: var(--c-bg);
}

.side__empty {
  margin: 0;
  font-size: var(--t-sm);
  line-height: 1.5;
  color: var(--c-text-muted);
}

.checks {
  display: grid;
  gap: 6px;
}

.check {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--gap-2);
  align-items: start;
  margin: 0;
  padding: 9px 11px;
  border-radius: var(--r-md);
  font-size: var(--t-sm);
  line-height: 1.4;
}

.check--ok {
  background: #eef8f1;
  color: #1e6b3a;
}

.check--error {
  background: var(--c-danger-soft);
  color: #7a2b22;
}

.check--warning {
  background: var(--c-warn-soft);
  color: var(--c-warn);
}

.check--note {
  background: var(--c-bg-sunken);
  color: var(--c-text-muted);
}

.check__text {
  display: grid;
  gap: 3px;
}

.check__message {
  font-weight: 500;
}

.check__fix {
  opacity: 0.85;
}

.side__foot {
  display: grid;
  gap: var(--gap-2);
  margin-top: auto;
  padding-top: var(--gap-3);
  border-top: 1px solid var(--c-line);
}

.side__blocked {
  margin: 0;
  font-size: var(--t-sm);
  color: var(--c-danger);
}

.side__note {
  margin: 0;
  font-size: var(--t-xs);
  line-height: 1.45;
  color: var(--c-text-faint);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 9px 14px;
  border: 1px solid var(--c-line-strong);
  border-radius: var(--r-sm);
  background: var(--c-bg);
  font: inherit;
  font-size: var(--t-md);
  color: var(--c-text);
  cursor: pointer;
  transition: background-color 0.13s var(--ease), border-color 0.13s var(--ease);
}

.btn--primary {
  border-color: var(--c-accent);
  background: var(--c-accent);
  color: #fff;
  font-weight: 500;
}

.btn--primary:hover:not(:disabled) {
  background: var(--c-accent-hover);
  border-color: var(--c-accent-hover);
}

.btn:disabled {
  border-color: var(--c-line-strong);
  background: var(--c-bg-active);
  color: var(--c-text-faint);
  cursor: default;
}

@media (max-width: 1000px) {
  .import__body {
    flex-direction: column;
  }

  .side {
    width: auto;
    border-left: 0;
    border-top: 1px solid var(--c-line);
  }
}
</style>
