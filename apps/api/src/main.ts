import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  /**
   * Заголовки CORS отражают источник, а настоящая проверка домена живёт
   * в TenantMiddleware: она знает список разрешённых доменов тенанта и
   * отвечает 401 до того, как запрос дойдёт до данных. Держать проверку
   * в двух местах нельзя — два разных Access-Control-Allow-Origin в
   * ответе браузер отвергает целиком.
   */
  app.enableCors({
    origin: true,
    credentials: false,
    allowedHeaders: ['content-type', 'x-tenant-slug'],
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  });
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
