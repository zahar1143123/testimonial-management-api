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

  it('should normalize email with surrounding whitespace and different case on register', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: '  Mixed-Case-User@Example.com  ',
        password: 'password123',
        businessName: 'Casing Test'
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body.data.user.email).toEqual('mixed-case-user@example.com');
  });

  it('should log in successfully with whitespace around the email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: '  Mixed-Case-User@Example.com  ', password: 'password123' });

    expect(res.statusCode).toEqual(200);
  });
});

describe('Auth input-type validation', () => {
  it('should reject a numeric email with 400, not 500', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 12345, password: 'password123', businessName: 'X' });

    expect(res.statusCode).toEqual(400);
  });

  it('should reject an object as email with 400, not 500', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: {}, password: 'password123', businessName: 'X' });

    expect(res.statusCode).toEqual(400);
  });

  it('should reject a numeric email on login with 400, not 500', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 12345, password: 'password123' });

    expect(res.statusCode).toEqual(400);
  });

  it('should reject whitespace-only businessName (400)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'whitespace-name@example.com', password: 'password123', businessName: '   ' });

    expect(res.statusCode).toEqual(400);
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

  it('should reject an already-issued JWT once the account is deactivated', async () => {
    const token = await registerUser('deactivated-after-login@example.com');

    await User.findOneAndUpdate(
      { email: 'deactivated-after-login@example.com' },
      { $set: { isActive: false } }
    );

    const res = await request(app)
      .get('/api/testimonials')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toEqual(401);
  });
});

describe('JWT of a deleted user', () => {
  it('should reject a valid JWT if the user no longer exists in the database', async () => {
    const token = await registerUser('to-be-deleted@example.com');
    await User.deleteOne({ email: 'to-be-deleted@example.com' });

    const res = await request(app)
      .get('/api/testimonials')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toEqual(401);
  });
});
