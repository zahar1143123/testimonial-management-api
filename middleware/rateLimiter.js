const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    code: 429,
    status: 'failure',
    message: 'Слишком много попыток входа/регистрации. Попробуйте позже через 15 минут.'
  }
});

// Ограничение на создание отзывов: без него POST /api/testimonials можно
// долбить без ограничений — простой вектор для спама/абьюза. Лимит мягче,
// чем у authLimiter, и считается ПО ПОЛЬЗОВАТЕЛЮ (userId из JWT), а не по
// IP — иначе несколько клиентов за одним NAT/офисным роутером мешали бы
// друг другу. Применяется после protect, так что req.user уже есть.
const createTestimonialLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  keyGenerator: (req) => req.user?.userId?.toString() || req.ip,
  message: {
    code: 429,
    status: 'failure',
    message: 'Слишком много отзывов создано за последний час. Попробуйте позже.'
  }
});

module.exports = {
  authLimiter,
  createTestimonialLimiter
};