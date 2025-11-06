# World Cup 2026 Prediction System

Enterprise-grade NestJS backend for World Cup predictions with OTP authentication and intelligent scoring.

## Features

- **OTP Authentication** - Phone-based login with rate limiting and session management
- **Prediction System** - 48 teams across 12 groups with 6 scoring modes
- **Scalability** - RabbitMQ queues, Redis caching, batch processing
- **Monitoring** - Prometheus metrics and audit logging
- **Production Ready** - Comprehensive E2E tests, Docker support, clean architecture

## Tech Stack

- **Backend**: NestJS + TypeScript + TypeORM
- **Database**: PostgreSQL
- **Cache**: Redis
- **Queue**: RabbitMQ
- **Testing**: Jest + Playwright
- **Deployment**: Docker + Docker Compose

## Quick Start

```bash
# Start infrastructure
docker-compose up -d

# Run migrations
npm run migration:run

# Seed teams data
npm run seed

# Start application
npm run start:dev
```

**Access Points:**
- API: http://localhost:3000
- Swagger Docs: http://localhost:3000/api/docs
- Metrics: http://localhost:3000/metrics

## API Endpoints

### Authentication
- `POST /auth/send-otp` - Send OTP code
- `POST /auth/verify-otp` - Verify OTP and get token
- `POST /auth/refresh` - Refresh access token
- `GET /auth/sessions` - List active sessions
- `DELETE /auth/sessions/:id` - Delete session

### Predictions
- `GET /prediction/teams` - Get 48 teams
- `POST /prediction` - Submit prediction
- `GET /prediction/result` - Get user result
- `GET /prediction/leaderboard` - View rankings

## Scoring Modes

| Mode | Condition | Points |
|------|-----------|--------|
| 1 | All 48 teams correct | 100 |
| 2 | Only 2 teams wrong | 80 |
| 3 | Only 3 teams wrong | 60 |
| 4 | Iran's group correct | 50 |
| 5 | One complete group | 40 |
| 6 | 3 teams from one group | 20 |

## Project Structure

```
11Media/
├── src/
│   ├── auth/           # OTP authentication
│   ├── prediction/     # Scoring & processing
│   ├── common/         # Guards, pipes, filters
│   ├── config/         # Configuration
│   └── database/       # Migrations & seeds
├── test/               # Unit & E2E tests
├── docs/               # Additional documentation
└── docker-compose.yml  # Docker setup
```

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run start:dev

# Run tests
npm test                    # Unit tests
npm run test:e2e           # E2E tests

# Database operations
npm run migration:run      # Run migrations
npm run migration:revert   # Revert migration
npm run seed              # Seed data
```

## Testing

- **Unit Tests**: 134/134 passing
- **E2E Tests**: 175/175 passing (100%)
- **Coverage**: All critical requirements tested

Run E2E tests:
```bash
# Start infrastructure
npm run test:e2e:playwright:infra

# Start app with SMS sandbox
SMS_SANDBOX=true npm run start:dev

# Run tests
SMS_SANDBOX=true npx playwright test
```

## Environment Variables

Key configuration (see [GETTING_STARTED.md](GETTING_STARTED.md) for full reference):

```bash
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=worldcup_predictions

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# RabbitMQ
RABBITMQ_URL=amqp://localhost:5672

# OTP
OTP_LENGTH=6
OTP_EXPIRY_SECONDS=120
MAX_OTP_VERIFY_ATTEMPTS=5

# Tokens
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_SECONDS=2592000
```

## Documentation

- **[Getting Started Guide](GETTING_STARTED.md)** - Setup and configuration
- **[API Documentation](docs/API.md)** - Complete API reference
- **[Deployment Guide](docs/DEPLOYMENT.md)** - Production deployment

## Architecture Highlights

**Authentication:**
- Bcrypt-hashed tokens (not JWT)
- Session management with multi-device support
- Rate limiting: 1 OTP per 2 minutes, 5 verify attempts per minute
- O(1) session validation via Redis

**Prediction Processing:**
- Async processing via RabbitMQ
- Batch processing: 1000 predictions per worker
- Priority-based scoring algorithm
- Redis caching for team data

**Performance:**
- Auth operations: <300ms
- Read operations: <500ms
- Scalable to 5M+ predictions

## License

Private project - All rights reserved

