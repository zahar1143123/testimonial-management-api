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

module.exports = {
  authLimiter
};