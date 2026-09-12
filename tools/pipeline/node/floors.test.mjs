import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { FLOOR_FINISHES, floorTexture } from './floors.mjs';

/** Пиксели текстуры в raw-виде. */
async function pixels(finish, size = 64) {
  const png = await floorTexture(size, finish);
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, channels: info.channels };
}

const laminate = FLOOR_FINISHES.find((f) => f.code === 'floor-laminate-oak');
const checker = FLOOR_FINISHES.find((f) => f.code === 'floor-tile-checker');

describe('покрытия пола', () => {
  it('есть все четыре типа', () => {
    expect(new Set(FLOOR_FINISHES.map((f) => f.kind))).toEqual(
      new Set(['Ламинат', 'Паркет', 'Инженерная доска', 'Плитка']),
    );
  });

  it('коды уникальны: по ним покрытие хранится в документе', () => {
    const codes = FLOOR_FINISHES.map((f) => f.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('у каждого покрытия задан физический масштаб', () => {
    for (const finish of FLOOR_FINISHES) {
      // Без него доска растягивается на всю комнату
      expect(finish.repeatMm).toBeGreaterThan(0);
      expect(finish.plankLengthMm).toBeGreaterThan(0);
      expect(finish.plankWidthMm).toBeGreaterThan(0);
    }
  });

  it('в один квадрат текстуры укладывается несколько досок', () => {
    for (const finish of FLOOR_FINISHES) {
      expect(finish.repeatMm / finish.plankWidthMm).toBeGreaterThanOrEqual(2);
    }
  });

  it('генерация детерминированная: иначе checksum плывёт на каждом прогоне', async () => {
    const first = await floorTexture(32, laminate);
    const second = await floorTexture(32, laminate);
    expect(first.equals(second)).toBe(true);
  });

  it('текстура квадратная и нужного размера', async () => {
    const { width } = await pixels(laminate, 48);
    expect(width).toBe(48);
  });

  it('рисунок не однотонный: швы и волокно дают перепад тона', async () => {
    const { data } = await pixels(laminate);
    const tones = [];
    for (let i = 0; i < data.length; i += 3) tones.push(data[i]);
    expect(Math.max(...tones) - Math.min(...tones)).toBeGreaterThan(20);
  });

  it('шахматка даёт два разных тона', async () => {
    const { data, width, channels } = await pixels(checker, 64);
    const at = (x, y) => data[(y * width + x) * channels];
    // Соседние клетки: 300 мм при квадрате 1200 мм — это четверть стороны
    const light = at(width / 8, width / 8);
    const dark = at((width * 3) / 8, width / 8);
    expect(Math.abs(light - dark)).toBeGreaterThan(60);
  });

  it('ёлочка отличается от палубной укладки', async () => {
    const chevron = FLOOR_FINISHES.find((f) => f.code === 'floor-parquet-herringbone');
    const deck = await floorTexture(32, { ...laminate, colour: chevron.colour });
    const other = await floorTexture(32, { ...chevron, repeatMm: laminate.repeatMm });
    expect(deck.equals(other)).toBe(false);
  });
});
