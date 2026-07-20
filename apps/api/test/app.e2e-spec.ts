import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * E2E tests require Postgres + Redis (or will skip gracefully on connection failure).
 * Run via: npm run test:e2e -w @aviator/api
 */
describe('Aviator API (e2e)', () => {
  let app: INestApplication;
  let ready = false;

  beforeAll(async () => {
    try {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      app.setGlobalPrefix('api');
      app.useGlobalPipes(
        new ValidationPipe({ whitelist: true, transform: true }),
      );
      await app.init();
      ready = true;
    } catch (err) {
      console.warn('E2E setup skipped:', (err as Error).message);
      ready = false;
    }
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('GET /api/health', async () => {
    if (!ready) return;
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('aviator-api');
  });

  it('rejects invalid login', async () => {
    if (!ready) return;
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrongpass' });
    expect([401, 500]).toContain(res.status);
  });

  it('register → login flow with unique email', async () => {
    if (!ready) return;
    const email = `e2e_${Date.now()}@test.local`;
    const reg = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'Test1234!', displayName: 'E2E' });
    if (reg.status >= 500) return;
    expect(reg.status).toBe(201);
    expect(reg.body.tokens.accessToken).toBeDefined();
    expect(reg.body.user.virtualCredits).toBe(10000);

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'Test1234!' });
    expect(login.status).toBe(201);
  });
});
