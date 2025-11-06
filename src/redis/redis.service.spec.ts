import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';
import Redis from 'ioredis';

// Mock ioredis
jest.mock('ioredis');

describe('RedisService', () => {
  let service: RedisService;
  let configService: ConfigService;
  let mockRedisClient: jest.Mocked<Redis>;

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Setup Redis mock
    mockRedisClient = {
      get: jest.fn(),
      set: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
      exists: jest.fn(),
      ttl: jest.fn(),
      ping: jest.fn(),
      quit: jest.fn(),
      on: jest.fn(),
    } as any;

    (Redis as jest.MockedClass<typeof Redis>).mockImplementation(() => mockRedisClient);

    // Setup config mock
    mockConfigService.get.mockImplementation((key: string) => {
      const config = {
        'redis.host': 'localhost',
        'redis.port': 6379,
        'redis.password': undefined,
      };
      return config[key];
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
    configService = module.get<ConfigService>(ConfigService);

    await service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize Redis client with correct config', () => {
      expect(Redis).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 6379,
          password: undefined,
        }),
      );
    });

    it('should setup event listeners', () => {
      expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockRedisClient.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
    });
  });

  describe('onModuleDestroy', () => {
    it('should close Redis connection gracefully', async () => {
      mockRedisClient.quit.mockResolvedValue('OK');

      await service.onModuleDestroy();

      expect(mockRedisClient.quit).toHaveBeenCalled();
    });

    it('should handle errors during connection close', async () => {
      mockRedisClient.quit.mockRejectedValue(new Error('Connection error'));

      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });
  });

  describe('get', () => {
    it('should get value from Redis', async () => {
      const key = 'test-key';
      const value = 'test-value';
      mockRedisClient.get.mockResolvedValue(value);

      const result = await service.get(key);

      expect(mockRedisClient.get).toHaveBeenCalledWith(key);
      expect(result).toBe(value);
    });

    it('should return null for non-existent key', async () => {
      const key = 'non-existent';
      mockRedisClient.get.mockResolvedValue(null);

      const result = await service.get(key);

      expect(result).toBeNull();
    });

    it('should handle errors', async () => {
      const key = 'test-key';
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));

      await expect(service.get(key)).rejects.toThrow('Redis error');
    });
  });

  describe('set', () => {
    it('should set value in Redis', async () => {
      const key = 'test-key';
      const value = 'test-value';
      mockRedisClient.set.mockResolvedValue('OK');

      const result = await service.set(key, value);

      expect(mockRedisClient.set).toHaveBeenCalledWith(key, value);
      expect(result).toBe('OK');
    });

    it('should handle errors', async () => {
      const key = 'test-key';
      const value = 'test-value';
      mockRedisClient.set.mockRejectedValue(new Error('Redis error'));

      await expect(service.set(key, value)).rejects.toThrow('Redis error');
    });
  });

  describe('setex', () => {
    it('should set value with expiry', async () => {
      const key = 'test-key';
      const seconds = 3600;
      const value = 'test-value';
      mockRedisClient.setex.mockResolvedValue('OK');

      const result = await service.setex(key, seconds, value);

      expect(mockRedisClient.setex).toHaveBeenCalledWith(key, seconds, value);
      expect(result).toBe('OK');
    });

    it('should handle errors', async () => {
      const key = 'test-key';
      const seconds = 3600;
      const value = 'test-value';
      mockRedisClient.setex.mockRejectedValue(new Error('Redis error'));

      await expect(service.setex(key, seconds, value)).rejects.toThrow('Redis error');
    });
  });

  describe('del', () => {
    it('should delete key from Redis', async () => {
      const key = 'test-key';
      mockRedisClient.del.mockResolvedValue(1);

      const result = await service.del(key);

      expect(mockRedisClient.del).toHaveBeenCalledWith(key);
      expect(result).toBe(1);
    });

    it('should return 0 for non-existent key', async () => {
      const key = 'non-existent';
      mockRedisClient.del.mockResolvedValue(0);

      const result = await service.del(key);

      expect(result).toBe(0);
    });

    it('should handle errors', async () => {
      const key = 'test-key';
      mockRedisClient.del.mockRejectedValue(new Error('Redis error'));

      await expect(service.del(key)).rejects.toThrow('Redis error');
    });
  });

  describe('incr', () => {
    it('should increment counter', async () => {
      const key = 'counter';
      mockRedisClient.incr.mockResolvedValue(1);

      const result = await service.incr(key);

      expect(mockRedisClient.incr).toHaveBeenCalledWith(key);
      expect(result).toBe(1);
    });

    it('should handle errors', async () => {
      const key = 'counter';
      mockRedisClient.incr.mockRejectedValue(new Error('Redis error'));

      await expect(service.incr(key)).rejects.toThrow('Redis error');
    });
  });

  describe('expire', () => {
    it('should set expiry on key', async () => {
      const key = 'test-key';
      const seconds = 3600;
      mockRedisClient.expire.mockResolvedValue(1);

      const result = await service.expire(key, seconds);

      expect(mockRedisClient.expire).toHaveBeenCalledWith(key, seconds);
      expect(result).toBe(1);
    });

    it('should return 0 for non-existent key', async () => {
      const key = 'non-existent';
      const seconds = 3600;
      mockRedisClient.expire.mockResolvedValue(0);

      const result = await service.expire(key, seconds);

      expect(result).toBe(0);
    });

    it('should handle errors', async () => {
      const key = 'test-key';
      const seconds = 3600;
      mockRedisClient.expire.mockRejectedValue(new Error('Redis error'));

      await expect(service.expire(key, seconds)).rejects.toThrow('Redis error');
    });
  });

  describe('exists', () => {
    it('should check if key exists', async () => {
      const key = 'test-key';
      mockRedisClient.exists.mockResolvedValue(1);

      const result = await service.exists(key);

      expect(mockRedisClient.exists).toHaveBeenCalledWith(key);
      expect(result).toBe(1);
    });

    it('should return 0 for non-existent key', async () => {
      const key = 'non-existent';
      mockRedisClient.exists.mockResolvedValue(0);

      const result = await service.exists(key);

      expect(result).toBe(0);
    });

    it('should handle errors', async () => {
      const key = 'test-key';
      mockRedisClient.exists.mockRejectedValue(new Error('Redis error'));

      await expect(service.exists(key)).rejects.toThrow('Redis error');
    });
  });

  describe('ttl', () => {
    it('should get TTL of key', async () => {
      const key = 'test-key';
      mockRedisClient.ttl.mockResolvedValue(3600);

      const result = await service.ttl(key);

      expect(mockRedisClient.ttl).toHaveBeenCalledWith(key);
      expect(result).toBe(3600);
    });

    it('should return -1 for key without expiry', async () => {
      const key = 'persistent-key';
      mockRedisClient.ttl.mockResolvedValue(-1);

      const result = await service.ttl(key);

      expect(result).toBe(-1);
    });

    it('should return -2 for non-existent key', async () => {
      const key = 'non-existent';
      mockRedisClient.ttl.mockResolvedValue(-2);

      const result = await service.ttl(key);

      expect(result).toBe(-2);
    });

    it('should handle errors', async () => {
      const key = 'test-key';
      mockRedisClient.ttl.mockRejectedValue(new Error('Redis error'));

      await expect(service.ttl(key)).rejects.toThrow('Redis error');
    });
  });

  describe('isHealthy', () => {
    it('should return true when Redis is healthy', async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');

      const result = await service.isHealthy();

      expect(mockRedisClient.ping).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false when Redis connection fails', async () => {
      mockRedisClient.ping.mockRejectedValue(new Error('Connection failed'));

      const result = await service.isHealthy();

      expect(result).toBe(false);
    });

    it('should return false when client is not initialized', async () => {
      const uninitializedService = new RedisService(configService);

      const result = await uninitializedService.isHealthy();

      expect(result).toBe(false);
    });
  });

  describe('getClient (deprecated)', () => {
    it('should return Redis client with deprecation warning', () => {
      const client = service.getClient();

      expect(client).toBeDefined();
      expect(client).toBe(mockRedisClient);
    });
  });
});
