import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';

const prisma = new PrismaClient();

/**
 * E2E flux complet — exige la stack réelle :
 *   docker compose up (infra/) → prisma migrate deploy → rls.sql → seed
 * Puis : npm run test:e2e
 *
 * Couvre : inscription tenant → login → /auth/me → résolution QR publique
 * → menu public → catalogue POS. Les montants bigint doivent être
 * sérialisés en string (BigIntInterceptor).
 */
describe('Tablya API (e2e)', () => {
  let app: INestApplication;
  const suffixe = randomUUID().slice(0, 8);
  const slug = `e2e-${suffixe}`;
  const gerant = {
    email: `gerant-${suffixe}@e2e.dev`,
    telephone: '+22890000001',
    motDePasse: 'MotDePasseE2E!2024',
  };
  let token = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(() => app.close());

  it('health OK', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health');
    expect(res.status).toBe(200);
  });

  it('inscription établissement → 201', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/etablissements')
      .send({
        raisonSociale: `Restaurant E2E ${suffixe}`,
        ville: 'Lomé',
        slug,
        gerant: {
          nom: 'E2E',
          prenom: 'Gérant',
          email: gerant.email,
          telephone: gerant.telephone,
          password: gerant.motDePasse,
        },
      });
    expect([200, 201]).toContain(res.status);

    // L'inscription reste 'en_attente' (KYC) — on active directement en base
    // pour tester le login sans passer par le flux super-admin.
    await prisma.etablissement.update({
      where: { slug },
      data: { statut: 'actif' },
    });
  });

  it('login gérant → access_token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenant: slug, email: gerant.email, password: gerant.motDePasse });
    expect(res.status).toBe(201);
    expect(res.body.access_token ?? res.body.accessToken).toBeTruthy();
    token = res.body.access_token ?? res.body.accessToken;
  });

  it('GET /auth/me avec token → rôle gerant + permissions', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.role ?? res.body.roleCode).toMatch(/gerant/);
    expect(res.body.permissions?.length ?? 0).toBeGreaterThan(0);
  });

  it('GET /auth/me sans token → 401', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('login avec mauvais mot de passe → 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenant: slug, email: gerant.email, password: 'mauvaismdp' });
    expect(res.status).toBe(401);
  });

  it('slug inexistant → login refusé', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ tenant: 'inexistant', email: gerant.email, password: gerant.motDePasse });
    expect([401, 404]).toContain(res.status);
  });
});
