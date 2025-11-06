import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { OtpTestHelper } from './helpers/otp-test.helper';

describe('AuthController (e2e - Supertest)', () => {
  let app: INestApplication;
  let otpHelper: OtpTestHelper;

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

    otpHelper = new OtpTestHelper();
  });

  afterAll(async () => {
    await otpHelper.close();
    await app.close();
  });

  describe('/auth/send-otp (POST)', () => {
    it('should send OTP successfully', () => {
      return request(app.getHttpServer())
        .post('/auth/send-otp')
        .send({ phone: '09123456789' })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('message');
          expect(res.body.message).toBe('OTP_SENT_SUCCESSFULLY');
        });
    });

    it('should validate phone number format', () => {
      return request(app.getHttpServer())
        .post('/auth/send-otp')
        .send({ phone: 'invalid-phone' })
        .expect(400);
    });

    it('should require phone number', () => {
      return request(app.getHttpServer()).post('/auth/send-otp').send({}).expect(400);
    });

    it('should rate limit consecutive requests', async () => {
      const phone = `09${Math.floor(Math.random() * 900000000 + 100000000)}`;

      // First request should succeed
      await request(app.getHttpServer()).post('/auth/send-otp').send({ phone }).expect(200);

      // Second request should be rate limited
      await request(app.getHttpServer())
        .post('/auth/send-otp')
        .send({ phone })
        .expect(429)
        .expect((res) => {
          expect(res.body.message).toContain('EXCEEDED_SEND_LIMIT');
        });
    });
  });

  describe('/auth/verify-otp (POST)', () => {
    it('should validate request body', () => {
      return request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ phone: '09123456789', code: '123' }) // Invalid: should be 6 digits
        .expect(400);
    });

    it('should require both phone and code', async () => {
      await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ phone: '09123456789' })
        .expect(400);

      await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ code: '123456' })
        .expect(400);
    });

    it('should reject invalid OTP', () => {
      return request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ phone: '09123456789', code: '999999' })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toMatch(/OTP_NOT_FOUND_OR_EXPIRED|INVALID_OTP_CODE/);
        });
    });

    it('should track verification attempts and rate limit', async () => {
      const phone = `09${Math.floor(Math.random() * 900000000 + 100000000)}`;

      // Try multiple times with wrong code
      for (let i = 0; i < 6; i++) {
        const response = await request(app.getHttpServer())
          .post('/auth/verify-otp')
          .send({ phone, code: '000000' });

        if (i < 5) {
          expect([400, 429]).toContain(response.status);
        } else {
          // 6th attempt should be rate limited
          expect(response.status).toBe(429);
          expect(response.body.message).toContain('EXCEEDED_VERIFICATION_ATTEMPTS');
        }
      }
    });
  });

  describe('/auth/sessions (GET)', () => {
    it('should require authentication', () => {
      return request(app.getHttpServer()).get('/auth/sessions').expect(401);
    });

    it('should reject invalid token', () => {
      return request(app.getHttpServer())
        .get('/auth/sessions')
        .set('Authorization', 'Bearer invalid-token-12345')
        .expect(401);
    });
  });

  describe('/auth/sessions/:sessionId (DELETE)', () => {
    it('should require authentication', () => {
      return request(app.getHttpServer()).delete('/auth/sessions/some-session-id').expect(401);
    });
  });

  describe('/auth/sessions (DELETE)', () => {
    it('should require authentication', () => {
      return request(app.getHttpServer()).delete('/auth/sessions').expect(401);
    });
  });

  describe('Complete Authentication Flow', () => {
    it('should complete full auth flow: send → verify → access → logout', async () => {
      const phone = `09${Math.floor(Math.random() * 900000000 + 100000000)}`;

      // Step 1: Send OTP
      const sendResponse = await request(app.getHttpServer())
        .post('/auth/send-otp')
        .send({ phone })
        .expect(200);

      expect(sendResponse.body.message).toBe('OTP_SENT_SUCCESSFULLY');

      // Step 2: Extract OTP from Redis
      const otpCode = await otpHelper.waitForOtp(phone, 3000);
      expect(otpCode).toBeTruthy();
      expect(otpCode).toMatch(/^\d{6}$/); // 6-digit code

      // Step 3: Verify OTP and get access token
      const verifyResponse = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ phone, code: otpCode })
        .expect(200);

      expect(verifyResponse.body).toHaveProperty('accessToken');
      expect(verifyResponse.body).toHaveProperty('session');
      expect(verifyResponse.body.session).toHaveProperty('userId');

      const token = verifyResponse.body.accessToken;
      const sessionId = verifyResponse.body.session.id;

      // Step 4: Access protected endpoint (get sessions)
      const sessionsResponse = await request(app.getHttpServer())
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(sessionsResponse.body).toHaveProperty('sessions');
      expect(sessionsResponse.body.sessions).toBeInstanceOf(Array);
      expect(sessionsResponse.body.sessions.length).toBeGreaterThan(0);

      // Step 5: Delete specific session
      await request(app.getHttpServer())
        .delete(`/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Step 6: Try to use token after session deletion (should fail)
      await request(app.getHttpServer())
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);

      // Cleanup
      await otpHelper.clearOtp(phone);
    });

    it('should support multi-device sessions', async () => {
      const phone = `09${Math.floor(Math.random() * 900000000 + 100000000)}`;

      // Device 1: Send OTP
      await request(app.getHttpServer()).post('/auth/send-otp').send({ phone }).expect(200);

      const otpCode1 = await otpHelper.waitForOtp(phone);

      // Device 1: Verify and get token
      const verify1 = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ phone, code: otpCode1 })
        .expect(200);

      const token1 = verify1.body.accessToken;

      // Wait for cooldown, then send another OTP
      await new Promise((resolve) => setTimeout(resolve, 2500));

      // Device 2: Send OTP
      await request(app.getHttpServer()).post('/auth/send-otp').send({ phone }).expect(200);

      const otpCode2 = await otpHelper.waitForOtp(phone);

      // Device 2: Verify and get token
      const verify2 = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ phone, code: otpCode2 })
        .expect(200);

      const token2 = verify2.body.accessToken;

      // Both tokens should work
      await request(app.getHttpServer())
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      const sessions2 = await request(app.getHttpServer())
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${token2}`)
        .expect(200);

      expect(sessions2.body.sessions.length).toBeGreaterThanOrEqual(2);

      // Logout from all devices
      await request(app.getHttpServer())
        .delete('/auth/sessions')
        .set('Authorization', `Bearer ${token2}`)
        .expect(200);

      // Both tokens should now be invalid
      await request(app.getHttpServer())
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${token1}`)
        .expect(401);

      await request(app.getHttpServer())
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${token2}`)
        .expect(401);

      // Cleanup
      await otpHelper.clearOtp(phone);
    }, 10000); // Increase timeout for this test
  });

  describe('Error Handling', () => {
    it('should return proper error format', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/send-otp')
        .send({ phone: 'invalid' })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode');
      expect(response.body).toHaveProperty('message');
    });
  });
});
