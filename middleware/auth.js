const jwt = require('jsonwebtoken');
const User = require('../models/user');

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

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
      return res.status(401).json({
        code: 401,
        status: 'failure',
        message: 'Не авторизован: недействительный или истекший токен'
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      code: 401,
      status: 'failure',
      message: 'Не авторизован: токен отсутствует'
    });
  }
};

module.exports = { protect };
