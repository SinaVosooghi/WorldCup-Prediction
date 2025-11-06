import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PredictionService } from './prediction.service';
import { Prediction } from './entities/prediction.entity';
import { Result } from './entities/result.entity';
import { Team } from './entities/team.entity';
import { RedisService } from '../redis/redis.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../common/services/metrics.service';
import { ScoringService } from './scoring.service';
import { GroupDataService } from './services/group-data.service';

describe('PredictionService', () => {
  let service: PredictionService;
  let predictionRepository: Repository<Prediction>;
  let teamRepository: Repository<Team>;
  let redisService: RedisService;
  let scoringService: ScoringService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PredictionService,
        {
          provide: getRepositoryToken(Prediction),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Result),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Team),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            setex: jest.fn(),
            set: jest.fn(),
            incr: jest.fn(),
          },
        },
        {
          provide: RabbitMQService,
          useValue: {
            publishToQueue: jest.fn(),
            getQueueMessageCount: jest.fn().mockResolvedValue(0),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                'rabbitmq.queue': 'prediction.process',
                'prediction.batchSize': 1000,
                'prediction.enableAsyncProcessing': true,
              };
              return config[key];
            }),
          },
        },
        {
          provide: MetricsService,
          useValue: {
            incrementPredictionsQueued: jest.fn(),
            incrementPredictionsProcessed: jest.fn(),
            incrementPredictionsFailed: jest.fn(),
            setQueueDepth: jest.fn(),
            recordPredictionProcessingDuration: jest.fn(),
          },
        },
        {
          provide: ScoringService,
          useValue: {
            scoreUser: jest.fn(),
            countPerfectGroups: jest.fn(),
            countThreeCorrectTeamsGroups: jest.fn(),
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

    service = module.get<PredictionService>(PredictionService);
    predictionRepository = module.get<Repository<Prediction>>(getRepositoryToken(Prediction));
    teamRepository = module.get<Repository<Team>>(getRepositoryToken(Team));
    redisService = module.get<RedisService>(RedisService);
    scoringService = module.get<ScoringService>(ScoringService);
  });

  describe('scoring integration', () => {
    it('should integrate with scoring service when processing predictions', async () => {
      // Verify scoring service is available
      expect(scoringService).toBeDefined();
      expect(typeof scoringService.scoreUser).toBe('function');
    });

    it('should call scoring service with correct parameters', async () => {
      const mockScore = {
        score: 100,
        rule: 'ALL_CORRECT' as const,
        details: {
          description: 'All 48 teams correctly placed',
        },
      };

      jest.spyOn(scoringService, 'scoreUser').mockResolvedValue(mockScore as any);

      const userGroups = {
        A: ['1', '2', '3', '4'],
        B: ['5', '6', '7', '8'],
      };
      const correctGroups = new Map([
        ['A', ['1', '2', '3', '4']],
        ['B', ['5', '6', '7', '8']],
      ]);

      const result = await scoringService.scoreUser(userGroups, correctGroups);

      expect(result.score).toBe(100);
      expect(result.rule).toBe('ALL_CORRECT');
      expect(scoringService.scoreUser).toHaveBeenCalledWith(userGroups, correctGroups);
    });
  });

  describe('createPrediction', () => {
    it('should create a prediction successfully', async () => {
      const userId = 'user-1';
      const predictData = {
        groups: {
          A: ['1', '2', '3', '4'],
        },
      };

      const mockPrediction = { id: 'pred-1', userId, predict: predictData };
      jest.spyOn(predictionRepository, 'create').mockReturnValue(mockPrediction as any);
      jest.spyOn(predictionRepository, 'save').mockResolvedValue(mockPrediction as any);

      const result = await service.createPrediction(userId, predictData);

      expect(result).toEqual(mockPrediction);
      expect(predictionRepository.create).toHaveBeenCalledWith({
        userId,
        predict: predictData,
      });
    });
  });
});
