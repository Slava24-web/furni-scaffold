import { describe, expect, it } from 'vitest';
import { conflictMessage } from './conflictMessage';

const report = (over: Partial<Parameters<typeof conflictMessage>[0]> = {}) => ({
  objectIds: [],
  wallIds: [],
  outsideRoom: false,
  openingIds: [],
  blockedDrawerIds: [],
  ownDrawersBlocked: false,
  ...over,
});

describe('сообщение о конфликте', () => {
  it('без конфликтов сообщения нет', () => {
    expect(conflictMessage(report())).toBeNull();
  });

  it('отсутствие отчёта не роняет вызов', () => {
    expect(conflictMessage(null)).toBeNull();
    expect(conflictMessage(undefined)).toBeNull();
  });

  it('называет причину, а не просто факт пересечения', () => {
    expect(conflictMessage(report({ wallIds: ['w1'] }))).toBe('Объект врезается в стену');
    expect(conflictMessage(report({ outsideRoom: true }))).toBe(
      'Объект вынесен за пределы комнаты',
    );
  });

  it('согласует форму слова с числом', () => {
    expect(conflictMessage(report({ objectIds: ['a'] }))).toBe(
      'Объект пересекается с 1 объектом',
    );
    expect(conflictMessage(report({ objectIds: ['a', 'b'] }))).toBe(
      'Объект пересекается с 2 объектами',
    );
    expect(conflictMessage(report({ objectIds: Array.from({ length: 11 }, (_, i) => `${i}`) }))).toBe(
      'Объект пересекается с 11 объектами',
    );
    expect(conflictMessage(report({ objectIds: Array.from({ length: 21 }, (_, i) => `${i}`) }))).toBe(
      'Объект пересекается с 21 объектом',
    );
  });

  it('множественное число для нескольких стен', () => {
    expect(conflictMessage(report({ wallIds: ['w1', 'w2'] }))).toBe('Объект врезается в стены');
  });

  it('перечисляет все причины сразу', () => {
    expect(
      conflictMessage(report({ objectIds: ['a'], wallIds: ['w1'], outsideRoom: true })),
    ).toBe('Объект пересекается с 1 объектом, врезается в стену, вынесен за пределы комнаты');
  });

  it('называет перекрытую зону открывания двери', () => {
    expect(conflictMessage(report({ openingIds: ['d1'] }))).toBe(
      'Объект перекрывает зону открывания двери',
    );
    expect(conflictMessage(report({ openingIds: ['d1', 'd2'] }))).toBe(
      'Объект перекрывает зоны открывания дверей',
    );
  });

  it('называет перекрытые ящики соседа и свои', () => {
    expect(conflictMessage(report({ blockedDrawerIds: ['a'] }))).toBe(
      'Объект мешает выдвинуть ящики соседа',
    );
    expect(conflictMessage(report({ ownDrawersBlocked: true }))).toBe(
      'Объект не сможет выдвинуть свои ящики',
    );
  });
});