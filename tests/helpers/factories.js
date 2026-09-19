// Общие фабрики тестовых данных - переиспользуются во всех *.test.js,
// чтобы не копировать одну и ту же регистрацию/создание отзыва в каждом файле.
const request = require('supertest');
const app = require('../../app');

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

module.exports = { registerUser, createTestimonial };
