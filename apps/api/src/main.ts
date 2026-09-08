import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // CORS для виджета настраивается пер-тенант в TenantMiddleware
  app.enableCors({ origin: false, credentials: false });
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
