const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');
const User = require('../models/user');
const { Testimonial } = require('../models/testimonial');
const TestimonialSettings = require('../models/testimonialSettings');
const { isValidStatusTransition } = require('../services/testimonialService');

let mongoServer;
let token;
let createdTestimonialId;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

// Небольшой хелпер: регистрирует нового пользователя и возвращает его токен.
// Используется там, где нужен "чужой" пользователь (проверка 403) или просто
// изолированный аккаунт, не завязанный на состояние других тестов.
const registerUser = async (email) => {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'password123', businessName: 'Business ' + email });
  return res.body.data.token;
};

const createTestimonial = async (authToken, overrides = {}) => {
  const res = await request(app)
    .post('/api/testimonials')
    .set('Authorization', `Bearer ${authToken}`)
    .send({ customerName: 'Клиент', ...overrides });
  return res.body.data;
};

describe('Testimonial Management API Tests', () => {

  // 1. Тест аутентификации и валидации
  describe('Auth Endpoints', () => {
    it('should register a new user and return JWT token', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'testuser@example.com',
          password: 'password123',
          businessName: 'Test Business'
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.status).toEqual('success');
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data.user.email).toEqual('testuser@example.com');

      token = res.body.data.token;
    });

    it('should login existing user and return token', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'testuser@example.com',
          password: 'password123'
        });

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('success');
      expect(res.body.data).toHaveProperty('token');
    });

    it('should reject duplicate email on register with 400', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'testuser@example.com',
          password: 'password123',
          businessName: 'Another Business'
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('failure');
    });
  });

  // 2. Тест Middleware аутентификации
  describe('Auth Middleware', () => {
    it('should reject request without token', async () => {
      const res = await request(app).get('/api/testimonials');
      expect(res.statusCode).toEqual(401);
      expect(res.body.status).toEqual('failure');
    });

    it('should reject request with invalid/malformed JWT', async () => {
      const res = await request(app)
        .get('/api/testimonials')
        .set('Authorization', 'Bearer this.is.not.a.valid.jwt');

      expect(res.statusCode).toEqual(401);
      expect(res.body.status).toEqual('failure');
    });
  });

  // 3. Тест CRUD откликов и конечного автомата статусов
  describe('Testimonials CRUD & State Machine', () => {
    it('should create a new testimonial with initial draft status', async () => {
      const res = await request(app)
        .post('/api/testimonials')
        .set('Authorization', `Bearer ${token}`)
        .send({
          customerName: 'Иван Иванов',
          text: 'Отличный сервис!',
          rating: 5
        });

      expect(res.statusCode).toEqual(201);
      expect(res.body.data.status).toEqual('draft');
      expect(res.body.data.customerName).toEqual('Иван Иванов');

      createdTestimonialId = res.body.data.testimonialId;
    });

    it('should allow valid status transition (draft -> recording)', async () => {
      const res = await request(app)
        .patch(`/api/testimonials/${createdTestimonialId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'recording' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.status).toEqual('recording');
    });

    it('should reject invalid status transition (recording -> shared)', async () => {
      const res = await request(app)
        .patch(`/api/testimonials/${createdTestimonialId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'shared' });

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('failure');
    });
  });

  // 4. Валидация входных данных
  describe('Input Validation', () => {
    it('should reject testimonial creation without customerName (400)', async () => {
      const res = await request(app)
        .post('/api/testimonials')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'Отзыв без имени клиента' });

      expect(res.statusCode).toEqual(400);
      expect(res.body.status).toEqual('failure');
    });

    it('should reject rating below 1 (400)', async () => {
      const res = await request(app)
        .post('/api/testimonials')
        .set('Authorization', `Bearer ${token}`)
        .send({ customerName: 'Тест', rating: 0 });

      expect(res.statusCode).toEqual(400);
    });

    it('should reject rating above 5 (400)', async () => {
      const res = await request(app)
        .post('/api/testimonials')
        .set('Authorization', `Bearer ${token}`)
        .send({ customerName: 'Тест', rating: 6 });

      expect(res.statusCode).toEqual(400);
    });

    it('should reject invalid customerEmail format (400)', async () => {
      const res = await request(app)
        .post('/api/testimonials')
        .set('Authorization', `Bearer ${token}`)
        .send({ customerName: 'Тест', customerEmail: 'not-an-email' });

      expect(res.statusCode).toEqual(400);
    });
  });

  // 5. Проверка владельца (403) — доступ к чужим отзывам
  describe('Ownership checks (403)', () => {
    let ownerToken;
    let otherToken;
    let ownerTestimonialId;

    beforeAll(async () => {
      ownerToken = await registerUser('owner-check@example.com');
      otherToken = await registerUser('intruder@example.com');
      const testimonial = await createTestimonial(ownerToken, { customerName: 'Чужой клиент' });
      ownerTestimonialId = testimonial.testimonialId;
    });

    it('should reject GET of another user\'s testimonial with 403', async () => {
      const res = await request(app)
        .get(`/api/testimonials/${ownerTestimonialId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.statusCode).toEqual(403);
    });

    it('should reject PUT of another user\'s testimonial with 403', async () => {
      const res = await request(app)
        .put(`/api/testimonials/${ownerTestimonialId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ customerName: 'Взлом' });

      expect(res.statusCode).toEqual(403);
    });

    it('should reject DELETE of another user\'s testimonial with 403', async () => {
      const res = await request(app)
        .delete(`/api/testimonials/${ownerTestimonialId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.statusCode).toEqual(403);
    });
  });

  // 6. Мягкое удаление
  describe('Soft delete', () => {
    let softDeleteToken;
    let testimonialId;

    beforeAll(async () => {
      softDeleteToken = await registerUser('softdelete@example.com');
      const testimonial = await createTestimonial(softDeleteToken, { customerName: 'На удаление' });
      testimonialId = testimonial.testimonialId;
    });

    it('should not physically remove the document from the database', async () => {
      await request(app)
        .delete(`/api/testimonials/${testimonialId}`)
        .set('Authorization', `Bearer ${softDeleteToken}`);

      const doc = await Testimonial.findOne({ testimonialId });
      expect(doc).not.toBeNull();
      expect(doc.isDeleted).toBe(true);
      expect(doc.deletedAt).not.toBeNull();
    });

    it('should exclude the deleted testimonial from GET list', async () => {
      const res = await request(app)
        .get('/api/testimonials')
        .set('Authorization', `Bearer ${softDeleteToken}`);

      const ids = res.body.data.map((t) => t.testimonialId);
      expect(ids).not.toContain(testimonialId);
    });
  });

  // 7. Полный жизненный цикл статусов + шаринг
  describe('Full status lifecycle & sharing', () => {
    let lifecycleToken;
    let testimonialId;

    beforeAll(async () => {
      lifecycleToken = await registerUser('lifecycle@example.com');
      const testimonial = await createTestimonial(lifecycleToken, { customerName: 'Полный цикл' });
      testimonialId = testimonial.testimonialId;
    });

    it('should reject share while testimonial is still in draft (400)', async () => {
      const res = await request(app)
        .post(`/api/testimonials/${testimonialId}/share`)
        .set('Authorization', `Bearer ${lifecycleToken}`)
        .send({ channels: ['email'] });

      expect(res.statusCode).toEqual(400);
    });

    it('should reject a same-state transition (draft -> draft) with 400', async () => {
      const res = await request(app)
        .patch(`/api/testimonials/${testimonialId}/status`)
        .set('Authorization', `Bearer ${lifecycleToken}`)
        .send({ status: 'draft' });

      expect(res.statusCode).toEqual(400);
    });

    it('should walk through all four allowed transitions in order', async () => {
      const chain = ['recording', 'processing', 'completed'];
      for (const nextStatus of chain) {
        const res = await request(app)
          .patch(`/api/testimonials/${testimonialId}/status`)
          .set('Authorization', `Bearer ${lifecycleToken}`)
          .send({ status: nextStatus });

        expect(res.statusCode).toEqual(200);
        expect(res.body.data.status).toEqual(nextStatus);
      }
    });

    it('should reject an invalid share channel (400)', async () => {
      const res = await request(app)
        .post(`/api/testimonials/${testimonialId}/share`)
        .set('Authorization', `Bearer ${lifecycleToken}`)
        .send({ channels: ['carrier-pigeon'] });

      expect(res.statusCode).toEqual(400);
    });

    it('should share, auto-transition completed -> shared, and set sharedAt', async () => {
      const res = await request(app)
        .post(`/api/testimonials/${testimonialId}/share`)
        .set('Authorization', `Bearer ${lifecycleToken}`)
        .send({ channels: ['email', 'facebook'] });

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.status).toEqual('shared');
      expect(res.body.data.sharedAt).not.toBeNull();
      expect(res.body.data.sharedChannels.sort()).toEqual(['email', 'facebook'].sort());
    });

    it('should deduplicate channels when sharing again with an overlapping channel', async () => {
      const res = await request(app)
        .post(`/api/testimonials/${testimonialId}/share`)
        .set('Authorization', `Bearer ${lifecycleToken}`)
        .send({ channels: ['email', 'sms'] });

      expect(res.statusCode).toEqual(200);
      const channels = res.body.data.sharedChannels;
      expect(channels.filter((c) => c === 'email').length).toEqual(1);
      expect(channels.sort()).toEqual(['email', 'facebook', 'sms'].sort());
    });
  });

  // 8. Settings
  describe('Testimonial settings', () => {
    let settingsToken;

    beforeAll(async () => {
      settingsToken = await registerUser('settings-user@example.com');
    });

    it('should return data: null when settings do not exist yet', async () => {
      const res = await request(app)
        .get('/api/testimonials/settings')
        .set('Authorization', `Bearer ${settingsToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data).toBeNull();
    });

    it('should upsert settings and persist only provided fields', async () => {
      const res = await request(app)
        .post('/api/testimonials/settings')
        .set('Authorization', `Bearer ${settingsToken}`)
        .send({ isEnabled: true, thankYouMessage: 'Спасибо большое!' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.isEnabled).toBe(true);
      expect(res.body.data.thankYouMessage).toEqual('Спасибо большое!');

      const stored = await TestimonialSettings.findOne({ userId: res.body.data.userId });
      expect(stored).not.toBeNull();
    });
  });

  // 9. Analytics
  describe('Analytics', () => {
    let analyticsToken;

    beforeAll(async () => {
      analyticsToken = await registerUser('analytics-user@example.com');
      await createTestimonial(analyticsToken, { customerName: 'A', rating: 4 });
      await createTestimonial(analyticsToken, { customerName: 'B', rating: 2 });
      const toDelete = await createTestimonial(analyticsToken, { customerName: 'C', rating: 5 });

      await request(app)
        .delete(`/api/testimonials/${toDelete.testimonialId}`)
        .set('Authorization', `Bearer ${analyticsToken}`);
    });

    it('should exclude soft-deleted testimonials from analytics totals', async () => {
      const res = await request(app)
        .get('/api/testimonials/analytics')
        .set('Authorization', `Bearer ${analyticsToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.overview.total).toEqual(2);
    });
  });

  // 10. Пагинация и валидация query-параметров
  describe('Pagination & query validation', () => {
    let paginationToken;

    beforeAll(async () => {
      paginationToken = await registerUser('pagination-user@example.com');
      for (let i = 0; i < 5; i++) {
        await createTestimonial(paginationToken, { customerName: `Клиент ${i}` });
      }
    });

    it('should paginate results according to page/limit', async () => {
      const res = await request(app)
        .get('/api/testimonials?page=1&limit=2')
        .set('Authorization', `Bearer ${paginationToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toEqual(2);
      expect(res.body.pagination.total).toEqual(5);
      expect(res.body.pagination.pages).toEqual(3);
    });

    it('should reject a negative page number (400)', async () => {
      const res = await request(app)
        .get('/api/testimonials?page=-1')
        .set('Authorization', `Bearer ${paginationToken}`);

      expect(res.statusCode).toEqual(400);
    });

    it('should reject a limit above 100 (400)', async () => {
      const res = await request(app)
        .get('/api/testimonials?limit=500')
        .set('Authorization', `Bearer ${paginationToken}`);

      expect(res.statusCode).toEqual(400);
    });

    it('should reject an unknown status filter value (400)', async () => {
      const res = await request(app)
        .get('/api/testimonials?status=banana')
        .set('Authorization', `Bearer ${paginationToken}`);

      expect(res.statusCode).toEqual(400);
    });
  });

  // 11. Поиск
  describe('Search', () => {
    let searchToken;

    beforeAll(async () => {
      searchToken = await registerUser('search-user@example.com');
      await createTestimonial(searchToken, { customerName: 'Алексей Смирнов', rating: 5, text: 'Прекрасно!' });
      await createTestimonial(searchToken, { customerName: 'Мария Петрова', rating: 2, text: 'Так себе' });
    });

    it('should find testimonials by minRating/maxRating', async () => {
      const res = await request(app)
        .get('/api/testimonials/search?minRating=4&maxRating=5')
        .set('Authorization', `Bearer ${searchToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toEqual(1);
      expect(res.body.data[0].customerName).toEqual('Алексей Смирнов');
    });

    it('should find testimonials created within a date range', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const res = await request(app)
        .get(`/api/testimonials/search?createdAfter=${today}`)
        .set('Authorization', `Bearer ${searchToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });
  });
});

// Unit-тесты чистой функции state machine — без БД и без HTTP,
// просто проверяем логику переходов саму по себе
describe('isValidStatusTransition (unit)', () => {
  it('allows each step of the defined chain', () => {
    expect(isValidStatusTransition('draft', 'recording')).toBe(true);
    expect(isValidStatusTransition('recording', 'processing')).toBe(true);
    expect(isValidStatusTransition('processing', 'completed')).toBe(true);
    expect(isValidStatusTransition('completed', 'shared')).toBe(true);
  });

  it('rejects same-state transitions', () => {
    expect(isValidStatusTransition('draft', 'draft')).toBe(false);
    expect(isValidStatusTransition('completed', 'completed')).toBe(false);
  });

  it('rejects skipping steps in the chain', () => {
    expect(isValidStatusTransition('draft', 'completed')).toBe(false);
    expect(isValidStatusTransition('draft', 'shared')).toBe(false);
  });

  it('rejects any transition out of the terminal "shared" state', () => {
    expect(isValidStatusTransition('shared', 'draft')).toBe(false);
  });
});
