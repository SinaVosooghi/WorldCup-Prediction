export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT, 10) || 5432,
    username: process.env.DATABASE_USERNAME || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'postgres',
    database: process.env.DATABASE_NAME || 'worldcup_predictions',
    poolSize: parseInt(process.env.DATABASE_POOL_SIZE, 10) || 20,
    connectionTimeoutMillis: parseInt(process.env.DATABASE_TIMEOUT, 10) || 5000,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD,
    ttl: parseInt(process.env.REDIS_TTL, 10) || 3600,
  },
  rabbitmq: {
    url: process.env.RABBITMQ_URL || 'amqp://localhost:5672',
    queue: process.env.RABBITMQ_QUEUE || 'prediction.process',
    prefetchCount: parseInt(process.env.RABBITMQ_PREFETCH_COUNT, 10) || 10,
    maxRetries: parseInt(process.env.RABBITMQ_MAX_RETRIES, 10) || 3,
  },
  prediction: {
    batchSize: Math.min(Math.max(parseInt(process.env.PREDICTION_BATCH_SIZE, 10) || 1000, 1), 5000), // Min: 1, Max: 5000, Default: 1000
    enableAsyncProcessing: process.env.ENABLE_ASYNC_PROCESSING !== 'false', // Default: true
  },
  sms: {
    apiKey: process.env.SMS_API_KEY,
    sandbox: process.env.SMS_SANDBOX === 'true',
  },
  rateLimit: {
    windowSeconds: parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS, 10) || 60,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  },
  auth: {
    otp: {
      length: parseInt(process.env.OTP_LENGTH, 10) || 6,
      expirySeconds: parseInt(process.env.OTP_EXPIRY_SECONDS, 10) || 120,
      maxVerifyAttempts: parseInt(process.env.MAX_OTP_VERIFY_ATTEMPTS, 10) || 5,
      sendCooldownSeconds: parseInt(process.env.OTP_SEND_COOLDOWN_SECONDS, 10) || 120,
    },
    session: {
      bcryptRounds: parseInt(process.env.SESSION_BCRYPT_ROUNDS, 10) || 12,
      tokenLength: parseInt(process.env.SESSION_TOKEN_LENGTH, 10) || 32, // bytes for crypto.randomBytes
      accessTokenTtlSeconds: parseInt(process.env.ACCESS_TOKEN_TTL_SECONDS, 10) || 900, // 15 minutes
      refreshTokenTtlSeconds: parseInt(process.env.REFRESH_TOKEN_TTL_SECONDS, 10) || 2592000, // 30 days
      ttlSeconds: parseInt(process.env.SESSION_TTL_SECONDS, 10) || 2592000, // 30 days default (legacy)
      cachePrefix: 'session:token:',
      refreshCachePrefix: 'session:refresh:',
      cleanupCronSchedule: process.env.SESSION_CLEANUP_CRON || '0 2 * * *', // Daily at 2 AM
    },
    rateLimit: {
      verifyWindowSeconds: parseInt(process.env.RATE_LIMIT_VERIFY_WINDOW, 10) || 60,
    },
    security: {
      enableIpValidation: process.env.ENABLE_IP_VALIDATION === 'true',
      enableUserAgentValidation: process.env.ENABLE_USER_AGENT_VALIDATION === 'true',
    },
  },
});
