const User = require('../models/user');
const Counter = require('../models/counter');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Генерация JWT-токена
const generateToken = (userId, email) => {
  return jwt.sign(
    { userId, email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRY || '7d' }
  );
};

const register = async (req, res) => {
  try {
    const { email, password, businessName, role } = req.body;

    // 1. Валидация обязательных полей
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

    const counter = await Counter.findByIdAndUpdate(
      { _id: 'userId' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      userId: counter.seq,
      email: email.toLowerCase(),
      password: hashedPassword,
      businessName,
      role: role || 'owner'
    });

    const token = generateToken(user.userId, user.email);

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

    const token = generateToken(user.userId, user.email);

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