# Operations Guide

Operational guide for running and scaling the World Cup Prediction System.

## Architecture

### Components

- **API Server** - Handles HTTP requests, queues jobs
- **Workers** (3+ replicas) - Process predictions from RabbitMQ queue
- **PostgreSQL** - Stores predictions and results
- **Redis** - Caching and rate limiting
- **RabbitMQ** - Async job queue

### Processing Flow

```
API Request → Queue to RabbitMQ → Return immediately
                  ↓
            Workers (parallel)
                  ↓
           Process & Score
                  ↓
        Save to PostgreSQL
```

## Configuration

### Worker Scaling

Scale based on queue depth:

```bash
# 3 workers (default) - 50K predictions in ~17 minutes
docker-compose up -d

# 5 workers - 50K predictions in ~10 minutes
docker-compose up -d --scale worker=5

# 10 workers - 500K predictions in ~2 hours
docker-compose up -d --scale worker=10

# 20 workers - 5M predictions in ~4 hours
docker-compose up -d --scale worker=20
```

### Performance Tuning

**Prefetch Count** - Messages per worker:

| Workload | Prefetch | Reason |
|----------|----------|---------|
| DB-heavy | 10-20 | Prevent DB overload |
| CPU-bound | 50-100 | Maximize CPU usage |
| Mixed | 20-30 | Balanced (recommended) |
| Low memory | 5-10 | Reduce memory usage |

Set via:
```bash
RABBITMQ_PREFETCH_COUNT=20 docker-compose up -d worker
```

**Batch Size** - Predictions per batch:
```bash
PREDICTION_BATCH_SIZE=1000  # Default (recommended)
PREDICTION_BATCH_SIZE=500   # Lower memory
PREDICTION_BATCH_SIZE=2000  # Higher throughput
```

**Database Pool**:
```bash
DATABASE_POOL_SIZE=20  # Default
DATABASE_POOL_SIZE=30  # For 5-10 workers
DATABASE_POOL_SIZE=50  # For 20+ workers
```

## Monitoring

### RabbitMQ Management

Access: http://localhost:15672 (guest/guest)

Monitor:
- Queue depth
- Message rate
- Consumer count
- Memory usage

### Processing Status

```bash
# Get authentication token
TOKEN=$(curl -X POST http://localhost:3000/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "09123456789"}' | jq -r '.accessToken')

# Check status
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/prediction/admin/processing-status
```

**Response**:
```json
{
  "total": 50000,
  "processed": 12500,
  "pending": 37500,
  "queueDepth": 35000
}
```

### Redis Stats

```bash
redis-cli
> GET prediction:stats:total
> GET prediction:stats:processed
> KEYS prediction:*
```

### Database Queries

```sql
-- Unprocessed predictions
SELECT COUNT(*) 
FROM predictions p
LEFT JOIN results r ON r.prediction_id = p.id
WHERE r.id IS NULL;

-- Top scores
SELECT user_id, total_score, processed_at 
FROM results 
ORDER BY total_score DESC 
LIMIT 10;
```

## Troubleshooting

### Workers Not Processing

**Check RabbitMQ connection**:
```bash
docker-compose logs rabbitmq | grep "connection"
docker-compose logs worker | grep "Error"
```

**Restart workers**:
```bash
docker-compose restart worker
```

### Slow Processing

**Scale up workers**:
```bash
docker-compose up -d --scale worker=10
```

**Increase prefetch count**:
```bash
RABBITMQ_PREFETCH_COUNT=30 docker-compose up -d worker
```

**Check database indexes**:
```sql
SELECT * FROM pg_indexes 
WHERE tablename IN ('predictions', 'results', 'teams');
```

### Database Connection Pool Exhausted

**Increase pool size**:
```bash
DATABASE_POOL_SIZE=40 docker-compose restart app worker
```

**Check active connections**:
```sql
SELECT count(*) 
FROM pg_stat_activity 
WHERE datname = 'worldcup_predictions';
```

### Dead Letter Queue (DLQ) Has Messages

**Inspect failed messages**:
1. Open http://localhost:15672/#/queues/%2F/prediction.process.dlq
2. Check message count
3. View message content
4. Fix underlying issue
5. Reprocess or purge

**Common DLQ causes**:
- Invalid prediction data
- Database constraint violations
- Timeout errors

## Disaster Recovery

### RabbitMQ Data Loss

```bash
# Retrigger processing (queues unprocessed predictions)
curl -X POST -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/prediction/admin/trigger-prediction-process
```

### Worker Crash

RabbitMQ automatically requeues unacknowledged messages. Just restart workers:
```bash
docker-compose up -d worker
```

### Complete System Failure

```bash
# 1. Stop all
docker-compose down

# 2. Start infrastructure
docker-compose up -d postgres redis rabbitmq

# 3. Wait for health (30-60s)
sleep 60

# 4. Start application
docker-compose up -d app worker
```

## Performance Metrics

### Expected Throughput (3 Workers)

- **50K predictions**: ~17 minutes
- **500K predictions**: ~2.5 hours (with 10 workers)
- **5M predictions**: ~4 hours (with 20 workers)

### Target Performance

- Queue time: <2 seconds for 50K
- Processing rate: ~1000 predictions/min per worker
- Error rate: <0.1%

## Rollback to Sync Mode

If async processing fails:

```bash
# Disable async
ENABLE_ASYNC_PROCESSING=false docker-compose up -d app

# Stop workers
docker-compose stop worker
```

**Note**: Sync mode only suitable for <10K predictions

## Maintenance

### Daily Tasks
- Monitor queue depth
- Check error logs
- Verify processing status

### Weekly Tasks
- Review dead letter queue
- Backup database
- Check disk space

### Monthly Tasks
- Performance review
- Update dependencies
- Security patches

---

For deployment details, see [DEPLOYMENT.md](DEPLOYMENT.md)

