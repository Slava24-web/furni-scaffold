import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaService } from './prisma/prisma.service';
import { TenantMiddleware } from './common/tenant.middleware';
import { ScenesController } from './modules/scenes/scenes.controller';
import { ScenesService } from './modules/scenes/scenes.service';
import { PricingService } from './modules/pricing/pricing.service';
import { QuoteController } from './modules/quote/quote.controller';
import { QuoteService } from './modules/quote/quote.service';
import { LeadsController } from './modules/leads/leads.controller';
import { LeadsService } from './modules/leads/leads.service';
import { LeadWebhookService } from './modules/leads/lead-webhook.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Защита квот от абуза: создание сцен и расчёт цены дороги (ТЗ 12)
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
  ],
  controllers: [ScenesController, QuoteController, LeadsController],
  providers: [
    PrismaService,
    ScenesService,
    PricingService,
    QuoteService,
    LeadsService,
    LeadWebhookService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TenantMiddleware).forRoutes('v1/*');
  }
}
