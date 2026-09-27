// Регресс-тест на ревью, п.1: без tie-breaker по _id обход всех страниц
// при совпадающих значениях сортируемого поля (rating) дублирует часть
// отзывов и пропускает другие.
const request = require('supertest');
const app = require('../app');
const { connectTestDB, disconnectTestDB } = require('./helpers/db');
const { registerUser, createTestimonial } = require('./helpers/factories');

beforeAll(connectTestDB);
afterAll(disconnectTestDB);

describe('Pagination stability with duplicate sort values (review point 1)', () => {
  let token;
  const TOTAL = 40;
  const PAGE_SIZE = 5;

  beforeAll(async () => {
    token = await registerUser('pagination-stability@example.com');
    for (let i = 0; i < TOTAL; i++) {
      // Все отзывы с одинаковым rating=5, чтобы гарантированно проверить
      // именно сценарий совпадающих значений сортируемого поля.
      await createTestimonial(token, { customerName: `Клиент ${i}`, rating: 5 });
    }
  });

  it('should return each testimonial exactly once when paging through with sort=rating', async () => {
    const seenIds = [];

    for (let page = 1; page <= TOTAL / PAGE_SIZE; page++) {
      const res = await request(app)
        .get(`/api/testimonials?sort=rating&limit=${PAGE_SIZE}&page=${page}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toEqual(200);
      seenIds.push(...res.body.data.map((t) => t.testimonialId));
    }

    const uniqueIds = new Set(seenIds);

    // Основная регрессия: без tie-breaker при 40 отзывах с rating=5 в
    // выдаче было только 9 уникальных id из 40 полученных.
    expect(seenIds.length).toEqual(TOTAL);
    expect(uniqueIds.size).toEqual(TOTAL);
  });

  it('should also stay stable on the search endpoint with sort=rating', async () => {
    const seenIds = [];

    for (let page = 1; page <= TOTAL / PAGE_SIZE; page++) {
      const res = await request(app)
        .get(`/api/testimonials/search?sort=rating&limit=${PAGE_SIZE}&page=${page}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toEqual(200);
      seenIds.push(...res.body.data.map((t) => t.testimonialId));
    }

    const uniqueIds = new Set(seenIds);
    expect(seenIds.length).toEqual(TOTAL);
    expect(uniqueIds.size).toEqual(TOTAL);
  });
});
