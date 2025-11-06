import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Prediction } from './entities/prediction.entity';
import { Result } from './entities/result.entity';
import { Team } from './entities/team.entity';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../common/services/metrics.service';
import { ScoringService } from './scoring.service';
import { GroupDataService } from './services/group-data.service';
import { flattenPredictionGroups } from './helpers/prediction.helper';
import { SCORING_CONSTANTS } from './types/scoring.types';
import { mapScoreResultToLegacyDetails } from './mappers/score-result.mapper';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class PredictionService {
  private readonly queueName: string;

  constructor(
    @InjectRepository(Prediction)
    private predictionRepository: Repository<Prediction>,
    @InjectRepository(Result)
    private resultRepository: Repository<Result>,
    @InjectRepository(Team)
    private teamRepository: Repository<Team>,
    private redisService: RedisService,
    private rabbitMQService: RabbitMQService,
    private configService: ConfigService,
    private metricsService: MetricsService,
    private scoringService: ScoringService,
    private groupDataService: GroupDataService,
  ) {
    this.queueName = this.configService.get<string>('rabbitmq.queue') || 'prediction.process';
  }

  async createPrediction(userId: string, predictData: any): Promise<Prediction> {
    const prediction = this.predictionRepository.create({
      userId,
      predict: predictData,
    });

    return await this.predictionRepository.save(prediction);
  }

  /**
   * Triggers prediction processing based on feature flag
   * - Async mode (default): Queues to RabbitMQ, returns immediately
   * - Sync mode (legacy): Processes in-place, blocks until complete
   */
  async triggerProcessing(): Promise<any> {
    const asyncEnabled = this.configService.get<boolean>('prediction.enableAsyncProcessing');

    if (asyncEnabled) {
      // Async mode: Queue to RabbitMQ
      const result = await this.queueAllPredictionsForProcessing();
      return {
        message: 'PREDICTION_PROCESSING_QUEUED',
        mode: 'async',
        queued: result.queued,
        total: result.total,
      };
    } else {
      // Sync mode: Process immediately (backward compatibility)
      await this.processPredictionBatch();
      return {
        message: 'PREDICTION_PROCESSING_COMPLETED',
        mode: 'sync',
      };
    }
  }

  /**
   * Queues all unprocessed predictions for asynchronous processing
   * Returns the number of predictions queued
   */
  async queueAllPredictionsForProcessing(): Promise<{ queued: number; total: number }> {
    // Find all predictions that don't have results yet
    const predictions = await this.predictionRepository
      .createQueryBuilder('prediction')
      .leftJoin('results', 'result', 'result.prediction_id = prediction.id')
      .where('result.id IS NULL')
      .select(['prediction.id', 'prediction.userId'])
      .getMany();

    console.log(`Found ${predictions.length} unprocessed predictions to queue`);

    if (predictions.length > 0) {
      console.log(`Sample prediction:`, JSON.stringify(predictions[0], null, 2));
    }

    let queuedCount = 0;
    const batchSize = 100; // Batch logging every 100

    // Initialize Redis stats if not exists
    const totalKey = SCORING_CONSTANTS.CACHE_KEYS.STATS_TOTAL;
    const processedKey = SCORING_CONSTANTS.CACHE_KEYS.STATS_PROCESSED;

    const existingTotal = await this.redisService.get(totalKey);
    if (!existingTotal) {
      await this.redisService.set(totalKey, predictions.length.toString());
      await this.redisService.set(processedKey, '0');
    }

    const startTime = Date.now();

    // Queue each prediction with progress logging
    for (let i = 0; i < predictions.length; i++) {
      const pred = predictions[i];
      const job = {
        predictionId: pred.id,
        userId: pred.userId,
      };

      const success = await this.rabbitMQService.publishToQueue(this.queueName, job);
      if (success) {
        queuedCount++;
      }

      // Log progress every batch
      if ((i + 1) % batchSize === 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const rate = Math.round((i + 1) / (elapsed as any));
        console.log(`Queued ${i + 1}/${predictions.length} (${rate}/s)`);
      }
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Queued ${queuedCount} predictions in ${totalTime}s`);

    // Update metrics
    this.metricsService.incrementPredictionsQueued(queuedCount);

    return {
      queued: queuedCount,
      total: predictions.length,
    };
  }

  /**
   * Gets the current processing status
   */
  async getProcessingStatus(): Promise<{
    total: number;
    processed: number;
    pending: number;
    queueDepth: number;
  }> {
    // Get stats from Redis
    const totalStr = await this.redisService.get(SCORING_CONSTANTS.CACHE_KEYS.STATS_TOTAL);
    const processedStr = await this.redisService.get(SCORING_CONSTANTS.CACHE_KEYS.STATS_PROCESSED);

    const total = parseInt(totalStr || '0', 10);
    const processed = parseInt(processedStr || '0', 10);

    // Get queue depth from RabbitMQ
    const queueDepth = await this.rabbitMQService.getQueueMessageCount(this.queueName);

    // Update metrics
    this.metricsService.setQueueDepth(queueDepth);

    return {
      total,
      processed,
      pending: total - processed,
      queueDepth,
    };
  }

  /**
   * Processes predictions in batches synchronously (legacy mode)
   *
   * @param batchSize - Number of predictions to process per batch (default from config)
   */
  async processPredictionBatch(batchSize?: number): Promise<void> {
    const configBatchSize = this.configService.get<number>('prediction.batchSize');
    const effectiveBatchSize = batchSize || configBatchSize;
    const correctGroups = await this.groupDataService.getCorrectGroups();
    let offset = 0;
    let processed = 0;

    do {
      const predictions = await this.predictionRepository.find({
        skip: offset,
        take: effectiveBatchSize,
        order: { createdAt: 'ASC' },
      });

      if (predictions.length === 0) break;

      const results = [];

      for (const prediction of predictions) {
        const userGroups = flattenPredictionGroups(prediction.predict);
        const scoreResult = await this.scoringService.scoreUser(userGroups, correctGroups);

        // Map to legacy details format for backward compatibility
        const legacyDetails = mapScoreResultToLegacyDetails(scoreResult, userGroups, correctGroups);

        results.push(
          this.resultRepository.create({
            predictionId: prediction.id,
            userId: prediction.userId,
            totalScore: scoreResult.score,
            details: legacyDetails,
            processedAt: new Date(),
          }),
        );
      }

      await this.resultRepository.save(results);
      processed += predictions.length;
      offset += effectiveBatchSize;
    } while (true);

    console.log(`✅ Processed ${processed} predictions`);
  }

  async getUserResults(userId: string): Promise<Result[]> {
    return await this.resultRepository.find({
      where: { userId },
      order: { processedAt: 'DESC' },
    });
  }

  async getLeaderboard(limit: number = 10): Promise<Result[]> {
    return await this.resultRepository.find({
      order: { totalScore: 'DESC', processedAt: 'ASC' },
      take: limit,
    });
  }

  async getAllTeams(): Promise<Team[]> {
    return await this.teamRepository.find({
      order: { group: 'ASC', order: 'ASC' },
    });
  }
}
