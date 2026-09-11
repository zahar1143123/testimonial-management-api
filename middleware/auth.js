const jwt = require('jsonwebtoken');

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      token = req.headers.authorization.split(' ')[1];

      const secret = process.env.JWT_SECRET || 'fallback_secret_key';
      const decoded = jwt.verify(token, secret);

      req.user = decoded;

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