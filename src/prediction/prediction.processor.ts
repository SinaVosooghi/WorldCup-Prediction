import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { Prediction } from './entities/prediction.entity';
import { Result } from './entities/result.entity';
import { RedisService } from '../redis/redis.service';
import { MetricsService } from '../common/services/metrics.service';
import { ScoringService } from './scoring.service';
import { GroupDataService } from './services/group-data.service';
import { flattenPredictionGroups } from './helpers/prediction.helper';
import { mapScoreResultToLegacyDetails } from './mappers/score-result.mapper';
import { SCORING_CONSTANTS } from './types/scoring.types';

interface PredictionJob {
  predictionId: string;
  userId: string;
}

@Injectable()
export class PredictionProcessor implements OnModuleInit {
  private readonly logger = new Logger(PredictionProcessor.name);
  private readonly queueName: string;

  constructor(
    @InjectRepository(Prediction)
    private predictionRepository: Repository<Prediction>,
    @InjectRepository(Result)
    private resultRepository: Repository<Result>,
    private redisService: RedisService,
    private rabbitMQService: RabbitMQService,
    private configService: ConfigService,
    private metricsService: MetricsService,
    private scoringService: ScoringService,
    private groupDataService: GroupDataService,
  ) {
    this.queueName = this.configService.get<string>('rabbitmq.queue') || 'prediction.process';
  }

  async onModuleInit() {
    // Only start consuming if this is a worker process (not the main app)
    if (process.env.WORKER_MODE === 'true') {
      const batchSize = this.configService.get<number>('prediction.batchSize');
      this.logger.log(`Worker initialized with batch size: ${batchSize}`);
      await this.startConsuming();
    }
  }

  /**
   * Starts consuming messages from the prediction processing queue
   */
  async startConsuming(): Promise<void> {
    this.logger.log(`Starting prediction processor for queue: ${this.queueName}`);

    await this.rabbitMQService.consume(this.queueName, async (job: PredictionJob) => {
      await this.processPredictionJob(job);
    });

    this.logger.log('Prediction processor is now listening for jobs');
  }

  /**
   * Processes a single prediction job
   */
  async processPredictionJob(job: PredictionJob): Promise<void> {
    const startTime = Date.now();
    const { predictionId, userId } = job;

    // Input validation
    if (!predictionId || typeof predictionId !== 'string') {
      this.logger.error(`Invalid predictionId: ${predictionId}`);
      throw new Error('Invalid predictionId');
    }

    if (!userId || typeof userId !== 'string') {
      this.logger.error(`Invalid userId: ${userId}`);
      throw new Error('Invalid userId');
    }

    try {
      this.logger.log(`Processing prediction ${predictionId} for user ${userId}`);

      // Check if already processed
      const existingResult = await this.resultRepository.findOne({
        where: { predictionId },
      });

      if (existingResult) {
        this.logger.warn(`Prediction ${predictionId} already processed, skipping`);
        return;
      }

      // Get the prediction
      const prediction = await this.predictionRepository.findOne({
        where: { id: predictionId },
      });

      if (!prediction) {
        this.logger.error(`Prediction ${predictionId} not found`);
        return;
      }

      // Get correct groups and flatten user prediction
      const correctGroups = await this.groupDataService.getCorrectGroups();
      const userGroups = flattenPredictionGroups(prediction.predict);

      // Calculate score using ScoringService
      const scoreResult = await this.scoringService.scoreUser(userGroups, correctGroups);

      // Map to legacy details format for backward compatibility
      const legacyDetails = mapScoreResultToLegacyDetails(scoreResult, userGroups, correctGroups);

      // Save result
      const result = this.resultRepository.create({
        predictionId: prediction.id,
        userId: prediction.userId,
        totalScore: scoreResult.score,
        details: legacyDetails,
        processedAt: new Date(),
      });

      await this.resultRepository.save(result);

      // Update Redis stats
      await this.redisService.incr(SCORING_CONSTANTS.CACHE_KEYS.STATS_PROCESSED);

      // Update metrics
      const duration = (Date.now() - startTime) / 1000; // Convert to seconds
      this.metricsService.incrementPredictionsProcessed();
      this.metricsService.recordPredictionProcessingDuration(duration);

      this.logger.log(
        `Processed prediction ${predictionId} in ${duration * 1000}ms - Score: ${scoreResult.score}`,
      );
    } catch (error) {
      this.logger.error(`Error processing prediction ${predictionId}:`, error);

      // Update failure metrics
      this.metricsService.incrementPredictionsFailed(error.message || 'unknown_error');

      throw error; // Re-throw to trigger retry mechanism
    }
  }
}
