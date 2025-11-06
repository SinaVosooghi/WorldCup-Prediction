import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * Worker process entry point
 * This runs separately from the main API server and only consumes from RabbitMQ
 */
async function bootstrap() {
  const logger = new Logger('Worker');

  // Set environment variable to indicate worker mode
  process.env.WORKER_MODE = 'true';

  logger.log('Starting Worker Process...');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  logger.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🔧 Worker Process Started                               ║
║                                                           ║
║   Processing predictions from RabbitMQ queue             ║
║   Queue: ${process.env.RABBITMQ_QUEUE || 'prediction.process'}                        ║
║   Worker ID: ${process.pid}                                         ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);

  // Keep the process running
  process.on('SIGINT', async () => {
    logger.log('Received SIGINT signal. Gracefully shutting down...');
    await app.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.log('Received SIGTERM signal. Gracefully shutting down...');
    await app.close();
    process.exit(0);
  });
}

bootstrap().catch((error) => {
  console.error('Worker failed to start:', error);
  process.exit(1);
});
