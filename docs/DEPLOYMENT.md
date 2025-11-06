# Deployment Guide

Production deployment guide for the World Cup Prediction System.

## Prerequisites

- Docker & Docker Compose
- 2GB RAM minimum, 4GB recommended
- PostgreSQL, Redis, RabbitMQ (via Docker)
- Domain with SSL certificate (optional)

## Quick Deploy

```bash
# 1. Configure environment
cp .env.example .env
nano .env  # Update production values

# 2. Start services
docker-compose up -d

# 3. Run migrations
docker-compose --profile migration up migration

# 4. Seed teams
docker-compose --profile seed up seed

# 5. Verify
curl http://localhost:3000/prediction/teams
```

## Environment Configuration

### Required Production Settings

```bash
NODE_ENV=production
PORT=3000

# Strong passwords!
DATABASE_PASSWORD=your_strong_password
REDIS_PASSWORD=your_redis_password

# SMS (disable sandbox)
SMS_SANDBOX=false
SMS_API_KEY=your_sms_ir_api_key

# Security
OTP_EXPIRY_SECONDS=120
MAX_OTP_VERIFY_ATTEMPTS=5
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_SECONDS=2592000
```

### Scaling Configuration

```bash
# Database
DATABASE_POOL_SIZE=30  # For multiple workers

# RabbitMQ
RABBITMQ_PREFETCH_COUNT=10  # Tune based on load

# Processing
PREDICTION_BATCH_SIZE=1000
```

## SSL/HTTPS Setup

### Nginx Configuration

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Secure metrics endpoint (internal only)
    location /metrics {
        allow 10.0.0.0/8;
        deny all;
        proxy_pass http://localhost:3000/metrics;
    }
}
```

## Scaling Workers

```bash
# Scale to 5 workers
docker-compose up -d --scale worker=5

# Scale to 10 workers (for high load)
docker-compose up -d --scale worker=10
```

## Monitoring

### Health Checks

```bash
# Application health
curl https://your-domain.com/prediction/teams

# RabbitMQ
open http://localhost:15672  # guest/guest

# Check all services
docker-compose ps
```

### Logs

```bash
# Application logs
docker-compose logs -f app

# Worker logs
docker-compose logs -f worker

# All services
docker-compose logs -f
```

## Backup

### Database Backup

```bash
# Backup
docker-compose exec postgres pg_dump -U postgres worldcup_predictions > backup_$(date +%Y%m%d).sql

# Restore
docker-compose exec -T postgres psql -U postgres worldcup_predictions < backup_20250101.sql
```

### Redis Backup

```bash
# Save and copy
docker-compose exec redis redis-cli SAVE
docker cp worldcup-redis:/data/dump.rdb ./redis-backup-$(date +%Y%m%d).rdb
```

## Troubleshooting

### High Memory Usage

```bash
# Check resource usage
docker stats

# Restart services
docker-compose restart
```

### Database Connection Issues

```bash
# Increase connection pool
DATABASE_POOL_SIZE=40 docker-compose up -d app worker
```

### Worker Not Processing

```bash
# Check RabbitMQ
docker-compose logs rabbitmq

# Restart workers
docker-compose restart worker
```

## Zero-Downtime Updates

```bash
# Build new image
docker-compose build

# Rolling update
docker-compose up -d --no-deps --build app
docker-compose up -d --no-deps --build worker
```

## Cloud Deployment

### AWS
- ECS/EKS for containers
- RDS for PostgreSQL
- ElastiCache for Redis
- Amazon MQ for RabbitMQ

### Docker
- Azure Container Instances
- Azure Database for PostgreSQL
- Azure Cache for Redis

### Google Cloud
- GKE for Kubernetes
- Cloud SQL for PostgreSQL
- Memorystore for Redis

## Security Checklist

- [ ] Change all default passwords
- [ ] Enable SSL/TLS
- [ ] Configure firewall rules
- [ ] Set proper CORS origins
- [ ] Use environment variables for secrets
- [ ] Enable SMS production mode
- [ ] Secure /metrics endpoint
- [ ] Set up automated backups
- [ ] Configure log rotation
- [ ] Set up monitoring alerts

---

For detailed operations guide, see [OPERATIONS.md](OPERATIONS.md)
