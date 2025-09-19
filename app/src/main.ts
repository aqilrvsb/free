import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error','warn','log'] });
  app.use((req, _res, next) => {
    const header = req.headers['content-type'];
    if (typeof header === 'string') {
      const baseType = header.split(';')[0].trim().toLowerCase();
      if (baseType === 'application/x-www-form-plaintext') {
        req.headers['content-type'] = 'application/x-www-form-urlencoded';
      }
    }
    next();
  });
  app.use(json({ limit: '5mb' }));
  app.use(urlencoded({ extended: true, limit: '5mb' }));

  const port = process.env.APP_PORT ? parseInt(process.env.APP_PORT, 10) : 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`FS XML service is running on port ${port}`);
}
bootstrap();
