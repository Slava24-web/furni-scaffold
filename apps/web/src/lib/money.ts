/**
 * Деньги в интерфейсе.
 *
 * В документе и каталоге цены хранятся в копейках целыми числами
 * (CLAUDE.md: деньги дробным числом не хранить), поэтому форматирование
 * живёт в одном месте, а не размазано по компонентам.
 */

const RUBLES = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

export function formatPrice(cents: number): string {
  return `${RUBLES.format(Math.round(cents / 100))} ₽`;
}

/** Надбавка со знаком: ноль не показывается вовсе. */
export function formatDelta(cents: number): string | null {
  if (cents === 0) return null;
  const sign = cents > 0 ? '+' : '−';
  return `${sign}${RUBLES.format(Math.round(Math.abs(cents) / 100))} ₽`;
}
