import { describe, expect, it } from 'vitest';
import { formatDelta, formatPrice } from './money';

/** Intl вставляет узкий неразрывный пробел, поэтому сравниваем по цифрам. */
const digits = (value: string | null) => value?.replace(/\s/g, ' ');

describe('цена', () => {
  it('копейки превращаются в рубли', () => {
    expect(digits(formatPrice(890000))).toBe('8 900 ₽');
  });

  it('разряды разделяются', () => {
    expect(digits(formatPrice(5490000))).toBe('54 900 ₽');
  });

  it('ноль показывается как ноль', () => {
    expect(digits(formatPrice(0))).toBe('0 ₽');
  });

  it('копейки округляются до рубля', () => {
    expect(digits(formatPrice(89050))).toBe('891 ₽');
  });
});

describe('надбавка', () => {
  it('нулевая надбавка не показывается', () => {
    expect(formatDelta(0)).toBeNull();
  });

  it('положительная идёт с плюсом', () => {
    expect(digits(formatDelta(150000))).toBe('+1 500 ₽');
  });

  it('отрицательная идёт с минусом', () => {
    expect(digits(formatDelta(-180000))).toBe('−1 800 ₽');
  });
});
