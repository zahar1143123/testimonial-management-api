const jwt = require('jsonwebtoken');
const User = require('../models/user');

// FIX (ревью, п.5): раньше jwt.verify() и User.findOne() были в одном
// try/catch. Если запрос к БД падал (например, потерянное соединение), API
// возвращал 401 "недействительный токен", хотя токен был абсолютно валиден
// — просто БД была недоступна. Теперь верификация JWT и обращение к БД
// разнесены по разным try/catch: ошибка JWT -> 401, ошибка БД ->
// next(error) -> общий errorHandler -> 5xx.
const protect = async (req, res, next) => {
  if (
    !req.headers.authorization ||
    !req.headers.authorization.startsWith('Bearer')
  ) {
    return res.status(401).json({
      code: 401,
      status: 'failure',
      message: 'Не авторизован: токен отсутствует'
    });
  }

  const token = req.headers.authorization.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return res.status(401).json({
      code: 401,
      status: 'failure',
      message: 'Не авторизован: недействительный или истекший токен'
    });
  }

  try {
    // JWT сам по себе валиден до истечения exp, даже если пользователя за
    // это время удалили или деактивировали (isActive: false) — токен об
    // этом ничего не знает, он просто содержит снимок данных на момент
    // выдачи. Поэтому здесь дополнительно перепроверяем актуальное
    // состояние в БД на каждый запрос, а не доверяем payload вслепую.
    const user = await User.findOne({
      userId: decoded.userId,
      isActive: true
    });

    if (!user) {
      return res.status(401).json({
        code: 401,
        status: 'failure',
        message: 'Не авторизован: пользователь не найден или деактивирован'
      });
    }

    req.user = {
      userId: user.userId,
      email: user.email,
      role: user.role
    };

    return next();
  } catch (error) {
    // Ошибка БД — это не проблема авторизации, поэтому не 401.
    // Общий errorHandler решит (500, либо 503, если явно определено).
    return next(error);
  }
};

module.exports = { protect };
