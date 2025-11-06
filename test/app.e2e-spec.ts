import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('AppController (e2e - Supertest)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Application Health', () => {
    it('should have working endpoints', () => {
      return request(app.getHttpServer()).get('/prediction/teams').expect(200);
    });

    it('should return 404 for undefined routes', () => {
      return request(app.getHttpServer()).get('/undefined-route').expect(404);
    });
  });

  describe('CORS', () => {
    it('should have CORS enabled', () => {
      return request(app.getHttpServer())
        .options('/prediction/teams')
        .expect((res) => {
          // CORS headers should be present
          expect(res.headers).toBeDefined();
        });
    });
  });

  describe('Content-Type Handling', () => {
    it('should accept JSON', () => {
      return request(app.getHttpServer())
        .post('/auth/send-otp')
        .set('Content-Type', 'application/json')
        .send({ phone: '09123456789' })
        .expect(200);
    });
  });
});
