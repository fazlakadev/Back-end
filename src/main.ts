import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import * as Sentry from '@sentry/nestjs';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { SentryInterceptor } from './common/interceptors/sentry.interceptor';
import { I18nValidationExceptionFilter } from 'nestjs-i18n';
import { NestLogger } from './system/nest-logger.service';
import { systemLogBuffer } from './system/log-buffer.service';

async function bootstrap() {
  const nestLogger = new NestLogger(systemLogBuffer);
  const app = await NestFactory.create(AppModule, {
    logger: nestLogger,
  });
  Logger.overrideLogger(nestLogger);

  const config = app.get(ConfigService);

  const sentryDsn = config.get<string>('SENTRY_DSN');
  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: config.get<string>('env') || 'development',
      tracesSampleRate: config.get('env') === 'production' ? 0.2 : 1.0,
      integrations: [Sentry.prismaIntegration()],
    });
    app.useGlobalInterceptors(new SentryInterceptor());
    Logger.log('🐛 Sentry error tracking initialized', 'Bootstrap');
  }

  app.setGlobalPrefix(config.get<string>('apiPrefix') || 'api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());
  app.use(require('express').json({ limit: '5mb' }));
  app.use(require('express').urlencoded({ extended: true, limit: '5mb' }));
  app.enableCors({
    origin: config.get<string[]>('corsOrigins') || (config.get('env') === 'production' ? [] : true),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Lang', 'X-Locale', 'X-Request-Id', 'Accept-Language'],
    maxAge: 86400,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(
    new I18nValidationExceptionFilter({ detailedErrors: false }),
    new AllExceptionsFilter(app.get(HttpAdapterHost)),
  );

  if (config.get<string>('env') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Fazlaka API')
      .setDescription(
        'Backend API for the Fazlaka (فذلكة) educational content platform',
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .addServer(`http://localhost:${config.get<number>('port')}`)
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  const port = config.get<number>('port') || 3001;
  await app.listen(port);

  Logger.log(
    `🚀 Fazlaka API running on http://localhost:${port}/${config.get<string>('apiPrefix')}`,
    'Bootstrap',
  );

  Logger.log(
    `📚 Swagger docs on http://localhost:${port}/api/docs`,
    'Bootstrap',
  );

  // Graceful shutdown — drain in-flight requests before closing DB pool
  const shutdown = async () => {
    Logger.log('Graceful shutdown initiated…', 'Shutdown');
    await app.close();
    Logger.log('Shutdown complete', 'Shutdown');
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
void bootstrap();
