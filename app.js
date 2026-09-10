require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoute');
const testimonialRoutes = require('./routes/testimonialRoute');
const errorHandler = require('./middleware/errorHandler');

const app = express();

connectDB();

app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/testimonials', testimonialRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({
    code: 200,
    status: 'success',
    message: 'Server is running'
  });
});

app.use((req, res) => {
  res.status(404).json({
    code: 404,
    status: 'failure',
    message: 'Эндпоинт не найден'
  });
});

app.use(errorHandler);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});