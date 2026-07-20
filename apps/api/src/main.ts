import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(ConfigService);
  const port = Number(config.get<string | number>('PORT', 4000));
  const corsOrigin = config.get<string>('CORS_ORIGIN', 'http://localhost:3000');

  app.setGlobalPrefix('api');
  // '*' (or empty) reflects the request Origin so multi-host deploys work with credentials
  if (!corsOrigin || corsOrigin.trim() === '*') {
    app.enableCors({ origin: true, credentials: true });
  } else {
    app.enableCors({
      origin: corsOrigin.split(',').map((o) => o.trim()).filter(Boolean),
      credentials: true,
    });
  }
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swagger = new DocumentBuilder()
    .setTitle('Aviator Crash Simulator API')
    .setDescription(
      'Educational crash-game simulation API. No real-money gambling, deposits, or withdrawals.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port, '0.0.0.0');
  Logger.log(`API listening on http://0.0.0.0:${port}/api`, 'Bootstrap');
  Logger.log(`Swagger at http://0.0.0.0:${port}/api/docs`, 'Bootstrap');
}

bootstrap();
