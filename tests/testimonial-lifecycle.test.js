const request = require('supertest');
const app = require('../app');
const { connectTestDB, disconnectTestDB } = require('./helpers/db');
const { registerUser, createTestimonial } = require('./helpers/factories');

beforeAll(connectTestDB);
afterAll(disconnectTestDB);

describe('Full status lifecycle & sharing', () => {
  let lifecycleToken;
  let testimonialId;

  beforeAll(async () => {
    lifecycleToken = await registerUser('lifecycle@example.com');
    const testimonial = await createTestimonial(lifecycleToken, { customerName: 'Полный цикл' });
    testimonialId = testimonial.testimonialId;
  });

  it('should reject share while testimonial is still in draft (400)', async () => {
    const res = await request(app)
      .post(`/api/testimonials/${testimonialId}/share`)
      .set('Authorization', `Bearer ${lifecycleToken}`)
      .send({ channels: ['email'] });

    expect(res.statusCode).toEqual(400);
  });

  it('should reject a same-state transition (draft -> draft) with 400', async () => {
    const res = await request(app)
      .patch(`/api/testimonials/${testimonialId}/status`)
      .set('Authorization', `Bearer ${lifecycleToken}`)
      .send({ status: 'draft' });

    expect(res.statusCode).toEqual(400);
  });

  it('should walk through all four allowed transitions in order', async () => {
    const chain = ['recording', 'processing', 'completed'];
    for (const nextStatus of chain) {
      const res = await request(app)
        .patch(`/api/testimonials/${testimonialId}/status`)
        .set('Authorization', `Bearer ${lifecycleToken}`)
        .send({ status: nextStatus });

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.status).toEqual(nextStatus);
    }
  });

  it('should reject an invalid share channel (400)', async () => {
    const res = await request(app)
      .post(`/api/testimonials/${testimonialId}/share`)
      .set('Authorization', `Bearer ${lifecycleToken}`)
      .send({ channels: ['carrier-pigeon'] });

    expect(res.statusCode).toEqual(400);
  });

  it('should share, auto-transition completed -> shared, and set sharedAt', async () => {
    const res = await request(app)
      .post(`/api/testimonials/${testimonialId}/share`)
      .set('Authorization', `Bearer ${lifecycleToken}`)
      .send({ channels: ['email', 'facebook'] });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.status).toEqual('shared');
    expect(res.body.data.sharedAt).not.toBeNull();
    expect(res.body.data.sharedChannels.sort()).toEqual(['email', 'facebook'].sort());
  });

  it('should deduplicate channels when sharing again with an overlapping channel', async () => {
    const res = await request(app)
      .post(`/api/testimonials/${testimonialId}/share`)
      .set('Authorization', `Bearer ${lifecycleToken}`)
      .send({ channels: ['email', 'sms'] });

    expect(res.statusCode).toEqual(200);
    const channels = res.body.data.sharedChannels;
    expect(channels.filter((c) => c === 'email').length).toEqual(1);
    expect(channels.sort()).toEqual(['email', 'facebook', 'sms'].sort());
  });
});

describe('Ownership on status/share', () => {
  let ownerToken2;
  let intruderToken2;
  let sharedTestimonialId;

  beforeAll(async () => {
    ownerToken2 = await registerUser('owner2@example.com');
    intruderToken2 = await registerUser('intruder2@example.com');
    const testimonial = await createTestimonial(ownerToken2, { customerName: 'Чужой для статуса' });
    sharedTestimonialId = testimonial.testimonialId;
  });

  it('should reject status change on another user\'s testimonial with 403', async () => {
    const res = await request(app)
      .patch(`/api/testimonials/${sharedTestimonialId}/status`)
      .set('Authorization', `Bearer ${intruderToken2}`)
      .send({ status: 'recording' });
    expect(res.statusCode).toEqual(403);
  });

  it('should reject share on another user\'s testimonial with 403', async () => {
    const res = await request(app)
      .post(`/api/testimonials/${sharedTestimonialId}/share`)
      .set('Authorization', `Bearer ${intruderToken2}`)
      .send({ channels: ['email'] });
    expect(res.statusCode).toEqual(403);
  });
});

describe('Race condition on status transition', () => {
  it('should let exactly one of two concurrent identical transitions succeed, the other gets 409', async () => {
    const raceToken = await registerUser('race-condition@example.com');
    const testimonial = await createTestimonial(raceToken, { customerName: 'Гонка' });

    const attempt = () =>
      request(app)
        .patch(`/api/testimonials/${testimonial.testimonialId}/status`)
        .set('Authorization', `Bearer ${raceToken}`)
        .send({ status: 'recording' });

    const [first, second] = await Promise.all([attempt(), attempt()]);
    const statusCodes = [first.statusCode, second.statusCode].sort();

    expect(statusCodes).toEqual([200, 409]);
  });
});

describe('Concurrent share does not lose channels', () => {
  it('should keep both channels when two different share requests race', async () => {
    const shareRaceToken = await registerUser('share-race@example.com');
    const testimonial = await createTestimonial(shareRaceToken, { customerName: 'Гонка шаринга' });

    for (const status of ['recording', 'processing', 'completed']) {
      await request(app)
        .patch(`/api/testimonials/${testimonial.testimonialId}/status`)
        .set('Authorization', `Bearer ${shareRaceToken}`)
        .send({ status });
    }

    const shareWith = (channels) =>
      request(app)
        .post(`/api/testimonials/${testimonial.testimonialId}/share`)
        .set('Authorization', `Bearer ${shareRaceToken}`)
        .send({ channels });

    await Promise.all([shareWith(['email']), shareWith(['facebook'])]);

    const res = await request(app)
      .get(`/api/testimonials/${testimonial.testimonialId}`)
      .set('Authorization', `Bearer ${shareRaceToken}`);

    expect(res.body.data.sharedChannels.sort()).toEqual(['email', 'facebook'].sort());
  });
});
