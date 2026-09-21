const request = require('supertest');
const app = require('../app');
const { Testimonial } = require('../models/testimonial');
const { connectTestDB, disconnectTestDB } = require('./helpers/db');
const { registerUser, createTestimonial } = require('./helpers/factories');

let token;
let createdTestimonialId;

beforeAll(connectTestDB);
afterAll(disconnectTestDB);

beforeAll(async () => {
  token = await registerUser('crud-user@example.com');
});

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

  it('should reject a whitespace-only customerName (400)', async () => {
    const res = await request(app)
      .post('/api/testimonials')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerName: '   ' });

    expect(res.statusCode).toEqual(400);
  });
});

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

describe('PUT tampering protection', () => {
  let tamperToken;
  let tamperTestimonialId;

  beforeAll(async () => {
    tamperToken = await registerUser('tamper-user@example.com');
    const testimonial = await createTestimonial(tamperToken, { customerName: 'Неприкосновенный' });
    tamperTestimonialId = testimonial.testimonialId;
  });

  it('should reject PUT with an empty body (400)', async () => {
    const res = await request(app)
      .put(`/api/testimonials/${tamperTestimonialId}`)
      .set('Authorization', `Bearer ${tamperToken}`)
      .send({});
    expect(res.statusCode).toEqual(400);
  });

  it('should ignore an attempt to change status via PUT (whitelist holds)', async () => {
    const res = await request(app)
      .put(`/api/testimonials/${tamperTestimonialId}`)
      .set('Authorization', `Bearer ${tamperToken}`)
      .send({ customerName: 'Обновлено', status: 'shared' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.status).toEqual('draft');
  });
});

describe('Deleted testimonial is fully inaccessible', () => {
  let deletedToken;
  let deletedId;

  beforeAll(async () => {
    deletedToken = await registerUser('already-deleted@example.com');
    const testimonial = await createTestimonial(deletedToken, { customerName: 'Будет удалён' });
    deletedId = testimonial.testimonialId;
    await request(app)
      .delete(`/api/testimonials/${deletedId}`)
      .set('Authorization', `Bearer ${deletedToken}`);
  });

  it('should return 404 on PUT to a deleted testimonial', async () => {
    const res = await request(app)
      .put(`/api/testimonials/${deletedId}`)
      .set('Authorization', `Bearer ${deletedToken}`)
      .send({ customerName: 'Попытка правки' });
    expect(res.statusCode).toEqual(404);
  });

  it('should return 404 on status change to a deleted testimonial', async () => {
    const res = await request(app)
      .patch(`/api/testimonials/${deletedId}/status`)
      .set('Authorization', `Bearer ${deletedToken}`)
      .send({ status: 'recording' });
    expect(res.statusCode).toEqual(404);
  });

  it('should return 404 on share of a deleted testimonial', async () => {
    const res = await request(app)
      .post(`/api/testimonials/${deletedId}/share`)
      .set('Authorization', `Bearer ${deletedToken}`)
      .send({ channels: ['email'] });
    expect(res.statusCode).toEqual(404);
  });
});
