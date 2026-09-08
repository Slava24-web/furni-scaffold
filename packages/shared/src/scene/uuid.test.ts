import { describe, expect, it } from 'vitest';
import { deterministicUuid, randomUUID } from './uuid';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomUUID', () => {
  it('соответствует формату v4', () => {
    expect(randomUUID()).toMatch(UUID_RE);
  });

  it('не повторяется', () => {
    const values = new Set(Array.from({ length: 500 }, () => randomUUID()));
    expect(values.size).toBe(500);
  });
});

describe('deterministicUuid', () => {
  it('соответствует формату v4', () => {
    expect(deterministicUuid('TEST-KIT-BASE-600')).toMatch(UUID_RE);
  });

  it('одна и та же строка даёт один и тот же результат', () => {
    expect(deterministicUuid('TEST-KIT-BASE-600')).toBe(deterministicUuid('TEST-KIT-BASE-600'));
  });

  it('разные строки дают разные результаты', () => {
    const skus = [
      'TEST-KIT-BASE-600',
      'TEST-KIT-BASE-800',
      'TEST-KIT-DRW-600',
      'TEST-KIT-WALL-600',
      'TEST-KIT-WALL-800',
      'TEST-KIT-TALL-600',
      'TEST-KIT-TOP-1200',
      'TEST-KIT-TOP-2000',
      'TEST-KIT-FCD-600',
      'TEST-KIT-DOOR-600',
      'TEST-KIT-DRWBOX-600',
      'TEST-KIT-HANDLE-224',
      'TEST-WRD-1200',
      'TEST-SBD-1200',
      'TEST-TBL-1400',
      'TEST-CHR-460',
      'TEST-SFA-2040',
    ];
    expect(new Set(skus.map(deterministicUuid)).size).toBe(skus.length);
  });

  it('различает строки, отличающиеся одним символом', () => {
    expect(deterministicUuid('A')).not.toBe(deterministicUuid('B'));
    expect(deterministicUuid('SKU-1')).not.toBe(deterministicUuid('SKU-2'));
  });

  it('пустая строка тоже даёт валидный uuid', () => {
    expect(deterministicUuid('')).toMatch(UUID_RE);
  });
});
