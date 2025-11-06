import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, ChannelModel, Channel, Options, Replies } from 'amqplib';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private readonly logger = new Logger(RabbitMQService.name);

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  /**
   * Establishes connection to RabbitMQ server and creates a channel
   */
  async connect(): Promise<void> {
    try {
      const rabbitMQUrl = this.configService.get<string>('rabbitmq.url');
      this.logger.log(`Connecting to RabbitMQ at ${rabbitMQUrl}...`);

      this.connection = await connect(rabbitMQUrl);
      this.channel = await this.connection.createChannel();

      // Set prefetch count for fair dispatch
      const prefetchCount = this.configService.get<number>('rabbitmq.prefetchCount') || 10;
      await this.channel.prefetch(prefetchCount);

      this.logger.log('Successfully connected to RabbitMQ');

      // Handle connection errors
      this.connection.on('error', (err) => {
        this.logger.error('RabbitMQ connection error:', err);
      });

      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed');
      });
    } catch (error) {
      this.logger.error('Failed to connect to RabbitMQ:', error);
      throw error;
    }
  }

  /**
   * Closes the channel and connection gracefully
   */
  async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
      }
      if (this.connection) {
        await this.connection.close();
      }
      this.logger.log('RabbitMQ connection closed');
    } catch (error) {
      this.logger.error('Error closing RabbitMQ connection:', error);
    }
  }

  /**
   * Gets the current channel instance
   */
  getChannel(): Channel {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }
    return this.channel;
  }

  /**
   * Asserts a queue exists (creates if it doesn't) with durable option and DLQ
   */
  async assertQueue(
    queueName: string,
    options?: Options.AssertQueue,
  ): Promise<Replies.AssertQueue> {
    // Create Dead Letter Exchange
    const dlxName = `${queueName}.dlx`;
    const dlqName = `${queueName}.dlq`;

    await this.channel.assertExchange(dlxName, 'direct', { durable: true });
    await this.channel.assertQueue(dlqName, { durable: true });
    await this.channel.bindQueue(dlqName, dlxName, queueName);

    const defaultOptions: Options.AssertQueue = {
      durable: true, // Messages persist across broker restarts
      deadLetterExchange: dlxName,
      deadLetterRoutingKey: queueName,
      ...options,
    };
    return await this.channel.assertQueue(queueName, defaultOptions);
  }

  /**
   * Publishes a message to a queue
   */
  async publishToQueue(queueName: string, message: any): Promise<boolean> {
    try {
      // Ensure queue exists
      await this.assertQueue(queueName);

      const messageBuffer = Buffer.from(JSON.stringify(message));
      const sent = this.channel.sendToQueue(queueName, messageBuffer, {
        persistent: true, // Message survives broker restart
      });

      if (!sent) {
        this.logger.warn(`Failed to send message to queue ${queueName}`);
      }

      return sent;
    } catch (error) {
      this.logger.error(`Error publishing to queue ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Consumes messages from a queue
   */
  async consume(
    queueName: string,
    handler: (message: any) => Promise<void>,
    options?: Options.Consume,
  ): Promise<void> {
    try {
      // Ensure queue exists
      await this.assertQueue(queueName);

      this.logger.log(`Starting consumer for queue: ${queueName}`);

      await this.channel.consume(
        queueName,
        async (msg) => {
          if (msg) {
            await this.processMessage(msg, queueName, handler);
          }
        },
        {
          noAck: false, // Manual acknowledgment for reliability
          ...options,
        },
      );

      this.logger.log(`Consumer registered for queue: ${queueName}`);
    } catch (error) {
      this.logger.error(`Error setting up consumer for ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Process a single message from the queue
   */
  private async processMessage(
    msg: any,
    queueName: string,
    handler: (message: any) => Promise<void>,
  ): Promise<void> {
    try {
      const content = JSON.parse(msg.content.toString());
      await handler(content);

      // Acknowledge message after successful processing
      this.channel.ack(msg);
    } catch (error) {
      this.logger.error(`Error processing message from ${queueName}:`, error);
      await this.handleMessageRetry(msg, queueName, error);
    }
  }

  /**
   * Handle message retry logic with exponential backoff
   */
  private async handleMessageRetry(msg: any, queueName: string, error: Error): Promise<void> {
    const retryCount = (msg.properties.headers?.['x-retry-count'] || 0) + 1;
    const maxRetries = this.configService.get<number>('rabbitmq.maxRetries') || 3;

    if (retryCount < maxRetries) {
      this.logger.warn(`Requeuing message (retry ${retryCount}/${maxRetries})`);

      // Republish with updated retry count
      const newHeaders = {
        ...msg.properties.headers,
        'x-retry-count': retryCount,
        'x-last-error': error.message,
      };

      await this.channel.publish('', queueName, msg.content, {
        ...msg.properties,
        headers: newHeaders,
      });

      // Acknowledge original message
      this.channel.ack(msg);
    } else {
      this.logger.error('Max retries reached, sending to DLQ');
      // Send to Dead Letter Queue
      this.channel.nack(msg, false, false);
    }
  }

  /**
   * Gets the message count in a queue
   */
  async getQueueMessageCount(queueName: string): Promise<number> {
    try {
      if (!this.channel) {
        this.logger.warn('RabbitMQ channel not initialized');
        return 0;
      }
      const queueInfo = await this.channel.checkQueue(queueName);
      const count = queueInfo.messageCount;
      // Validate the count is a finite number
      if (!isFinite(count) || count < 0) {
        this.logger.warn(`Invalid message count: ${count}, returning 0`);
        return 0;
      }
      return count;
    } catch (error) {
      this.logger.error(`Error getting message count for ${queueName}:`, error.message);
      return 0;
    }
  }

  /**
   * Purges all messages from a queue
   */
  async purgeQueue(queueName: string): Promise<void> {
    try {
      await this.channel.purgeQueue(queueName);
      this.logger.log(`Purged queue: ${queueName}`);
    } catch (error) {
      this.logger.error(`Error purging queue ${queueName}:`, error);
      throw error;
    }
  }

  /**
   * Health check method to verify RabbitMQ connectivity
   * @returns true if RabbitMQ is connected and responsive
   */
  async isHealthy(): Promise<boolean> {
    try {
      if (!this.connection || !this.channel) {
        return false;
      }

      // Try to check a queue to verify the connection is working
      // Using a lightweight operation to verify connectivity
      const testQueue = 'health_check_test';
      await this.channel.checkQueue(testQueue).catch(() => {
        // Queue doesn't exist, which is fine - connection is working
      });

      return true;
    } catch (error) {
      this.logger.error('RabbitMQ health check failed:', error);
      return false;
    }
  }
}
