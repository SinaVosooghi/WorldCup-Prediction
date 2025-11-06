import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('PredictionController (e2e - Supertest)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/prediction/teams (GET)', () => {
    it('should return all 48 teams', () => {
      return request(app.getHttpServer())
        .get('/prediction/teams')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('teams');
          expect(Array.isArray(res.body.teams)).toBe(true);
          expect(res.body.teams).toHaveLength(48);
        });
    });

    it('should return teams with correct structure', () => {
      return request(app.getHttpServer())
        .get('/prediction/teams')
        .expect(200)
        .expect((res) => {
          const team = res.body.teams[0];
          expect(team).toHaveProperty('id');
          expect(team).toHaveProperty('faName');
          expect(team).toHaveProperty('engName');
          expect(team).toHaveProperty('order');
          expect(team).toHaveProperty('group');
          expect(team).toHaveProperty('flag');
        });
    });

    it('should have 12 groups (A-L)', () => {
      return request(app.getHttpServer())
        .get('/prediction/teams')
        .expect(200)
        .expect((res) => {
          const groups = new Set(res.body.teams.map((team) => team.group));
          expect(groups.size).toBe(12);

          const expectedGroups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
          expectedGroups.forEach((group) => {
            expect(groups.has(group)).toBe(true);
          });
        });
    });

    it('should have exactly 4 teams per group', () => {
      return request(app.getHttpServer())
        .get('/prediction/teams')
        .expect(200)
        .expect((res) => {
          const groupCounts = res.body.teams.reduce((acc, team) => {
            acc[team.group] = (acc[team.group] || 0) + 1;
            return acc;
          }, {});

          Object.values(groupCounts).forEach((count) => {
            expect(count).toBe(4);
          });
        });
    });

    it('should include Iran in group E', () => {
      return request(app.getHttpServer())
        .get('/prediction/teams')
        .expect(200)
        .expect((res) => {
          const iranTeam = res.body.teams.find((team) => team.engName === 'Iran');
          expect(iranTeam).toBeDefined();
          expect(iranTeam.group).toBe('E');
          expect(iranTeam.faName).toBe('ایران');
          expect(iranTeam.flag).toBe('🇮🇷');
        });
    });

    it('should include host countries in group A', () => {
      return request(app.getHttpServer())
        .get('/prediction/teams')
        .expect(200)
        .expect((res) => {
          const groupATeams = res.body.teams.filter((team) => team.group === 'A');
          const teamNames = groupATeams.map((t) => t.engName);

          // Host countries (USA, Mexico, Canada) should be in group A
          expect(teamNames).toContain('United States');
          expect(teamNames).toContain('Mexico');
          expect(teamNames).toContain('Canada');
        });
    });
  });

  describe('/prediction (POST)', () => {
    it('should require authentication', () => {
      return request(app.getHttpServer())
        .post('/prediction')
        .send({
          predict: {
            groups: {
              A: ['team-1', 'team-2', 'team-3', 'team-4'],
            },
          },
        })
        .expect(401);
    });

    it('should validate prediction structure', () => {
      return request(app.getHttpServer())
        .post('/prediction')
        .set('Authorization', 'Bearer test-token')
        .send({ predict: 'invalid' })
        .expect((res) => {
          expect([400, 401]).toContain(res.status);
        });
    });
  });

  describe('/prediction/result (GET)', () => {
    it('should require authentication', () => {
      return request(app.getHttpServer()).get('/prediction/result').expect(401);
    });
  });

  describe('/prediction/leaderboard (GET)', () => {
    it('should return leaderboard without authentication', () => {
      return request(app.getHttpServer())
        .get('/prediction/leaderboard')
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('leaderboard');
          expect(Array.isArray(res.body.leaderboard)).toBe(true);
        });
    });

    it('should respect limit parameter', () => {
      const limit = 5;
      return request(app.getHttpServer())
        .get(`/prediction/leaderboard?limit=${limit}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.leaderboard.length).toBeLessThanOrEqual(limit);
        });
    });

    it('should use default limit when not specified', () => {
      return request(app.getHttpServer())
        .get('/prediction/leaderboard')
        .expect(200)
        .expect((res) => {
          expect(res.body.leaderboard.length).toBeLessThanOrEqual(10);
        });
    });

    it('should return entries with correct structure', () => {
      return request(app.getHttpServer())
        .get('/prediction/leaderboard?limit=1')
        .expect(200)
        .expect((res) => {
          if (res.body.leaderboard.length > 0) {
            const entry = res.body.leaderboard[0];
            expect(entry).toHaveProperty('rank');
            expect(entry).toHaveProperty('userId');
            expect(entry).toHaveProperty('totalScore');
            expect(entry).toHaveProperty('processedAt');
            expect(entry.rank).toBe(1);
          }
        });
    });

    it('should order by score descending', () => {
      return request(app.getHttpServer())
        .get('/prediction/leaderboard?limit=10')
        .expect(200)
        .expect((res) => {
          const leaderboard = res.body.leaderboard;
          if (leaderboard.length > 1) {
            for (let i = 0; i < leaderboard.length - 1; i++) {
              expect(leaderboard[i].totalScore).toBeGreaterThanOrEqual(
                leaderboard[i + 1].totalScore,
              );
            }
          }
        });
    });
  });

  describe('/prediction/admin/trigger-prediction-process (POST)', () => {
    it('should trigger prediction processing', () => {
      return request(app.getHttpServer())
        .post('/prediction/admin/trigger-prediction-process')
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toBe('PREDICTION_PROCESSING_STARTED');
        });
    });

    // Note: In production, this should require admin authentication
    it('should be accessible (admin check to be implemented)', () => {
      return request(app.getHttpServer())
        .post('/prediction/admin/trigger-prediction-process')
        .expect(200);
    });
  });

  describe('API Response Performance', () => {
    it('should respond to /teams within acceptable time', async () => {
      const start = Date.now();
      await request(app.getHttpServer()).get('/prediction/teams').expect(200);
      const duration = Date.now() - start;

      // Should respond in less than 300ms
      expect(duration).toBeLessThan(300);
    });

    it('should respond to /leaderboard within acceptable time', async () => {
      const start = Date.now();
      await request(app.getHttpServer()).get('/prediction/leaderboard').expect(200);
      const duration = Date.now() - start;

      // Should respond in less than 300ms
      expect(duration).toBeLessThan(300);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent routes', () => {
      return request(app.getHttpServer()).get('/prediction/non-existent').expect(404);
    });

    it('should handle malformed request bodies', () => {
      return request(app.getHttpServer())
        .post('/prediction')
        .set('Content-Type', 'application/json')
        .send('not-valid-json')
        .expect((res) => {
          expect([400, 401]).toContain(res.status);
        });
    });
  });
});
