// Регресс-тесты на ревью, п.2: набор запросов, которые раньше возвращали
// 500 вместо корректного 4xx.
const request = require('supertest');
const app = require('../app');
const { connectTestDB, disconnectTestDB } = require('./helpers/db');
const { registerUser } = require('./helpers/factories');

beforeAll(connectTestDB);
afterAll(disconnectTestDB);

describe('Malformed / missing request body (review point 2)', () => {
  it('should return 400, not 500, for truncated JSON on login', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect(res.statusCode).toEqual(400);
    expect(res.body.status).toEqual('failure');
  });

  it('should return 400, not 500, for a login request with no body at all', async () => {
    // Ни .send(), ни Content-Type не выставляем — именно так express.json()
    // не трогает req.body, и он остаётся undefined (в отличие от пустого
    // '{}', которое body-parser бы распарсил нормально).
    const res = await request(app).post('/api/auth/login');

    expect(res.statusCode).toEqual(400);
  });

  it('should return 413 for a JSON body over the Express size limit', async () => {
    // Express default limit для express.json() - 100kb; берём с запасом
    const oversized = { email: 'a@example.com', password: 'x'.repeat(110 * 1024) };

    const res = await request(app)
      .post('/api/auth/login')
      .send(oversized);

    expect(res.statusCode).toEqual(413);
  });
});

describe('Query param validation on protected endpoints (review point 2)', () => {
  let token;

  beforeAll(async () => {
    token = await registerUser('validation-endpoints@example.com');
  });

  it('should return 400, not 500, for an out-of-range month in startDate', async () => {
    const res = await request(app)
      .get('/api/testimonials/analytics?startDate=2025-13-01')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toEqual(400);
  });

  it('should return 400, not 500, for a zero day in createdAfter', async () => {
    const res = await request(app)
      .get('/api/testimonials/search?createdAfter=2025-01-00')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toEqual(400);
  });

  it('should return 400, not 500, when q is passed twice (parsed as an array)', async () => {
    const res = await request(app)
      .get('/api/testimonials/search?q=alice&q=bob')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toEqual(400);
    // Не должно быть технических деталей вроде "str.replace is not a function"
    expect(res.body.message).not.toMatch(/replace is not a function/i);
  });
});
