# API Reference

Complete API documentation for the World Cup Prediction System.

**Base URL**: `http://localhost:3000`  
**Interactive Docs**: http://localhost:3000/api/docs

## Authentication

All protected endpoints require Bearer token:
```
Authorization: Bearer YOUR_ACCESS_TOKEN
```

### Send OTP

Send OTP code to phone number.

```http
POST /auth/send-otp
Content-Type: application/json

{
  "phone": "09123456789"
}
```

**Response**: `200 OK`
```json
{
  "message": "OTP_SENT_SUCCESSFULLY"
}
```

**Errors**: `400` Invalid phone | `429` Rate limited (1 per 2 minutes)

### Verify OTP

Verify OTP and create session.

```http
POST /auth/verify-otp
Content-Type: application/json

{
  "phone": "09123456789",
  "code": "123456"
}
```

**Response**: `200 OK`
```json
{
  "message": "OTP_VERIFIED_SUCCESSFULLY",
  "accessToken": "your-token",
  "refreshToken": "your-refresh-token",
  "session": {
    "id": "uuid",
    "userId": "uuid",
    "expiresAt": "2025-12-01T00:00:00.000Z"
  }
}
```

**Errors**: `400` Invalid OTP | `429` Too many attempts (5 per minute)

### Refresh Token

Refresh expired access token.

```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "your-refresh-token"
}
```

**Response**: `200 OK` with new `accessToken`

### Get Sessions

List active sessions.

```http
GET /auth/sessions
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Response**: Array of sessions with device info, IP, timestamps

### Delete Session

Logout from specific device.

```http
DELETE /auth/sessions/:sessionId
Authorization: Bearer YOUR_ACCESS_TOKEN
```

### Delete All Sessions

Logout from all devices.

```http
DELETE /auth/sessions
Authorization: Bearer YOUR_ACCESS_TOKEN
```

## Predictions

### Get Teams

Get all 48 World Cup teams (no auth required).

```http
GET /prediction/teams
```

**Response**: Array of 48 teams with `id`, `faName`, `engName`, `group`, `flag`

### Create Prediction

Submit prediction (requires auth).

```http
POST /prediction
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "predict": {
    "groups": {
      "A": ["uuid1", "uuid2", "uuid3", "uuid4"],
      "B": ["uuid5", "uuid6", "uuid7", "uuid8"],
      ...
    }
  }
}
```

**Requirements**:
- All 12 groups (A-L)
- Exactly 4 teams per group
- All 48 teams included
- Valid team UUIDs

**Response**: `201 Created` with `predictionId`

### Get Results

Get your prediction results (requires auth).

```http
GET /prediction/result
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Response**: Your score, breakdown by scoring mode, processed timestamp

### Get Leaderboard

View top predictions (no auth required).

```http
GET /prediction/leaderboard?limit=10
```

**Response**: Ranked users by score

### Trigger Processing (Admin)

Queue predictions for processing.

```http
POST /prediction/admin/trigger-prediction-process
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Response**: Number of predictions queued

## Scoring Modes

| Mode | Condition | Points |
|------|-----------|--------|
| 1 | All 48 teams correct | 100 |
| 2 | Only 2 teams wrong | 80 |
| 3 | Only 3 teams wrong | 60 |
| 4 | Iran's group correct | 50 |
| 5 | One complete group | 40 |
| 6 | 3 teams from one group | 20 |

**Note**: Priority-based scoring (highest matching mode only)

## Error Codes

| Code | Meaning |
|------|---------|
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Missing/invalid token |
| 404 | Not Found |
| 429 | Too Many Requests - Rate limited |
| 500 | Internal Server Error |

### Common Error Messages

**Auth Errors**:
- `EXCEEDED_SEND_LIMIT` - Too many OTP requests
- `OTP_EXPIRED` - OTP expired (120s TTL)
- `INVALID_OTP_CODE` - Wrong OTP
- `EXCEEDED_VERIFICATION_ATTEMPTS` - Too many tries
- `INVALID_OR_EXPIRED_TOKEN` - Session expired

**Prediction Errors**:
- `INVALID_PREDICTION_FORMAT` - Missing groups or teams
- `DUPLICATE_TEAMS` - Team appears multiple times
- `INVALID_TEAM_UUID` - Team doesn't exist

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| `/auth/send-otp` | 1 per phone per 120s |
| `/auth/verify-otp` | 5 attempts per 60s |
| General API | 100 req/min per IP |

---

For interactive testing, visit: http://localhost:3000/api/docs
