// Регресс-тест на ревью, п.5: jwt.verify() и User.findOne() были в одном
// try/catch, поэтому ошибка БД маскировалась под 401 "невалидный токен".
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/user');
const { connectTestDB, disconnectTestDB } = require('./helpers/db');
const { registerUser } = require('./helpers/factories');

beforeAll(connectTestDB);
afterAll(disconnectTestDB);

describe('Auth middleware: JWT errors vs DB errors (review point 5)', () => {
  it('should return a 5xx (not 401) when the DB lookup fails for an otherwise valid token', async () => {
    const token = await registerUser('db-outage@example.com');

    // Симулируем сбой БД именно в том вызове, который делает
    // middleware/auth.js после успешной верификации JWT.
    const spy = jest.spyOn(User, 'findOne').mockRejectedValueOnce(
      new Error('Simulated DB outage')
    );

    const res = await request(app)
      .get('/api/testimonials')
      .set('Authorization', `Bearer ${token}`);

    spy.mockRestore();

    expect(res.statusCode).toBeGreaterThanOrEqual(500);
    expect(res.statusCode).toBeLessThan(600);
  });

  it('should still return 401 for a malformed JWT (not a DB-error path)', async () => {
    const res = await request(app)
      .get('/api/testimonials')
      .set('Authorization', 'Bearer this.is.not.a.valid.jwt');

    expect(res.statusCode).toEqual(401);
  });

  it('should still return 401 for a properly-signed but expired JWT', async () => {
    const expiredToken = jwt.sign(
      { userId: 1, email: 'expired@example.com', role: 'owner' },
      process.env.JWT_SECRET,
      { expiresIn: -10 } // уже истёк
    );

    const res = await request(app)
      .get('/api/testimonials')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.statusCode).toEqual(401);
  });

  it('should still return 401 when the DB lookup succeeds but finds no active user', async () => {
    // Не мокаем ничего - обычный кейс "пользователя нет/деактивирован",
    // чтобы убедиться, что разделение try/catch не поломало этот путь.
    const token = jwt.sign(
      { userId: 999999999, email: 'nobody@example.com', role: 'owner' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const res = await request(app)
      .get('/api/testimonials')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toEqual(401);
  });
});
