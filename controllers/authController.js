const User = require('../models/user');
const Counter = require('../models/counter');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// Генерация JWT-токена с фолбэком секретного ключа
const generateToken = (userId, email) => {
  const secret = process.env.JWT_SECRET || 'fallback_secret_key';
  return jwt.sign(
    { userId, email },
    secret,
    { expiresIn: process.env.JWT_EXPIRY || '7d' }
  );
};

const register = async (req, res) => {
  try {
    const { email, password, businessName, name, username, role } = req.body;

    const resolvedBusinessName = businessName || name || username || 'Default Business';

    if (!email || !password) {
      return res.status(400).json({
        code: 400,
        status: 'failure',
        message: 'Поля email и password обязательны'
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

    // Безопасное получение ID (счетчик или UUID если счетчик недоступен)
    let generatedUserId;
    try {
      if (Counter) {
        const counter = await Counter.findByIdAndUpdate(
          { _id: 'userId' },
          { $inc: { seq: 1 } },
          { new: true, upsert: true }
        );
        generatedUserId = counter ? counter.seq : Date.now();
      } else {
        generatedUserId = Date.now();
      }
    } catch (cntErr) {
      generatedUserId = Date.now();
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      userId: generatedUserId,
      email: email.toLowerCase(),
      password: hashedPassword,
      businessName: resolvedBusinessName,
      role: role || 'owner'
    });

    const token = jwt.sign(
    { 
        userId: user.userId, 
        email: user.email, 
        role: user.role 
    },
    process.env.JWT_SECRET || 'fallback_secret_key',
    { expiresIn: '1d' }
    );

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
    console.error('REGISTER ERROR DETAILED:', error);
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
    console.error('LOGIN ERROR DETAILED:', error);
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