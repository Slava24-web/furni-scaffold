/**
 * Корпус мебели из панелей.
 *
 * Раньше корпуса были сплошными брусками: снаружи это читалось как
 * монолит, у изделия не было ни толщины стенок, ни внутреннего объёма.
 * Настоящий корпус собирается из боковин, дна, крышки и задней стенки —
 * ровно так, как его собирают из ЛДСП.
 *
 * Все размеры в миллиметрах, origin по низу корпуса (CLAUDE.md).
 */
import { markPanel, segmentedBox, translate } from './geometry.mjs';

/** Толщина ЛДСП и задней стенки из ХДФ. */
export const PANEL_THICKNESS = 18;
export const BACK_THICKNESS = 6;

/**
 * @param {number} widthMm габарит корпуса
 * @param {number} heightMm габарит корпуса
 * @param {number} depthMm габарит корпуса
 * @param {{bottomMm?: number, thickness?: number, shelves?: number,
 *          openBack?: boolean, openTop?: boolean}} [options]
 */
export function carcassPanels(widthMm, heightMm, depthMm, options = {}) {
  const {
    bottomMm = 0,
    thickness = PANEL_THICKNESS,
    shelves = 0,
    openBack = false,
    openTop = false,
  } = options;

  const parts = [];
  const innerWidth = widthMm - thickness * 2;
  const at = (geometry, x, y, z) => translate(geometry, x, bottomMm + y, z);

  // Боковины во всю высоту: на них опираются дно и крышка
  for (const side of [-1, 1]) {
    parts.push(
      markPanel(
        at(
          segmentedBox(thickness, heightMm, depthMm, 1),
          (side * (widthMm - thickness)) / 2,
          heightMm / 2,
          0,
        ),
        'Боковина',
        depthMm,
        heightMm,
        thickness,
      ),
    );
  }

  parts.push(
    markPanel(
      at(segmentedBox(innerWidth, thickness, depthMm, 1), 0, thickness / 2, 0),
      'Дно',
      innerWidth,
      depthMm,
      thickness,
    ),
  );

  if (!openTop) {
    parts.push(
      markPanel(
        at(segmentedBox(innerWidth, thickness, depthMm, 1), 0, heightMm - thickness / 2, 0),
        'Крышка',
        innerWidth,
        depthMm,
        thickness,
      ),
    );
  }

  if (!openBack) {
    parts.push(
      markPanel(
        at(
          segmentedBox(innerWidth, heightMm - thickness * 2, BACK_THICKNESS, 1),
          0,
          heightMm / 2,
          -(depthMm - BACK_THICKNESS) / 2,
        ),
        'Задняя стенка',
        innerWidth,
        heightMm - thickness * 2,
        BACK_THICKNESS,
      ),
    );
  }

  // Полки делят внутренний объём поровну и утоплены от фасада
  for (let index = 1; index <= shelves; index++) {
    const shelfY = (heightMm * index) / (shelves + 1);
    parts.push(
      markPanel(
        at(segmentedBox(innerWidth, thickness, depthMm - 30, 1), 0, shelfY, 12),
        'Полка',
        innerWidth,
        depthMm - 30,
        thickness,
      ),
    );
  }

  return parts;
}

/**
 * Открытый короб: ящик или ниша. Без крышки, с бортами по периметру.
 */
export function openBoxPanels(widthMm, heightMm, depthMm, options = {}) {
  const { bottomMm = 0, thickness = 14 } = options;
  const parts = carcassPanels(widthMm, heightMm, depthMm, {
    bottomMm,
    thickness,
    openTop: true,
    openBack: true,
  });

  // Задний борт такой же, как боковины: у ящика он несущий
  parts.push(
    markPanel(
      translate(
        segmentedBox(widthMm - thickness * 2, heightMm, thickness, 1),
        0,
        bottomMm + heightMm / 2,
        -(depthMm - thickness) / 2,
      ),
      'Задний борт ящика',
      widthMm - thickness * 2,
      heightMm,
      thickness,
    ),
  );

  return parts;
}
