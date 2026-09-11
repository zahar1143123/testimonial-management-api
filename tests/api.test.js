const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../app');
const User = require('../models/user');
const Testimonial = require('../models/testimonial');

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
  });

  // 2. Тест Middleware аутентификации
  describe('Auth Middleware', () => {
    it('should reject request without token', async () => {
      const res = await request(app).get('/api/testimonials');
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
});