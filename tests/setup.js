// Выполняется ДО require('../app') в тестах (см. jest.setupFiles в package.json).
// app.js делает fail-fast проверку JWT_SECRET
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';
