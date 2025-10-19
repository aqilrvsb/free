import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { json, urlencoded } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { SwaggerTags } from './swagger/swagger-tags';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error','warn','log'] });
  app.enableCors({ origin: true, credentials: true });
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

  const builder = new DocumentBuilder()
    .setTitle('FreeSWITCH Management API')
    .setDescription('Tài liệu API cho các endpoint quản lý FreeSWITCH')
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Nhập access token nhận được từ /auth/login',
      },
      'jwt',
    );

  Object.values(SwaggerTags).forEach((tag) => {
    builder.addTag(tag);
  });

  const config = builder.build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = process.env.APP_PORT ? parseInt(process.env.APP_PORT, 10) : 3000;
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`FS XML service is running on 0.0.0.0:${port}`);
}
bootstrap();
