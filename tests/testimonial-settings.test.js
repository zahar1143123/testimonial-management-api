const request = require('supertest');
const app = require('../app');
const TestimonialSettings = require('../models/testimonialSettings');
const { connectTestDB, disconnectTestDB } = require('./helpers/db');
const { registerUser } = require('./helpers/factories');

beforeAll(connectTestDB);
afterAll(disconnectTestDB);

describe('Testimonial settings', () => {
  let settingsToken;

  beforeAll(async () => {
    settingsToken = await registerUser('settings-user@example.com');
  });

  it('should return data: null when settings do not exist yet', async () => {
    const res = await request(app)
      .get('/api/testimonials/settings')
      .set('Authorization', `Bearer ${settingsToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.data).toBeNull();
  });

  it('should upsert settings and persist only provided fields', async () => {
    const res = await request(app)
      .post('/api/testimonials/settings')
      .set('Authorization', `Bearer ${settingsToken}`)
      .send({ isEnabled: true, thankYouMessage: 'Спасибо большое!' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.isEnabled).toBe(true);
    expect(res.body.data.thankYouMessage).toEqual('Спасибо большое!');

    const stored = await TestimonialSettings.findOne({ userId: res.body.data.userId });
    expect(stored).not.toBeNull();
  });
});

describe('Settings tampering protection', () => {
  let tamperToken;

  beforeAll(async () => {
    tamperToken = await registerUser('settings-tamper@example.com');
  });

  it('should ignore an attempt to change userId via settings upsert', async () => {
    const res = await request(app)
      .post('/api/testimonials/settings')
      .set('Authorization', `Bearer ${tamperToken}`)
      .send({ isEnabled: true, userId: 999999 });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.userId).not.toEqual(999999);
  });

  it('should reject invalid videoLengthOptions on settings (400)', async () => {
    const res = await request(app)
      .post('/api/testimonials/settings')
      .set('Authorization', `Bearer ${tamperToken}`)
      .send({ videoLengthOptions: [10, -5] });
    expect(res.statusCode).toEqual(400);
  });
});
