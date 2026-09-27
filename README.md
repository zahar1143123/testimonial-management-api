# Testimonial Management API

REST API для сбора и управления пользовательскими отзывами (testimonials): жизненный цикл отзыва в виде state machine, мягкое удаление, шаринг в каналы, настройки формы сбора отзывов и базовая аналитика.

---

## Технологический стек

- **Node.js >= 20.19** (требование mongoose 9.x), **Express 5** — сервер и роутинг
- **MongoDB**, **Mongoose** — база данных и модели
- **JWT (jsonwebtoken)** — аутентификация
- **bcrypt** — хеширование паролей
- **express-rate-limit** — ограничение частоты запросов к auth-эндпоинтам и созданию отзывов
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

### Реализованные бонусы
-  Rate limiting на `/api/auth/register`, `/api/auth/login` и на создание отзывов (`POST /api/testimonials`)
-  Поиск отзывов (`/api/testimonials/search`) — по тексту, диапазону дат, диапазону рейтинга
-  Тесты — 56+ кейсов: auth и auth middleware, ownership, полный CRUD, soft delete, tampering-защита, полный жизненный цикл статусов и шаринг (включая конкурентные race condition сценарии), settings, аналитика, пагинация и поиск, валидация query-параметров, unit-тесты state machine (подробный список — в разделе «Отклонения и решения» ниже)

---

## Установка и запуск

```bash
git clone https://github.com/zahar1143123/testimonial-management-api.git
cd testimonial-management-api
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
| POST | `/` | Создать отзыв (статус по умолчанию `draft`), под rate limit |
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

- **`userId` — автоинкрементный `Number`, `testimonialId` — UUID `String`; оба используются как публичные идентификаторы вместо MongoDB `_id`** — `userId` генерируется через отдельную коллекцию `Counter` (атомарный `$inc`), `testimonialId` — `uuid()` при создании. Наружу (`toJSON`) `_id`/`__v` не отдаются вообще
- **Whitelisting полей на create/update** — клиент не может напрямую выставить `status`, `isDeleted`, `sharedChannels` через обычные `POST`/`PUT`, этим управляют отдельные эндпоинты (`/status`, `/share`, `DELETE`), чтобы нельзя было обойти state machine
- **Мягкое удаление** — все выборки фильтруют `isDeleted: false`
- **Owner-only доступ** — каждый эндпоинт с `:testimonialId` сверяет `testimonial.userId` с `userId` из токена, при несовпадении — 403
- **`PUT /:testimonialId` реализован как частичное обновление** — принимает и применяет только переданные поля (через тот же whitelist, что и создание), а не требует полного тела объекта. Формально `PUT` в HTTP подразумевает полную замену ресурса, но ТЗ описывает поведение как "обновление переданных полей", поэтому решение — сознательный компромисс в пользу удобства API, а не недосмотр
- **`409 Conflict`** используется только в одном месте — при конкурентной смене статуса (`PATCH /:testimonialId/status`), если между чтением и записью статус успел измениться в параллельном запросе (optimistic concurrency conflict). В списке HTTP-кодов из ТЗ его нет — это осознанное дополнение сверх минимальных требований, а не расхождение со спецификацией
- **Node.js >= 20.19 вместо заявленных в ТЗ "v16+"** — используемые версии `mongoose@9`, `express@5` и `bcrypt@6` фактически требуют более новый Node. Это сознательный выбор в пользу актуальных версий зависимостей (включая нужные для этого проекта возможности — pipeline-обновления `findOneAndUpdate`, `returnDocument` и т.д.), а не недосмотр; при необходимости строгой совместимости с Node 16 потребовался бы даунгрейд основных зависимостей до более старых major-версий
- **Пароль ограничен 72 байтами (UTF-8)** — это жёсткий лимит самого bcrypt: всё, что длиннее, при хешировании тихо отбрасывается. Регистрация/вход с более длинным паролем возвращают явную `400 ValidationError`, а не молча обрезают пароль
- **Частичное обновление вложенных настроек (`contactConsent`)** — `POST /settings` с `contactConsent: { enabled: false }` меняет только `enabled` и не затирает ранее сохранённый `text`; чтобы обновить `text`, его нужно передать явно (можно отдельно от `enabled`). Обновляются только явно переданные вложенные под-поля (`enabled`, `text`), полной замены объекта не происходит
- **Rate limit на создание отзывов считается по `userId`, а не по IP** — так несколько клиентов за одним NAT/офисным роутером не мешают друг другу; лимитер отключён в тестовом окружении (`NODE_ENV=test`), как и лимитер на auth-эндпоинтах
- **`videoUrl` валидируется как http(s) URL** — допускается пустая строка (видео ещё не записано) либо строка, начинающаяся с `http://`/`https://`; это отсекает мусорные значения и попытки записать что-то вроде `javascript:...`

---

## Исправления по итогам повторного ревью

По пунктам фидбека:

1. **Пагинация** — добавлен tie-breaker `_id` в `.sort()` списка и поиска: при одинаковых значениях сортируемого поля (например, у многих отзывов один и тот же `rating`) обход всех страниц больше не дублирует и не пропускает записи.
2. **Валидация и HTTP-коды** — `errorHandler` учитывает статус самой ошибки (не только `res.statusCode`), даты вроде `2025-13-01`/`2025-01-00` больше не роняют сервис в 500, `q`, переданный дважды (`?q=a&q=b`), отклоняется как `400`, а не ломает поиск; `register`/`login` не падают на отсутствующем теле запроса.
3. **Лимит пароля** — явная проверка на 72 байта (UTF-8) перед хешированием bcrypt.
4. **Зависимости/тесты** — версия `uuid` в `package.json` синхронизирована с той, что реально зафиксирована в `package-lock.json`; увеличен `testTimeout` под первый запуск `mongodb-memory-server`; хелпер поднятия тестовой БД освобождает уже поднятый `MongoMemoryServer`, даже если последующее подключение не удалось.
5. **JWT vs ошибки БД** — в `middleware/auth.js` проверка токена и обращение к БД разнесены на два `try/catch`: сбой БД теперь возвращает `5xx`, а не `401`.
6. **`contactConsent`** — обновляется по отдельным под-полям (dot-notation), а не полной заменой вложенного объекта (см. пункт выше в «Архитектурных решениях»).

Каждый пункт (кроме частично покрытого 4-го) закрыт отдельным регресс-тестом, воспроизводящим найденную проблему.

---

## О сдаче задания

- **Затраченное время:** 23 часа
- **Выполненные бонусы:** rate limiting (auth + создание отзывов), поиск (`/search`), тесты — 56+ кейсов: auth (включая деактивированный аккаунт, невалидный JWT), полный CRUD, ownership (403), soft delete, tampering-защита (whitelist полей), полный жизненный цикл статусов + шаринг, конкурентный status-transition (race condition), settings, analytics, пагинация, валидация query-параметров, unit-тесты чистой state machine
- **Что было бы сделано иначе при наличии большего времени:** расширить набор тестов (негативные сценарии на все эндпоинты, owner/security-тесты), вынести `testimonialController.js` на несколько контроллеров/сервис-слой, добавить массовое обновление статуса и экспорт в CSV
