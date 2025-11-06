#!/usr/bin/env ts-node
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PredictionService } from './prediction/prediction.service';
import { RabbitMQService } from './rabbitmq/rabbitmq.service';
import { RedisService } from './redis/redis.service';

/**
 * Monitoring script for prediction processing
 * Run: npx ts-node src/monitor-processing.ts
 */
async function monitor() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const predictionService = app.get(PredictionService);
  const rabbitMQService = app.get(RabbitMQService);
  const redisService = app.get(RedisService);

  console.log('🔍 Prediction Processing Monitor\n');
  console.log('Press Ctrl+C to exit\n');
  console.log('─'.repeat(80));

  const startTime = Date.now();
  let lastProcessed = 0;

  const monitorInterval = setInterval(async () => {
    try {
      // Get Redis stats
      const totalStr = await redisService.get('prediction:stats:total');
      const processedStr = await redisService.get('prediction:stats:processed');

      const total = parseInt(totalStr || '0', 10);
      const processed = parseInt(processedStr || '0', 10);
      const pending = total - processed;

      // Get queue depth (handle errors gracefully)
      let queueDepth = 0;
      try {
        const status = await predictionService.getProcessingStatus();
        queueDepth = isFinite(status.queueDepth) ? status.queueDepth : 0;
      } catch (e) {
        queueDepth = 0;
      }

      // Calculate rate
      const processingRate = processed - lastProcessed;
      lastProcessed = processed;

      // Calculate ETA
      const elapsed = (Date.now() - startTime) / 1000;
      const avgRate = processed / elapsed;
      const eta = avgRate > 0 ? Math.round(pending / avgRate) : 0;

      // Progress bar
      const progress = total > 0 ? ((processed / total) * 100).toFixed(1) : '0.0';
      const barLength = 40;
      const filled = Math.round((processed / total) * barLength);
      const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);

      // Clear and display
      console.clear();
      console.log('🔍 Prediction Processing Monitor\n');
      console.log(`Time: ${Math.floor(elapsed)}s | Press Ctrl+C to exit\n`);
      console.log('─'.repeat(80));
      console.log(`\nProgress: [${bar}] ${progress}%\n`);
      console.log(`Total:          ${total.toLocaleString()}`);
      console.log(`Processed:      ${processed.toLocaleString()}`);
      console.log(`Pending:        ${pending.toLocaleString()}`);
      console.log(`Queue Depth:    ${queueDepth.toLocaleString()}`);
      console.log(`\nRate:           ${processingRate}/s (last interval)`);
      console.log(`Avg Rate:       ${avgRate.toFixed(1)}/s`);
      console.log(
        `ETA:            ${eta > 0 ? `${Math.floor(eta / 60)}m ${eta % 60}s` : 'calculating...'}`,
      );
      console.log('\n' + '─'.repeat(80));

      // Check if complete
      if (processed >= total && total > 0) {
        console.log(
          `\n✅ Processing complete! ${processed} predictions processed in ${elapsed.toFixed(0)}s`,
        );
        clearInterval(monitorInterval);
        await app.close();
        process.exit(0);
      }
    } catch (error) {
      console.error('Error monitoring:', error.message);
    }
  }, 2000); // Update every 2 seconds

  // Handle Ctrl+C
  process.on('SIGINT', async () => {
    console.log('\n\n👋 Monitoring stopped');
    clearInterval(monitorInterval);
    await app.close();
    process.exit(0);
  });
}

monitor().catch((err) => {
  console.error('Monitor failed:', err);
  process.exit(1);
});
