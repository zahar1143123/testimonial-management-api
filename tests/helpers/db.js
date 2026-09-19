// Общий хелпер поднятия/остановки in-memory MongoDB для интеграционных тестов.
// Каждый тестовый файл вызывает connectTestDB() в своём beforeAll и
// disconnectTestDB() в afterAll - так каждый файл получает СВОЮ изолированную
// базу (не делит состояние с другими *.test.js), а не только свои describe-блоки.
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

const connectTestDB = async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
};

const disconnectTestDB = async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
};

module.exports = { connectTestDB, disconnectTestDB };
