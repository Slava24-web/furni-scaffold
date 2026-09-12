<script setup lang="ts">
import { computed, ref } from 'vue';
import { ApiError, requestQuote, submitLead, type SceneQuote } from '../lib/api';
import { formatPrice } from '../lib/money';
import type { SceneDoc } from '@furni/shared';

/**
 * Заявка на расчёт.
 *
 * Сумма показывается серверная: клиентская смета нужна для мгновенного
 * отклика при перетаскивании, но в заявку идёт только то, что посчитал
 * сервер (CLAUDE.md, правило 4). Если суммы разошлись, покупатель видит
 * это до отправки, а не узнаёт от менеджера.
 */
const props = defineProps<{
  doc: SceneDoc;
  /** Предварительная сумма, посчитанная в браузере */
  clientTotalCents: number;
}>();

const emit = defineEmits<{ close: [] }>();

const name = ref('');
const phone = ref('');
const email = ref('');
const comment = ref('');
const consent = ref(false);

const quote = ref<SceneQuote | null>(null);
const quoteError = ref<string | null>(null);
const sending = ref(false);
const sendError = ref<string | null>(null);
const leadId = ref<string | null>(null);

const canSend = computed(
  () => name.value.trim().length >= 2 && phone.value.trim().length >= 6 && consent.value,
);

const mismatch = computed(
  () => quote.value !== null && quote.value.totalCents !== props.clientTotalCents,
);

/** Смета запрашивается при открытии формы: цена могла измениться. */
async function loadQuote(): Promise<void> {
  quoteError.value = null;
  try {
    quote.value = await requestQuote(props.doc);
  } catch (cause) {
    quote.value = null;
    quoteError.value = cause instanceof ApiError ? cause.message : 'Не удалось получить смету';
  }
}

void loadQuote();

async function send(): Promise<void> {
  if (!canSend.value || sending.value) return;
  sending.value = true;
  sendError.value = null;

  try {
    const result = await submitLead({
      contact: {
        name: name.value.trim(),
        phone: phone.value.trim(),
        ...(email.value.trim() ? { email: email.value.trim() } : {}),
        ...(comment.value.trim() ? { comment: comment.value.trim() } : {}),
        consent: true,
      },
      doc: props.doc,
      totalCents: props.clientTotalCents,
    });
    leadId.value = result.id;
  } catch (cause) {
    sendError.value = cause instanceof ApiError ? cause.message : 'Не удалось отправить заявку';
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <div class="lead" role="dialog" aria-label="Заявка на расчёт">
    <header class="lead__head">
      <h3 class="lead__title">Заявка на расчёт</h3>
      <button type="button" class="lead__close" aria-label="Закрыть" @click="emit('close')">
        ×
      </button>
    </header>

    <template v-if="leadId">
      <p class="lead__done">
        Заявка принята. Номер:
        <span class="lead__id">{{ leadId.slice(0, 8) }}</span>
      </p>
      <p class="lead__note">Менеджер свяжется с вами по указанному телефону.</p>
      <button type="button" class="lead__submit" @click="emit('close')">Готово</button>
    </template>

    <template v-else>
      <p v-if="quoteError" class="lead__warning">{{ quoteError }}</p>
      <p v-else-if="quote" class="lead__total">
        Сумма по расчёту магазина: <strong>{{ formatPrice(quote.totalCents) }}</strong>
      </p>
      <p v-else class="lead__note">Считаем смету…</p>

      <p v-if="mismatch" class="lead__warning">
        Предварительная цена в планировщике ({{ formatPrice(props.clientTotalCents) }})
        отличается от расчёта магазина. Верной считается сумма магазина.
      </p>
      <p v-if="quote && quote.unknown.length > 0" class="lead__warning">
        Нет в продаже: {{ quote.unknown.join(', ') }}. Менеджер предложит замену.
      </p>

      <label class="field">
        Имя
        <input v-model="name" type="text" autocomplete="name" maxlength="120" />
      </label>
      <label class="field">
        Телефон
        <input v-model="phone" type="tel" autocomplete="tel" maxlength="32" />
      </label>
      <label class="field">
        Почта, необязательно
        <input v-model="email" type="email" autocomplete="email" maxlength="200" />
      </label>
      <label class="field">
        Комментарий
        <textarea v-model="comment" rows="2" maxlength="2000"></textarea>
      </label>

      <label class="consent">
        <input v-model="consent" type="checkbox" />
        <span>Согласен на обработку персональных данных</span>
      </label>

      <p v-if="sendError" class="lead__warning">{{ sendError }}</p>

      <button type="button" class="lead__submit" :disabled="!canSend || sending" @click="send">
        {{ sending ? 'Отправляем…' : 'Отправить заявку' }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.lead {
  position: absolute;
  right: 12px;
  bottom: 12px;
  z-index: 30;
  width: 286px;
  display: grid;
  gap: 9px;
  padding: 13px;
  border: 1px solid #e5e7ec;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 12px 32px rgb(16 24 40 / 0.16);
}
.lead__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.lead__title {
  margin: 0;
  font-size: 13px;
}
.lead__close {
  border: 0;
  background: none;
  font-size: 18px;
  line-height: 1;
  color: #8a909b;
  cursor: pointer;
}
.lead__total,
.lead__note,
.lead__done {
  margin: 0;
  font-size: 12px;
  color: #4b5262;
}
.lead__done {
  color: #1a7f47;
}
.lead__id {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.lead__warning {
  margin: 0;
  padding: 7px 9px;
  border-radius: 8px;
  background: #fef6e7;
  color: #93540a;
  font-size: 11px;
  line-height: 1.35;
}
.field {
  display: grid;
  gap: 3px;
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #8a909b;
}
.field input,
.field textarea {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid #d5d8dd;
  border-radius: 7px;
  font: inherit;
  font-size: 13px;
  color: #111418;
  text-transform: none;
  letter-spacing: normal;
  resize: vertical;
}
.consent {
  display: flex;
  gap: 7px;
  align-items: flex-start;
  font-size: 11px;
  color: #4b5262;
  line-height: 1.35;
}
.lead__submit {
  padding: 8px 12px;
  border: 1px solid #2f6fed;
  border-radius: 8px;
  background: #2f6fed;
  color: #fff;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.lead__submit:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
