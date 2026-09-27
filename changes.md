## Что сделано

Исправления по фидбеку повторного ревью (пункты 1–6), плюс два
дополнительных улучшения сверх требований.

### 1. Пагинация
**Причина:** `.sort({ [sort]: -1 })` без tie-breaker — при одинаковых
значениях сортируемого поля (например, у многих отзывов один и тот же
`rating`) MongoDB не гарантирует стабильный порядок между отдельными
запросами `find()`. Обход всех страниц дублировал/пропускал записи.
**Решение:** добавлен `_id: -1` вторым полем сортировки в списке и поиске
отзывов.
**Тест:** `tests/regression-pagination.test.js`.

### 2. Валидация запросов и HTTP-коды ошибок
**Причина:** четыре независимые причины 500 вместо 4xx — `errorHandler`
игнорировал `err.status`/`err.statusCode` (ошибки body-parser: битый
JSON → 400, превышение лимита → 413); `parseDateParam` бросал
необработанный `RangeError` на датах вроде `2025-13-01`; `q`, переданный
дважды (`?q=a&q=b`), ломал `escapeRegex`; `register`/`login` падали на
отсутствующем теле запроса.
**Решение:** `errorHandler` теперь смотрит на статус самой ошибки;
`parseDateParam` проверяет `Number.isNaN` перед `.toISOString()`;
добавлена проверка `typeof q === 'string'`; `req.body` защищён от
`undefined`.
**Тест:** `tests/regression-validation.test.js`.

### 3. Лимит bcrypt на 72 байта
**Причина:** bcrypt использует только первые 72 байта пароля — всё, что
дальше, тихо отбрасывается при хешировании.
**Решение:** явная проверка `Buffer.byteLength(password, 'utf8') > 72`
перед хешированием, с понятной `ValidationError`.
**Тест:** `tests/regression-password-length.test.js`.

### 4. Lock-файл и чистый запуск тестов
**Причина:** `package.json` требовал `uuid@^11.1.1`, а
`package-lock.json` был зафиксирован на `uuid@9.0.1` → `npm ci` падал.
**Решение:** версия `uuid` в `package.json` синхронизирована с
`package-lock.json`; увеличен `testTimeout` под первый запуск
`mongodb-memory-server`; хелпер поднятия тестовой БД освобождает уже
поднятый `MongoMemoryServer` при ошибке подключения.
**Тест:** не покрыт отдельным regression-тестом (конфигурация
npm/CI, не поведение API) — проверяется прогоном `npm ci && npm test`
из чистого клона (см. ниже).

### 5. JWT vs ошибки БД
**Причина:** в `middleware/auth.js` `jwt.verify()` и `User.findOne()`
были в одном `try/catch` — ошибка БД маскировалась под `401
"недействительный токен"`.
**Решение:** разнесены на два `try/catch`: ошибка JWT → 401, ошибка БД →
`next(error)` → общий `errorHandler` → 5xx.
**Тест:** `tests/regression-auth-db-error.test.js`.

### 6. Частичное обновление `contactConsent`
**Причина:** `$set` подставлял `contactConsent` целиком объектом — Mongo
заменял вложенный документ полностью, `{ enabled: false }` стирал ранее
сохранённый `text`.
**Решение:** `contactConsent` обновляется по отдельным dot-notation
путям (`contactConsent.enabled`, `contactConsent.text`).
**Тест:** дополнение в `tests/testimonial-settings.test.js`.

### Дополнительно (сверх фидбека)
- Rate limit на `POST /api/testimonials` (по `userId`, 30/час) —
  защита от спама/абьюза создания отзывов.
- Валидация `videoUrl` как http(s) URL.

## Результат чистого запуска

```
Node.js: v24.14.0

$ npm ci
npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.
npm warn deprecated glob@7.2.3: Old versions of glob are not supported, and contain widely publicized security vulnerabilities, which have been fixed in the current version. Please update. Support for old versions may be purchased (at exorbitant rates) by contacting i@izs.me
npm warn deprecated uuid@9.0.1: uuid@10 and below is no longer supported.  For ESM codebases, update to uuid@latest.  For CommonJS codebases, use uuid@11 (but be aware this version will likely be deprecated in 2028).

added 434 packages, and audited 435 packages in 2m

74 packages are looking for funding
  run `npm fund` for details

1 moderate severity vulnerability

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.


$ npm test
Test Suites: 10 passed, 10 total
Tests:       90 passed, 90 total
Snapshots:   0 total
Time:        13.741 s
Ran all test suites.
```

## README

Обновлён раздел «Исправления по итогам повторного ревью» и
«Архитектурные решения» — описано уточнённое поведение API (лимит
пароля, partial `contactConsent`, rate limit на создание отзывов,
`videoUrl`).
