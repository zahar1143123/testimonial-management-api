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

describe('Partial contactConsent update (review point 6)', () => {
  let consentToken;

  beforeAll(async () => {
    consentToken = await registerUser('contact-consent@example.com');
  });

  it('should preserve previously saved contactConsent.text when only enabled is updated later', async () => {
    const firstRes = await request(app)
      .post('/api/testimonials/settings')
      .set('Authorization', `Bearer ${consentToken}`)
      .send({ contactConsent: { enabled: true, text: 'Custom text' } });

    expect(firstRes.statusCode).toEqual(200);
    expect(firstRes.body.data.contactConsent).toEqual({
      enabled: true,
      text: 'Custom text'
    });

    const secondRes = await request(app)
      .post('/api/testimonials/settings')
      .set('Authorization', `Bearer ${consentToken}`)
      .send({ contactConsent: { enabled: false } });

    expect(secondRes.statusCode).toEqual(200);
    // Регрессия из фидбека: раньше это стирало ранее сохранённый text,
    // заменяя весь вложенный объект целиком.
    expect(secondRes.body.data.contactConsent).toEqual({
      enabled: false,
      text: 'Custom text'
    });
  });

  it('should update only contactConsent.text without touching enabled', async () => {
    const textOnlyToken = await registerUser('contact-consent-text-only@example.com');

    await request(app)
      .post('/api/testimonials/settings')
      .set('Authorization', `Bearer ${textOnlyToken}`)
      .send({ contactConsent: { enabled: true, text: 'Original text' } });

    const res = await request(app)
      .post('/api/testimonials/settings')
      .set('Authorization', `Bearer ${textOnlyToken}`)
      .send({ contactConsent: { text: 'Updated text' } });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.contactConsent).toEqual({
      enabled: true,
      text: 'Updated text'
    });
  });
});
