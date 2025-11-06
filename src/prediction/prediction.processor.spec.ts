import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { PredictionProcessor } from './prediction.processor';
import { Prediction } from './entities/prediction.entity';
import { Result } from './entities/result.entity';
import { RedisService } from '../redis/redis.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { MetricsService } from '../common/services/metrics.service';
import { ScoringService } from './scoring.service';
import { GroupDataService } from './services/group-data.service';

describe('PredictionProcessor', () => {
  let processor: PredictionProcessor;
  let predictionRepository: jest.Mocked<Repository<Prediction>>;
  let resultRepository: jest.Mocked<Repository<Result>>;
  let redisService: jest.Mocked<RedisService>;
  let rabbitMQService: jest.Mocked<RabbitMQService>;
  let metricsService: jest.Mocked<MetricsService>;
  let scoringService: jest.Mocked<ScoringService>;
  let groupDataService: jest.Mocked<GroupDataService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PredictionProcessor,
        {
          provide: getRepositoryToken(Prediction),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Result),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            setex: jest.fn(),
            incr: jest.fn(),
          },
        },
        {
          provide: RabbitMQService,
          useValue: {
            consume: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                'rabbitmq.queue': 'prediction.process',
                'prediction.batchSize': 1000,
              };
              return config[key];
            }),
          },
        },
        {
          provide: MetricsService,
          useValue: {
            incrementPredictionsProcessed: jest.fn(),
            incrementPredictionsFailed: jest.fn(),
            recordPredictionProcessingDuration: jest.fn(),
          },
        },
        {
          provide: ScoringService,
          useValue: {
            scoreUser: jest.fn(),
          },
        },
        {
          provide: GroupDataService,
          useValue: {
            getCorrectGroups: jest.fn(),
            getTeamByName: jest.fn(),
          },
        },
      ],
    }).compile();

    processor = module.get<PredictionProcessor>(PredictionProcessor);
    predictionRepository = module.get(getRepositoryToken(Prediction));
    resultRepository = module.get(getRepositoryToken(Result));
    redisService = module.get(RedisService);
    rabbitMQService = module.get(RabbitMQService);
    metricsService = module.get(MetricsService);
    scoringService = module.get(ScoringService);
    groupDataService = module.get(GroupDataService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processPredictionJob', () => {
    const validJob = {
      predictionId: 'pred-123',
      userId: 'user-456',
    };

    const mockPrediction: Prediction = {
      id: 'pred-123',
      userId: 'user-456',
      predict: {
        A: [['team1'], ['team2'], ['team3'], ['team4']],
      },
      createdAt: new Date(),
    };

    it('should reject invalid predictionId', async () => {
      await expect(
        processor.processPredictionJob({ predictionId: null, userId: 'user-123' } as any),
      ).rejects.toThrow('Invalid predictionId');
    });

    it('should reject invalid userId', async () => {
      await expect(
        processor.processPredictionJob({ predictionId: 'pred-123', userId: null } as any),
      ).rejects.toThrow('Invalid userId');
    });

    it('should skip already processed predictions', async () => {
      resultRepository.findOne.mockResolvedValue({ id: 'result-123' } as any);

      await processor.processPredictionJob(validJob);

      expect(resultRepository.findOne).toHaveBeenCalledWith({
        where: { predictionId: 'pred-123' },
      });
      expect(predictionRepository.findOne).not.toHaveBeenCalled();
    });

    it('should handle prediction not found', async () => {
      resultRepository.findOne.mockResolvedValue(null);
      predictionRepository.findOne.mockResolvedValue(null);

      await processor.processPredictionJob(validJob);

      expect(predictionRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'pred-123' },
      });
      // Should return early without processing
      expect(resultRepository.save).not.toHaveBeenCalled();
    });

    it('should process prediction and save result', async () => {
      resultRepository.findOne.mockResolvedValue(null);
      predictionRepository.findOne.mockResolvedValue(mockPrediction);

      // Mock group data service
      groupDataService.getCorrectGroups.mockResolvedValue(
        new Map([['A', ['team1', 'team2', 'team3', 'team4']]]),
      );
      redisService.incr.mockResolvedValue(1);

      // Mock scoring service
      scoringService.scoreUser.mockResolvedValue({
        score: 100,
        rule: 'ALL_CORRECT',
        details: { description: 'All teams correct' },
      });

      const mockResult = { id: 'result-123' };
      resultRepository.create.mockReturnValue(mockResult as any);
      resultRepository.save.mockResolvedValue(mockResult as any);

      await processor.processPredictionJob(validJob);

      expect(scoringService.scoreUser).toHaveBeenCalled();
      expect(resultRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          predictionId: 'pred-123',
          userId: 'user-456',
          totalScore: 100,
          details: expect.objectContaining({
            scoringBreakdown: expect.arrayContaining([
              expect.objectContaining({ score: 100, type: 1 }),
            ]),
          }),
        }),
      );
      expect(resultRepository.save).toHaveBeenCalledWith(mockResult);
      expect(redisService.incr).toHaveBeenCalled(); // Stats key is now constant
      expect(metricsService.incrementPredictionsProcessed).toHaveBeenCalled();
      expect(metricsService.recordPredictionProcessingDuration).toHaveBeenCalled();
    });

    it('should record metrics on failure', async () => {
      resultRepository.findOne.mockResolvedValue(null);
      predictionRepository.findOne.mockRejectedValue(new Error('DB error'));

      await expect(processor.processPredictionJob(validJob)).rejects.toThrow('DB error');

      expect(metricsService.incrementPredictionsFailed).toHaveBeenCalledWith('DB error');
    });
  });

  describe('startConsuming', () => {
    it('should register consumer on queue', async () => {
      process.env.WORKER_MODE = 'true';

      await processor.startConsuming();

      expect(rabbitMQService.consume).toHaveBeenCalledWith(
        'prediction.process',
        expect.any(Function),
      );
    });
  });
});
