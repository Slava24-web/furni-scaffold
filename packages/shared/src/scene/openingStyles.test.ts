import { describe, expect, it } from 'vitest';
import {
  OPENING_STYLES,
  defaultStyle,
  openingMaterial,
  openingStyle,
  stylesForKind,
} from './openingStyles';

describe('изделия для проёмов', () => {
  it('есть и двери, и окна', () => {
    expect(stylesForKind('door').length).toBeGreaterThanOrEqual(3);
    expect(stylesForKind('window').length).toBeGreaterThanOrEqual(3);
  });

  it('коды уникальны: по ним изделие хранится в документе', () => {
    const codes = OPENING_STYLES.map((style) => style.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('у каждого изделия есть материалы и положительные размеры', () => {
    for (const style of OPENING_STYLES) {
      expect(style.materials.length).toBeGreaterThan(0);
      expect(style.widthMm).toBeGreaterThan(0);
      expect(style.heightMm).toBeGreaterThan(0);
      expect(style.frameWidthMm).toBeGreaterThan(0);
      expect(style.sashes).toBeGreaterThanOrEqual(1);
    }
  });

  it('двери стоят на полу, окна подняты на отметку', () => {
    for (const style of stylesForKind('door')) expect(style.sillHeightMm).toBe(0);
    for (const style of stylesForKind('window')) expect(style.sillHeightMm).toBeGreaterThan(0);
  });

  it('окно всегда остеклено: глухая створка это не окно', () => {
    for (const style of stylesForKind('window')) expect(style.fill).toBe('glazed');
  });

  it('изделие находится по коду', () => {
    expect(openingStyle('door-flush')?.kind).toBe('door');
    expect(openingStyle('нет такого')).toBeUndefined();
    expect(openingStyle(null)).toBeUndefined();
  });

  it('по умолчанию берётся первое изделие своего вида', () => {
    expect(defaultStyle('door').kind).toBe('door');
    expect(defaultStyle('window').kind).toBe('window');
  });

  it('материал по умолчанию — первый из ряда', () => {
    const style = defaultStyle('door');
    expect(openingMaterial(style, {})).toBe(style.materials[0]);
  });

  it('выбранный материал принимается, посторонний отбрасывается', () => {
    const style = defaultStyle('door');
    const allowed = style.materials[1]!;

    expect(openingMaterial(style, { material: allowed })).toBe(allowed);
    // Материал не из ряда изделия означал бы исполнение, которого нет
    expect(openingMaterial(style, { material: 'stone' })).toBe(style.materials[0]);
  });
});
