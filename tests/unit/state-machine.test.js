// Unit-тесты чистой функции state machine - без БД и без HTTP,
// просто проверяем логику переходов саму по себе. Никакого beforeAll/afterAll
// с MongoMemoryServer не нужно — в этом и ценность вынесения в чистую функцию.
const { isValidStatusTransition } = require('../../services/testimonialService');

describe('isValidStatusTransition (unit)', () => {
  it('allows each step of the defined chain', () => {
    expect(isValidStatusTransition('draft', 'recording')).toBe(true);
    expect(isValidStatusTransition('recording', 'processing')).toBe(true);
    expect(isValidStatusTransition('processing', 'completed')).toBe(true);
    expect(isValidStatusTransition('completed', 'shared')).toBe(true);
  });

  it('rejects same-state transitions', () => {
    expect(isValidStatusTransition('draft', 'draft')).toBe(false);
    expect(isValidStatusTransition('completed', 'completed')).toBe(false);
  });

  it('rejects skipping steps in the chain', () => {
    expect(isValidStatusTransition('draft', 'completed')).toBe(false);
    expect(isValidStatusTransition('draft', 'shared')).toBe(false);
  });

  it('rejects any transition out of the terminal "shared" state', () => {
    expect(isValidStatusTransition('shared', 'draft')).toBe(false);
  });
});
