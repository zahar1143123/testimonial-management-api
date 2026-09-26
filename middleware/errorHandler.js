const errorHandler = (err, req, res, next) => {
  console.error(err.stack);

  // FIX (ревью, п.2): раньше здесь смотрели только на res.statusCode, который
  // ещё не был установлен для ошибок body-parser (битый JSON -> 400,
  // превышение лимита -> 413) — они прилетают в errorHandler ДО того, как
  // кто-либо вызвал res.status(...), поэтому res.statusCode всё ещё 200,
  // и такие ошибки всегда сворачивались в 500. Теперь сначала смотрим на
  // собственный статус ошибки (err.status/err.statusCode — стандартные поля
  // у ошибок Express/body-parser/http-errors).
  let statusCode = err.status || err.statusCode || (res.statusCode !== 200 ? res.statusCode : 500);
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

  // Непредвиденные 5xx не должны отдавать клиенту технические подробности
  // (стек уже ушёл в console.error выше) — иначе в ответе всплывают
  // сообщения вроде "str.replace is not a function".
  if (statusCode >= 500) {
    message = 'Внутренняя ошибка сервера';
  }

  return res.status(statusCode).json({
    code: statusCode,
    status: 'failure',
    message
  });
};

module.exports = errorHandler;