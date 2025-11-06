import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RabbitMQService } from './rabbitmq.service';
import { connect, ChannelModel, Channel } from 'amqplib';

jest.mock('amqplib');

describe('RabbitMQService', () => {
  let service: RabbitMQService;
  let mockConnection: jest.Mocked<ChannelModel>;
  let mockChannel: jest.Mocked<Channel>;

  beforeEach(async () => {
    // Create mock channel
    mockChannel = {
      assertExchange: jest.fn(),
      assertQueue: jest.fn(),
      bindQueue: jest.fn(),
      prefetch: jest.fn(),
      sendToQueue: jest.fn(),
      consume: jest.fn(),
      ack: jest.fn(),
      nack: jest.fn(),
      publish: jest.fn(),
      checkQueue: jest.fn(),
      purgeQueue: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
    } as any;

    // Create mock connection
    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
      close: jest.fn(),
      on: jest.fn(),
    } as any;

    (connect as jest.Mock).mockResolvedValue(mockConnection);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RabbitMQService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                'rabbitmq.url': 'amqp://localhost:5672',
                'rabbitmq.queue': 'test.queue',
                'rabbitmq.prefetchCount': 10,
                'rabbitmq.maxRetries': 3,
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RabbitMQService>(RabbitMQService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('connect', () => {
    it('should connect to RabbitMQ and create channel', async () => {
      await service.connect();

      expect(connect).toHaveBeenCalledWith('amqp://localhost:5672');
      expect(mockConnection.createChannel).toHaveBeenCalled();
      expect(mockChannel.prefetch).toHaveBeenCalledWith(10);
    });

    it('should handle connection errors', async () => {
      (connect as jest.Mock).mockRejectedValueOnce(new Error('Connection failed'));

      await expect(service.connect()).rejects.toThrow('Connection failed');
    });
  });

  describe('assertQueue', () => {
    beforeEach(async () => {
      await service.connect();
    });

    it('should create queue with DLQ', async () => {
      mockChannel.assertQueue.mockResolvedValue({ queue: 'test.queue' } as any);

      await service.assertQueue('test.queue');

      // Should create DLX
      expect(mockChannel.assertExchange).toHaveBeenCalledWith('test.queue.dlx', 'direct', {
        durable: true,
      });

      // Should create DLQ
      expect(mockChannel.assertQueue).toHaveBeenCalledWith('test.queue.dlq', { durable: true });

      // Should bind DLQ to DLX
      expect(mockChannel.bindQueue).toHaveBeenCalledWith(
        'test.queue.dlq',
        'test.queue.dlx',
        'test.queue',
      );

      // Should create main queue with DLX config
      expect(mockChannel.assertQueue).toHaveBeenCalledWith('test.queue', {
        durable: true,
        deadLetterExchange: 'test.queue.dlx',
        deadLetterRoutingKey: 'test.queue',
      });
    });

    it('should merge custom options with defaults', async () => {
      await service.assertQueue('test.queue', { messageTtl: 60000 });

      expect(mockChannel.assertQueue).toHaveBeenCalledWith(
        'test.queue',
        expect.objectContaining({
          durable: true,
          messageTtl: 60000,
          deadLetterExchange: 'test.queue.dlx',
        }),
      );
    });
  });

  describe('publishToQueue', () => {
    beforeEach(async () => {
      await service.connect();
      mockChannel.assertQueue.mockResolvedValue({ queue: 'test.queue' } as any);
      mockChannel.sendToQueue.mockReturnValue(true);
    });

    it('should publish message to queue', async () => {
      const message = { predictionId: '123', userId: '456' };

      const result = await service.publishToQueue('test.queue', message);

      expect(mockChannel.assertQueue).toHaveBeenCalledWith('test.queue', expect.any(Object));
      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        'test.queue',
        Buffer.from(JSON.stringify(message)),
        { persistent: true },
      );
      expect(result).toBe(true);
    });

    it('should return false if send fails', async () => {
      mockChannel.sendToQueue.mockReturnValue(false);

      const result = await service.publishToQueue('test.queue', { test: 'data' });

      expect(result).toBe(false);
    });

    it('should handle publish errors', async () => {
      mockChannel.sendToQueue.mockImplementation(() => {
        throw new Error('Send failed');
      });

      await expect(service.publishToQueue('test.queue', { test: 'data' })).rejects.toThrow(
        'Send failed',
      );
    });
  });

  describe('consume', () => {
    beforeEach(async () => {
      await service.connect();
      mockChannel.assertQueue.mockResolvedValue({ queue: 'test.queue' } as any);
    });

    it('should setup consumer with handler', async () => {
      const handler = jest.fn();
      mockChannel.consume.mockResolvedValue({ consumerTag: 'tag-123' } as any);

      await service.consume('test.queue', handler);

      expect(mockChannel.assertQueue).toHaveBeenCalledWith('test.queue', expect.any(Object));
      expect(mockChannel.consume).toHaveBeenCalledWith(
        'test.queue',
        expect.any(Function),
        expect.objectContaining({ noAck: false }),
      );
    });

    it('should process message and ack on success', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      let consumeCallback: any;

      mockChannel.consume.mockImplementation(async (_queue, callback) => {
        consumeCallback = callback;
        return { consumerTag: 'tag-123' } as any;
      });

      await service.consume('test.queue', handler);

      const mockMessage = {
        content: Buffer.from(JSON.stringify({ data: 'test' })),
        properties: { headers: {} },
      };

      await consumeCallback(mockMessage);

      expect(handler).toHaveBeenCalledWith({ data: 'test' });
      expect(mockChannel.ack).toHaveBeenCalledWith(mockMessage);
    });

    it('should retry message on handler error (attempt 1)', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Processing failed'));
      let consumeCallback: any;

      mockChannel.consume.mockImplementation(async (_queue, callback) => {
        consumeCallback = callback;
        return { consumerTag: 'tag-123' } as any;
      });

      await service.consume('test.queue', handler);

      const mockMessage = {
        content: Buffer.from(JSON.stringify({ data: 'test' })),
        properties: { headers: {} },
      };

      await consumeCallback(mockMessage);

      expect(handler).toHaveBeenCalled();
      expect(mockChannel.publish).toHaveBeenCalledWith(
        '',
        'test.queue',
        mockMessage.content,
        expect.objectContaining({
          headers: {
            'x-retry-count': 1,
            'x-last-error': 'Processing failed',
          },
        }),
      );
      expect(mockChannel.ack).toHaveBeenCalledWith(mockMessage);
    });

    it('should send to DLQ after max retries', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Processing failed'));
      let consumeCallback: any;

      mockChannel.consume.mockImplementation(async (_queue, callback) => {
        consumeCallback = callback;
        return { consumerTag: 'tag-123' } as any;
      });

      await service.consume('test.queue', handler);

      const mockMessage = {
        content: Buffer.from(JSON.stringify({ data: 'test' })),
        properties: { headers: { 'x-retry-count': 3 } },
      };

      await consumeCallback(mockMessage);

      expect(handler).toHaveBeenCalled();
      expect(mockChannel.nack).toHaveBeenCalledWith(mockMessage, false, false);
      expect(mockChannel.publish).not.toHaveBeenCalled();
    });

    it('should handle null message', async () => {
      const handler = jest.fn();
      let consumeCallback: any;

      mockChannel.consume.mockImplementation(async (_queue, callback) => {
        consumeCallback = callback;
        return { consumerTag: 'tag-123' } as any;
      });

      await service.consume('test.queue', handler);

      await consumeCallback(null);

      expect(handler).not.toHaveBeenCalled();
      expect(mockChannel.ack).not.toHaveBeenCalled();
    });
  });

  describe('getQueueMessageCount', () => {
    beforeEach(async () => {
      await service.connect();
    });

    it('should return message count from queue', async () => {
      mockChannel.checkQueue.mockResolvedValue({ messageCount: 150 } as any);

      const count = await service.getQueueMessageCount('test.queue');

      expect(count).toBe(150);
      expect(mockChannel.checkQueue).toHaveBeenCalledWith('test.queue');
    });

    it('should return 0 on error', async () => {
      mockChannel.checkQueue.mockRejectedValue(new Error('Queue not found'));

      const count = await service.getQueueMessageCount('test.queue');

      expect(count).toBe(0);
    });
  });

  describe('purgeQueue', () => {
    beforeEach(async () => {
      await service.connect();
    });

    it('should purge all messages from queue', async () => {
      mockChannel.purgeQueue.mockResolvedValue({ messageCount: 100 } as any);

      await service.purgeQueue('test.queue');

      expect(mockChannel.purgeQueue).toHaveBeenCalledWith('test.queue');
    });

    it('should handle purge errors', async () => {
      mockChannel.purgeQueue.mockRejectedValue(new Error('Purge failed'));

      await expect(service.purgeQueue('test.queue')).rejects.toThrow('Purge failed');
    });
  });

  describe('disconnect', () => {
    it('should close channel and connection', async () => {
      await service.connect();
      await service.disconnect();

      expect(mockChannel.close).toHaveBeenCalled();
      expect(mockConnection.close).toHaveBeenCalled();
    });

    it('should handle disconnect errors gracefully', async () => {
      await service.connect();
      mockChannel.close.mockRejectedValue(new Error('Close failed'));

      // Should not throw
      await expect(service.disconnect()).resolves.not.toThrow();
    });
  });

  describe('getChannel', () => {
    it('should return channel when connected', async () => {
      await service.connect();

      const channel = service.getChannel();

      expect(channel).toBe(mockChannel);
    });

    it('should throw error when not connected', () => {
      expect(() => service.getChannel()).toThrow('RabbitMQ channel not initialized');
    });
  });
});
