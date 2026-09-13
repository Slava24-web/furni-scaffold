/**
 * Замечание планировщика.
 *
 * Общий тип для всех проверок расстановки: эргономика, подключения,
 * рабочие зоны. Живёт отдельным модулем, чтобы правила могли ссылаться
 * друг на друга, не заворачиваясь в кольцо импортов.
 */

export type FindingSeverity = 'warning' | 'note';

export interface ErgonomicFinding {
  code: string;
  severity: FindingSeverity;
  message: string;
  /** Кого подсветить, чтобы стало понятно, о чём речь */
  instanceIds: string[];
}

/** Предупреждения показываются раньше заметок. */
export const severityRank = (severity: FindingSeverity): number =>
  severity === 'warning' ? 0 : 1;

/**
 * Округление до сантиметра для текста замечания.
 *
 * «Проход 903 мм» читается как результат замера, а не как правило:
 * миллиметры здесь ложная точность.
 */
export const roundMm = (value: number): number => Math.round(value / 10) * 10;
