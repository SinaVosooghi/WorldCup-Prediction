import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter, AllExceptionsFilter } from './common/filters/http-exception.filter';
import { ConfigValidationService } from './common/config/config-validation.service';
import { MetricsGuard } from './common/guards/metrics.guard';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Validate configuration on startup
  const configValidator = app.get(ConfigValidationService);
  configValidator.validate();

  // Secure metrics endpoint with IP whitelist
  const metricsGuard = app.get(MetricsGuard);
  // Note: PrometheusModule creates /metrics route automatically
  // We apply guard globally and check path in guard if needed
  // For now, document that METRICS_ALLOWED_IPS env var controls access

  // Enable CORS
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global exception filters
  app.useGlobalFilters(new AllExceptionsFilter(), new HttpExceptionFilter());

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('World Cup Prediction API')
    .setDescription(
      'A comprehensive system featuring OTP-based authentication and intelligent prediction processing for World Cup group stage predictions',
    )
    .setVersion('1.0')
    .addTag('Authentication', 'OTP-based authentication endpoints')
    .addTag('Prediction', 'Prediction management and scoring')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your access token',
      },
      'bearer',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      defaultModelsExpandDepth: 1,
      defaultModelExpandDepth: 1,
    },
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🏆 World Cup Prediction System                          ║
║                                                           ║
║   🚀 Application is running!                              ║
║   📍 URL: http://localhost:${port}                           ║
║   📚 API Docs: http://localhost:${port}/api/docs             ║
║                                                           ║
║   Environment: ${process.env.NODE_ENV || 'development'}                                ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
}

bootstrap();
