// Регресс-тест на ревью, п.3: bcrypt учитывает только первые 72 байта
// пароля. Без явного лимита пароль длиннее 72 байт принимался, но
// сравнивался фактически только по первым 72 байтам.
const request = require('supertest');
const app = require('../app');
const { connectTestDB, disconnectTestDB } = require('./helpers/db');

beforeAll(connectTestDB);
afterAll(disconnectTestDB);

describe('bcrypt 72-byte password boundary (review point 3)', () => {
  it('should accept a password of exactly 72 bytes', async () => {
    const password = 'x'.repeat(72);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'boundary-72@example.com', password, businessName: 'B72' });

    expect(res.statusCode).toEqual(201);
  });

  it('should reject a password of 73 bytes with 400, not accept it silently', async () => {
    const password = 'x'.repeat(73);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'boundary-73@example.com', password, businessName: 'B73' });

    expect(res.statusCode).toEqual(400);
  });

  it('should count multibyte UTF-8 characters by byte length, not character count', async () => {
    // Каждый '€' - 3 байта в UTF-8, значит 25 символов = 75 байт > 72
    const password = '€'.repeat(25);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'boundary-multibyte@example.com', password, businessName: 'BM' });

    expect(res.statusCode).toEqual(400);
  });

  it('should not treat a >72-byte password as matching a wrong tail on login', async () => {
    // Регрессия из фидбека: раньше 'x'.repeat(72)+'correct' и
    // 'x'.repeat(72)+'WRONG' считались одним и тем же паролем, потому что
    // bcrypt сравнивал только первые 72 байта. Теперь такой пароль вообще
    // не должен был пройти регистрацию (см. тест выше), но дополнительно
    // проверяем, что даже если бы это как-то проскочило, неверный "хвост"
    // не даёт залогиниться.
    const email = 'boundary-tail@example.com';
    const longCorrect = 'x'.repeat(72) + 'correct';
    const longWrong = 'x'.repeat(72) + 'WRONG';

    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email, password: longCorrect, businessName: 'Tail' });

    // Ожидаем, что регистрация с паролем длиннее 72 байт отклонена (400) —
    // это первичная защита. Если по какой-то причине лимит не сработал бы,
    // тест ниже всё равно поймал бы "молчаливое" совпадение по обрезанному
    // паролю.
    expect(registerRes.statusCode).toEqual(400);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: longWrong });

    // Пользователь не был создан (регистрация отклонена), так что верный
    // ответ на попытку логина - "неверный email или пароль", а не 200.
    expect(loginRes.statusCode).not.toEqual(200);
  });

  it('should still reject a normal wrong password on login (no regression)', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'normal-login@example.com', password: 'correct-password', businessName: 'Normal' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'normal-login@example.com', password: 'wrong-password' });

    expect(res.statusCode).toEqual(401);
  });
});
