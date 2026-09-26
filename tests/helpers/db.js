// Общий хелпер поднятия/остановки in-memory MongoDB для интеграционных тестов.
// Каждый тестовый файл вызывает connectTestDB() в своём beforeAll и
// disconnectTestDB() в afterAll - так каждый файл получает СВОЮ изолированную
// базу (не делит состояние с другими *.test.js), а не только свои describe-блоки.
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

const connectTestDB = async () => {
  mongoServer = await MongoMemoryServer.create();
  try {
    await mongoose.connect(mongoServer.getUri());
  } catch (error) {
    // FIX (ревью, п.4): если mongoose.connect() падает после того, как
    // MongoMemoryServer уже поднялся, старый код никогда не вызывал
    // mongoServer.stop() — процесс/данные утекали. Останавливаем то, что
    // успели создать, и только потом перебрасываем ошибку дальше.
    await mongoServer.stop();
    mongoServer = undefined;
    throw error;
  }
};

const disconnectTestDB = async () => {
  await mongoose.disconnect();
  // mongoServer может быть undefined, если connectTestDB упал до того, как
  // успел его создать/сохранить — тогда просто ничего не останавливаем.
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = undefined;
  }
};

module.exports = { connectTestDB, disconnectTestDB };
