require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoute');
const testimonialRoutes = require('./routes/testimonialRoute');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Fail-fast: без JWT_SECRET приложение подписывало бы токены общеизвестным
// значением по умолчанию — это критичная security-дыра, лучше не запускаться вовсе
if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required (set it in your .env file)');
}

// Подключаемся к реальной БД только если мы НЕ в режиме тестов
if (process.env.NODE_ENV !== 'test') {
  connectDB();
}

app.use(express.json());

// Маршруты API
app.use('/api/auth', authRoutes);
app.use('/api/testimonials', testimonialRoutes);

// Healthcheck
app.get('/health', (req, res) => {
  res.status(200).json({
    code: 200,
    status: 'success',
    message: 'Server is running'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    code: 404,
    status: 'failure',
    message: 'Эндпоинт не найден'
  });
});

// Глобальная обработка ошибок
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

// Запускаем listen только при обычном запуске сервера, а не во время Jest-тестов
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;