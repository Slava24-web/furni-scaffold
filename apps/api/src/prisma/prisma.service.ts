import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Выполняет операции в транзакции с установленным tenant-контекстом.
   * ВСЕ запросы к данным тенанта идут только через этот метод — иначе
   * RLS отсечёт строки и запрос вернёт пустоту (что и должно происходить).
   */
  async withTenant<T>(tenantId: string, fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      // SET LOCAL действует до конца транзакции — утечки контекста между
      // запросами при переиспользовании соединения из пула не будет.
      await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${assertUuid(tenantId)}'`);
      return fn(tx as unknown as PrismaClient);
    });
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** SET LOCAL не принимает параметры, поэтому значение валидируем строго. */
function assertUuid(value: string): string {
  if (!UUID_RE.test(value)) {
    throw new Error('Некорректный tenantId');
  }
  return value;
}
