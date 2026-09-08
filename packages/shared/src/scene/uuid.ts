/**
 * UUID v4 без зависимостей.
 *
 * crypto.randomUUID есть и в Node 22, и в браузерах, но только в
 * защищённом контексте: по http с адреса в локальной сети его нет,
 * а именно так тестируют планировщик с телефона. Запасной путь
 * обязателен, иначе создание комнаты падает ровно на живом устройстве.
 */
/** Структурный тип вместо DOM-типа Crypto: пакет собирается без lib.dom. */
interface CryptoLike {
  randomUUID?: () => string;
  getRandomValues?: <T extends ArrayBufferView>(array: T) => T;
}

export function randomUUID(): string {
  const api = (globalThis as { crypto?: CryptoLike }).crypto;
  if (typeof api?.randomUUID === 'function') return api.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof api?.getRandomValues === 'function') {
    api.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }

  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Детерминированный UUID из строки.
 *
 * ВРЕМЕННАЯ МЕРА: документ сцены требует productId в формате uuid, а
 * манифест каталога знает изделия только по SKU — настоящие идентификаторы
 * живут в БД. Пока клиент не получает каталог из API, ссылка выводится
 * из SKU: она стабильна между сессиями, а сервер всё равно сверяется
 * по полю sku, которое лежит в том же размещении.
 */
export function deterministicUuid(seed: string): string {
  const bytes = new Uint8Array(16);
  // FNV-1a четырьмя независимыми потоками: одного 32-битного хеша
  // на 16 байт не хватает, коллизии пошли бы уже на десятке SKU
  for (let lane = 0; lane < 4; lane++) {
    let hash = 0x811c9dc5 ^ lane;
    for (let i = 0; i < seed.length; i++) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    bytes[lane * 4] = (hash >>> 24) & 0xff;
    bytes[lane * 4 + 1] = (hash >>> 16) & 0xff;
    bytes[lane * 4 + 2] = (hash >>> 8) & 0xff;
    bytes[lane * 4 + 3] = hash & 0xff;
  }

  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
