const rateLimit = require('express-rate-limit');

// Лимитер для эндпоинтов авторизации: максимум 5 попыток за 15 минут с одного IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: 429,
    status: 'failure',
    message: 'Слишком много попыток входа/регистрации. Попробуйте позже через 15 минут.'
  }
});

module.exports = {
  authLimiter
};