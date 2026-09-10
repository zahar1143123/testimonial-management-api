const errorHandler = (err, req, res, next) => {
  console.error(err.stack);

  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message || 'Внутренняя ошибка сервера';

  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map(val => val.message).join(', ');
  }

  if (err.code === 11000) {
    statusCode = 400;
    message = 'Запись с таким уникальным значением уже существует';
  }

  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Некорректный формат идентификатора';
  }

  return res.status(statusCode).json({
    code: statusCode,
    status: 'failure',
    message
  });
};

module.exports = errorHandler;