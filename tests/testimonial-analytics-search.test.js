const request = require('supertest');
const app = require('../app');
const { connectTestDB, disconnectTestDB } = require('./helpers/db');
const { registerUser, createTestimonial } = require('./helpers/factories');

beforeAll(connectTestDB);
afterAll(disconnectTestDB);

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

describe('Analytics values', () => {
  let statsToken;

  beforeAll(async () => {
    statsToken = await registerUser('analytics-values@example.com');
    const first = await createTestimonial(statsToken, { customerName: 'X', rating: 4 });
    await createTestimonial(statsToken, { customerName: 'Y', rating: 2 });
    await request(app)
      .patch(`/api/testimonials/${first.testimonialId}/status`)
      .set('Authorization', `Bearer ${statsToken}`)
      .send({ status: 'recording' });
  });

  it('should report correct byStatus counts and averageRating', async () => {
    const res = await request(app)
      .get('/api/testimonials/analytics')
      .set('Authorization', `Bearer ${statsToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.overview.byStatus.recording).toEqual(1);
    expect(res.body.data.overview.byStatus.draft).toEqual(1);
    expect(res.body.data.overview.averageRating).toEqual(3);
  });
});

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

describe('Search & analytics query validation', () => {
  let rangeToken;

  beforeAll(async () => {
    rangeToken = await registerUser('range-validation@example.com');
  });

  it('should reject a non-numeric minRating (400)', async () => {
    const res = await request(app)
      .get('/api/testimonials/search?minRating=abc')
      .set('Authorization', `Bearer ${rangeToken}`);
    expect(res.statusCode).toEqual(400);
  });

  it('should reject minRating below 1 (400)', async () => {
    const res = await request(app)
      .get('/api/testimonials/search?minRating=0')
      .set('Authorization', `Bearer ${rangeToken}`);
    expect(res.statusCode).toEqual(400);
  });

  it('should reject maxRating above 5 (400)', async () => {
    const res = await request(app)
      .get('/api/testimonials/search?maxRating=6')
      .set('Authorization', `Bearer ${rangeToken}`);
    expect(res.statusCode).toEqual(400);
  });

  it('should reject minRating greater than maxRating (400)', async () => {
    const res = await request(app)
      .get('/api/testimonials/search?minRating=5&maxRating=2')
      .set('Authorization', `Bearer ${rangeToken}`);
    expect(res.statusCode).toEqual(400);
  });

  it('should reject an invalid sort field (400)', async () => {
    const res = await request(app)
      .get('/api/testimonials/search?sort=$where')
      .set('Authorization', `Bearer ${rangeToken}`);
    expect(res.statusCode).toEqual(400);
  });

  it('should reject an invalid startDate on analytics (400)', async () => {
    const res = await request(app)
      .get('/api/testimonials/analytics?startDate=not-a-date')
      .set('Authorization', `Bearer ${rangeToken}`);
    expect(res.statusCode).toEqual(400);
  });

  it('should reject startDate later than endDate on analytics (400)', async () => {
    const res = await request(app)
      .get('/api/testimonials/analytics?startDate=2025-12-31&endDate=2025-01-01')
      .set('Authorization', `Bearer ${rangeToken}`);
    expect(res.statusCode).toEqual(400);
  });

  it('should return 0 pages for an empty search result set', async () => {
    const res = await request(app)
      .get('/api/testimonials/search?q=NoSuchCustomerNameAnywhere')
      .set('Authorization', `Bearer ${rangeToken}`);
    expect(res.statusCode).toEqual(200);
    expect(res.body.data.length).toEqual(0);
    expect(res.body.pagination.pages).toEqual(0);
  });
});
