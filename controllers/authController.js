const User = require('../models/user');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// process.env.JWT_SECRET гарантированно задан к этому моменту — app.js
// падает при старте, если его нет (см. fail-fast проверку в app.js)
const generateToken = (userId, email, role) =>
  jwt.sign(
    { userId, email, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRY || '7d' }
  );

const validateCredentials = ({ email, password, businessName }) => {
  if (typeof email !== 'string' || typeof password !== 'string') {
    return { error: 'email и password должны быть строками' };
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) {
    return { error: 'Поля email и password обязательны' };
  }
  if (businessName !== undefined) {
    if (typeof businessName !== 'string' || !businessName.trim()) {
      return { error: 'businessName должен быть непустой строкой' };
    }
  }
  return { normalizedEmail, businessName: businessName?.trim() };
};

const register = async (req, res, next) => {
  try {
    const { password, businessName } = req.body;
    const validated = validateCredentials({ email: req.body.email, password, businessName });

    if (validated.error || !validated.businessName) {
      return res.status(400).json({
        code: 400,
        status: 'failure',
        message: validated.error || 'Поля email, password и businessName обязательны'
      });
    }

    const { normalizedEmail } = validated;

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({
        code: 400,
        status: 'failure',
        message: 'Пользователь с таким email уже существует'
      });
    }

    // Пароль хешируется один раз, в User.pre('save') — не дублируем здесь
    const user = await User.create({
      email: normalizedEmail,
      password,
      businessName: validated.businessName,
      role: 'owner'
    });

    const token = generateToken(user.userId, user.email, user.role);

    return res.status(201).json({
      code: 201,
      status: 'success',
      message: 'Пользователь успешно зарегистрирован',
      data: {
        user: {
          userId: user.userId,
          email: user.email,
          businessName: user.businessName,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt
        },
        token
      }
    });
  } catch (error) {
    return next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { password } = req.body;
    const validated = validateCredentials({ email: req.body.email, password });

    if (validated.error) {
      return res.status(400).json({
        code: 400,
        status: 'failure',
        message: validated.error
      });
    }

    const { normalizedEmail } = validated;

    // password по умолчанию скрыт схемой (select: false) — явно запрашиваем
    // его здесь, единственном месте, где он реально нужен
    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    if (!user) {
      return res.status(401).json({
        code: 401,
        status: 'failure',
        message: 'Неверный email или пароль'
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        code: 401,
        status: 'failure',
        message: 'Неверный email или пароль'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        code: 403,
        status: 'failure',
        message: 'Учётная запись деактивирована'
      });
    }

    const token = generateToken(user.userId, user.email, user.role);

    return res.status(200).json({
      code: 200,
      status: 'success',
      message: 'Успешная авторизация',
      data: {
        user: {
          userId: user.userId,
          email: user.email,
          businessName: user.businessName,
          role: user.role,
          isActive: user.isActive
        },
        token
      }
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  register,
  login
};
