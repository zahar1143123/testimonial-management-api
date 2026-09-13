const User = require('../models/user');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Генерация JWT-токена с фолбэком секретного ключа
const generateToken = (userId, email, role) => {
  const secret = process.env.JWT_SECRET || 'fallback_secret_key';
  return jwt.sign(
    { userId, email, role },
    secret,
    { expiresIn: process.env.JWT_EXPIRY || '7d' }
  );
};

const register = async (req, res) => {
  try {
    const { email, password, businessName, role } = req.body;

    if (!email || !password || !businessName) {
      return res.status(400).json({
        code: 400,
        status: 'failure',
        message: 'Поля email, password и businessName обязательны'
      });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        code: 400,
        status: 'failure',
        message: 'Пользователь с таким email уже существует'
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      email: email.toLowerCase(),
      password: hashedPassword,
      businessName,
      role: role || 'owner'
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
    console.error('Register error:', error.message);
    return res.status(500).json({
      code: 500,
      status: 'failure',
      message: error.message || 'Ошибка сервера при регистрации'
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        code: 400,
        status: 'failure',
        message: 'Укажите email и password'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
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
    console.error('Login error:', error.message);
    return res.status(500).json({
      code: 500,
      status: 'failure',
      message: error.message || 'Ошибка сервера при входе'
    });
  }
};

module.exports = {
  register,
  login
};