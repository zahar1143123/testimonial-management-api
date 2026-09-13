# Testimonial Management API

REST API для сбора и управления пользовательскими отзывами (testimonials): жизненный цикл отзыва в виде state machine, мягкое удаление, шаринг в каналы, настройки формы сбора отзывов и базовая аналитика.

---

## Технологический стек

- **Node.js**, **Express 5** — сервер и роутинг
- **MongoDB**, **Mongoose** — база данных и модели
- **JWT (jsonwebtoken)** — аутентификация
- **bcrypt** — хеширование паролей
- **express-rate-limit** — ограничение частоты запросов к auth-эндпоинтам
- **Jest**, **Supertest**, **mongodb-memory-server** — тесты
- **dotenv** — переменные окружения

---

## Функциональность

### Основной функционал
- Регистрация и вход по email/паролю, JWT-токен, middleware `protect` для защищённых роутов
- CRUD отзывов с проверкой владельца ресурса (403, если отзыв принадлежит другому пользователю)
- **State machine** статуса отзыва: `draft → recording → processing → completed → shared` (переход возможен только на следующий шаг цепочки)
- **Мягкое удаление** — `DELETE` не стирает документ, а проставляет `isDeleted: true` / `deletedAt`, запись пропадает из выдачи
- **Шаринг** отзыва в каналы (`email`, `sms`, `facebook`, `instagram`) — доступен только для отзывов в статусе `completed`/`shared`
- **Настройки** формы сбора отзывов на пользователя (`TestimonialSettings`)
- **Аналитика** — количество отзывов по статусам и средний рейтинг

### Выполненные бонусы
-  Rate limiting на `/api/auth/register` и `/api/auth/login`
-  Поиск отзывов (`/api/testimonials/search`) — по тексту, диапазону дат, диапазону рейтинга
-  Тесты (auth, auth middleware, создание отзыва, переходы статуса)

---

## Установка и запуск

```bash
git clone <URL_ВАШЕГО_РЕПОЗИТОРИЯ>
cd testimonial-api
npm install
```

Скопируйте `.env.example` в `.env` и заполните значениями:

```bash
cp .env.example .env
```

```
PORT=3000
MONGODB_URI=mongodb://localhost:27017/testimonial_db
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRY=7d
```

Запуск:

```bash
npm run dev     # с nodemon, для разработки
npm start        # обычный запуск
npm test         # прогон тестов (Jest + mongodb-memory-server, поднимается своя in-memory БД)
```

---

## API

Формат ответа везде единый:
```json
{ "code": 200, "status": "success", "message": "...", "data": { } }
```
При ошибке: `"status": "failure"`, `data` отсутствует, есть `message`.

### Auth — `/api/auth` (без токена, под rate limit)

| Метод | Путь | Описание |
|---|---|---|
| POST | `/register` | Регистрация. Обязательны `email`, `password`, `businessName` |
| POST | `/login` | Вход, возвращает JWT |

### Testimonials — `/api/testimonials` (нужен заголовок `Authorization: Bearer <token>`)

| Метод | Путь | Описание |
|---|---|---|
| POST | `/` | Создать отзыв (статус по умолчанию `draft`) |
| GET | `/` | Список своих отзывов: `?status=&page=&limit=&sort=` |
| GET | `/search` | Поиск: `?q=&createdAfter=&createdBefore=&minRating=&maxRating=&page=&limit=&sort=` |
| GET | `/analytics` | Статистика по статусам и средний рейтинг: `?startDate=&endDate=` |
| GET | `/settings` | Настройки формы сбора отзывов текущего пользователя |
| POST | `/settings` | Создать/обновить настройки (upsert) |
| GET | `/:testimonialId` | Получить один отзыв по id |
| PUT | `/:testimonialId` | Обновить данные отзыва (`customerName`, `customerEmail`, `customerPhone`, `videoUrl`, `rating`, `text`, `consentGiven`) |
| DELETE | `/:testimonialId` | Мягкое удаление |
| PATCH | `/:testimonialId/status` | Сменить статус по state machine |
| POST | `/:testimonialId/share` | Расшарить в каналы (только для `completed`/`shared`) |

---

## Примеры запросов

**Регистрация**
```
POST /api/auth/register
{
  "email": "owner@example.com",
  "password": "secret123",
  "businessName": "My Business"
}
```
```json
{
  "code": 201,
  "status": "success",
  "message": "Пользователь успешно зарегистрирован",
  "data": {
    "user": { "userId": 1, "email": "owner@example.com", "businessName": "My Business", "role": "owner" },
    "token": "<jwt>"
  }
}
```

**Смена статуса**
```
PATCH /api/testimonials/<testimonialId>/status
{ "status": "recording" }
```
```json
{
  "code": 200,
  "status": "success",
  "message": "Статус отзыва успешно обновлен",
  "data": { "testimonialId": "...", "status": "recording", "customerName": "Иван Иванов" }
}
```

**Невалидный переход статуса**
```
PATCH /api/testimonials/<testimonialId>/status
{ "status": "shared" }
```
```json
{
  "code": 400,
  "status": "failure",
  "message": "Cannot transition from recording to shared"
}
```

---

## Архитектурные решения

- **Числовой `userId`/`testimonialId` вместо `_id`** — `userId` автоинкрементится через отдельную коллекцию `Counter`, `testimonialId` — UUID; наружу отдаются понятные идентификаторы вместо ObjectId
- **Whitelisting полей на create/update** — клиент не может напрямую выставить `status`, `isDeleted`, `sharedChannels` через обычные `POST`/`PUT`, этим управляют отдельные эндпоинты (`/status`, `/share`, `DELETE`), чтобы нельзя было обойти state machine
- **Мягкое удаление** — все выборки фильтруют `isDeleted: false`
- **Owner-only доступ** — каждый эндпоинт с `:testimonialId` сверяет `testimonial.userId` с `userId` из токена, при несовпадении — 403
