/**
 * Клиент API магазина.
 *
 * Тенант передаётся заголовком, а не в теле: сервер определяет его до
 * разбора запроса и по нему же включает изоляцию строк (RLS). Адрес
 * задаётся переменной окружения — виджет живёт на домене магазина, а API
 * стоит отдельно.
 */

const BASE_URL = (import.meta.env['VITE_API_URL'] as string | undefined) ?? 'http://localhost:3000';
const TENANT = (import.meta.env['VITE_TENANT_SLUG'] as string | undefined) ?? 'test';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-tenant-slug': TENANT },
      body: JSON.stringify(body),
    });
  } catch {
    // Сеть или выключенный сервер: сообщение должно называть причину,
    // иначе покупатель решит, что заявка ушла
    throw new ApiError('Сервер не отвечает. Проверьте соединение', 0);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new ApiError(message(response.status, detail), response.status);
  }
  return (await response.json()) as T;
}

function message(status: number, detail: string): string {
  if (status === 429) return 'Слишком много попыток. Повторите через минуту';
  if (status === 400) return 'Сервер отклонил данные заявки';
  if (status === 401) return 'Магазин не настроен для этого домена';
  return `Ошибка сервера (${status})${detail ? `: ${detail.slice(0, 120)}` : ''}`;
}

export interface QuoteLine {
  sku: string;
  quantity: number;
  unitCents: number;
  totalCents: number;
  violations: string[];
}

export interface SceneQuote {
  lines: QuoteLine[];
  totalCents: number;
  currency: string;
  unknown: string[];
  valid: boolean;
}

export interface LeadResult {
  id: string;
  totalCents: number;
  currency: string;
  clientTotalCents: number | null;
}

export interface LeadContact {
  name: string;
  phone: string;
  email?: string;
  comment?: string;
  consent: true;
}

/** Авторитетная смета: цена в заявке берётся только отсюда. */
export function requestQuote(doc: unknown): Promise<SceneQuote> {
  return post<SceneQuote>('/v1/quote', { doc });
}

export function submitLead(input: {
  contact: LeadContact;
  doc: unknown;
  totalCents: number;
}): Promise<LeadResult> {
  return post<LeadResult>('/v1/leads', input);
}
