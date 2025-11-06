# Getting Started

Quick setup guide for the World Cup Prediction System.

## Prerequisites

- Docker & Docker Compose
- Node.js 18+
- npm or yarn

## Installation

### Option 1: Docker (Recommended)

Complete setup with Docker:

```bash
# 1. Clone repository
git clone <repository-url>
cd 11Media

# 2. Start all services
docker-compose up -d

# 3. Run migrations
docker-compose --profile migration up migration

# 4. Seed teams data
docker-compose --profile seed up seed

# 5. Verify
curl http://localhost:3000/prediction/teams
```

### Option 2: Local Development

Run app locally with infrastructure in Docker:

```bash
# 1. Start infrastructure only
docker-compose -f docker-compose.infra.yml up -d

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your settings

# 4. Run migrations & seed
npm run migration:run
npm run seed

# 5. Start app
npm run start:dev
```

## Using the API

### 1. Get Teams

```bash
curl http://localhost:3000/prediction/teams
```

Returns 48 teams across 12 groups (A-L).

### 2. Authentication Flow

**Send OTP:**
```bash
curl -X POST http://localhost:3000/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "09123456789"}'
```

**Check logs for OTP** (development mode):
```bash
docker-compose logs app | grep "OTP Code"
```

**Verify OTP:**
```bash
curl -X POST http://localhost:3000/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "09123456789", "code": "YOUR_OTP"}'
```

Response includes `accessToken` and `refreshToken`.

### 3. Submit Prediction

```bash
curl -X POST http://localhost:3000/prediction \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "predict": {
      "groups": {
        "A": ["team-id-1", "team-id-2", "team-id-3", "team-id-4"],
        "B": ["team-id-5", "team-id-6", "team-id-7", "team-id-8"],
        ...
      }
    }
  }'
```

### 4. View Results

**Get your result:**
```bash
curl http://localhost:3000/prediction/result \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**View leaderboard:**
```bash
curl http://localhost:3000/prediction/leaderboard?limit=10
```

## Environment Configuration

Create `.env` file with these essential variables:

```bash
# Application
PORT=3000
NODE_ENV=development

# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=worldcup_predictions

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# RabbitMQ
RABBITMQ_URL=amqp://localhost:5672
RABBITMQ_QUEUE=prediction.process

# OTP Settings
OTP_LENGTH=6
OTP_EXPIRY_SECONDS=120
MAX_OTP_VERIFY_ATTEMPTS=5
OTP_SEND_COOLDOWN_SECONDS=120

# Token Settings
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_SECONDS=2592000

# SMS (Sandbox mode for testing)
SMS_SANDBOX=true
```

### Configuration Tuning

**RabbitMQ Prefetch:**
- High I/O: 10-20 (default)
- CPU-bound: 50-100
- Low memory: 5-10

**Prediction Batch Size:**
- Small: 100-500 (lower memory)
- Medium: 1000-2000 (recommended)
- Large: 3000-5000 (higher throughput)

## Running Tests

```bash
# Unit tests
npm test
npm run test:cov

# E2E tests
npm run test:e2e:playwright:infra  # Start infrastructure
SMS_SANDBOX=true npm run start:dev # Start app (separate terminal)
SMS_SANDBOX=true npx playwright test # Run tests
```

## Common Commands

### Docker
```bash
docker-compose up -d         # Start all
docker-compose down          # Stop all
docker-compose logs -f app   # View logs
docker-compose restart app   # Restart app
```

### Database
```bash
npm run migration:run        # Apply migrations
npm run migration:revert     # Rollback
npm run migration:generate   # Create new
npm run seed                 # Seed data
```

### Makefile Shortcuts
```bash
make up                      # Start all services
make down                    # Stop services
make logs                    # View logs
make migration               # Run migrations
make seed                    # Seed data
make test                    # Run tests
make clean                   # Clean everything
```

## Troubleshooting

### Port Already in Use
```bash
# Check what's using the port
lsof -i :3000

# Kill the process
kill -9 <PID>
```

### Database Issues
```bash
# Check PostgreSQL
docker-compose ps postgres
docker-compose logs postgres

# Restart
docker-compose restart postgres
```

### Redis Issues
```bash
# Test connection
docker-compose exec redis redis-cli ping

# Clear cache
docker-compose exec redis redis-cli FLUSHDB
```

### Clean Start
```bash
docker-compose down -v  # Remove volumes
make setup              # Fresh setup
```

## API Documentation

- **Swagger UI**: http://localhost:3000/api/docs
- **Prometheus Metrics**: http://localhost:3000/metrics
- **Full API Reference**: [docs/API.md](docs/API.md)

## Next Steps

1. **Explore API**: Visit Swagger UI for interactive docs
2. **Configure SMS**: Set up sms.ir API for production
3. **Deploy**: Follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
4. **Scale**: Configure workers and queues per [docs/RABBITMQ_SCALABILITY.md](docs/RABBITMQ_SCALABILITY.md)

## Need Help?

- Check [README.md](README.md) for overview
- Review [docs/](docs/) for detailed guides
- Check test files for usage examples

---

**Status**: Production Ready | **Tests**: 164/164 Passing | **Version**: 1.0.0
