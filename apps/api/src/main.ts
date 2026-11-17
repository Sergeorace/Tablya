import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { JsonLogger } from './common/json.logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true, // requis pour la vérification de signature des webhooks paiement
  });

  const logger = app.get(JsonLogger);
  app.useLogger(logger);

  const config = app.get(ConfigService);
  const prefix = config.get<string>('API_PREFIX', 'api/v1');

  app.setGlobalPrefix(prefix);
  app.use(helmet());
  app.enableCors({
    origin: (origin, cb) => {
      // TODO(E8): whitelist par tenant depuis la charte/abonnement
      if (!origin || config.get<string>('NODE_ENV') !== 'production') return cb(null, true);
      cb(null, true); // durcissement CORS prévu en E8
    },
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  Logger.log(`Tablya API démarrée sur :${port}/${prefix}`, 'Bootstrap');
}

bootstrap();
