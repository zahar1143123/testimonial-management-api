const request = require('supertest');
const app = require('../app');
const User = require('../models/user');
const { connectTestDB, disconnectTestDB } = require('./helpers/db');
const { registerUser } = require('./helpers/factories');

beforeAll(connectTestDB);
afterAll(disconnectTestDB);

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

describe('Deactivated account', () => {
  it('should reject login with 403 when isActive is false', async () => {
    await registerUser('deactivated-user@example.com');
    await User.findOneAndUpdate(
      { email: 'deactivated-user@example.com' },
      { $set: { isActive: false } }
    );

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'deactivated-user@example.com', password: 'password123' });

    expect(res.statusCode).toEqual(403);
  });
});
