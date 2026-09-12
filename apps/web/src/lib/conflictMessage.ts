import type { ConflictReport } from '@furni/shared';

/**
 * Человекочитаемое описание конфликта размещения.
 *
 * Сообщение называет причину, а не просто факт: «пересекается» без
 * уточнения оставляет пользователя гадать, мешает ему соседний модуль,
 * стена или он вынес шкаф за пределы комнаты.
 */
export function conflictMessage(report: ConflictReport | null | undefined): string | null {
  if (!report) return null;

  const parts: string[] = [];

  if (report.objectIds.length > 0) {
    parts.push(`пересекается с ${plural(report.objectIds.length, 'объектом', 'объектами')}`);
  }
  if (report.wallIds.length > 0) {
    parts.push(report.wallIds.length === 1 ? 'врезается в стену' : 'врезается в стены');
  }
  if (report.openingIds.length > 0) {
    // Причина неочевидная: объект ни с чем не пересекается, но дверь
    // им заблокирована — без прямой формулировки это читается как сбой
    parts.push(
      report.openingIds.length === 1
        ? 'перекрывает зону открывания двери'
        : 'перекрывает зоны открывания дверей',
    );
  }
  if (report.outsideRoom) {
    parts.push('вынесен за пределы комнаты');
  }

  if (parts.length === 0) return null;
  return `Объект ${parts.join(', ')}`;
}

/** Число плюс форма слова: «с 1 объектом», «с 3 объектами». */
function plural(count: number, one: string, many: string): string {
  const lastTwo = count % 100;
  const last = count % 10;
  const useOne = last === 1 && lastTwo !== 11;
  return `${count} ${useOne ? one : many}`;
}
