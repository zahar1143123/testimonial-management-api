// Сервисный слой: чистая, переиспользуемая логика без обращения к req/res.
// Импортируется всеми тремя testimonial-контроллерами, чтобы не дублировать
// одни и те же правила (whitelist полей, валидация query, state machine) в каждом.

const { TESTIMONIAL_STATUSES } = require('../models/testimonial');
const { ALLOWED_STATUS_TRANSITIONS } = require('../lib/constants');

const getUserIdFromReq = (req) => req.user?.userId;

const ALLOWED_WRITE_FIELDS = [
  'customerName',
  'customerEmail',
  'customerPhone',
  'videoUrl',
  'rating',
  'text',
  'consentGiven'
];

const pickAllowedFields = (body = {}) =>
  ALLOWED_WRITE_FIELDS.reduce((acc, key) => {
    if (body[key] !== undefined) acc[key] = body[key];
    return acc;
  }, {});

const SETTINGS_WRITE_FIELDS = [
  'isEnabled',
  'defaultVideoLength',
  'videoLengthOptions',
  'questionnaire',
  'sendingOptions',
  'thankYouMessage',
  'contactConsent'
];

const pickSettingsFields = (body = {}) =>
  SETTINGS_WRITE_FIELDS.reduce((acc, key) => {
    if (body[key] !== undefined) acc[key] = body[key];
    return acc;
  }, {});

const SORT_FIELDS = ['createdAt', 'updatedAt', 'rating', 'customerName'];
const MAX_LIMIT = 100;

// Общая валидация page/limit/status/sort для списков и поиска.
// Возвращает { error: 'сообщение' } либо { pageNum, limitNum, sort }.
const parseListQuery = ({ page = 1, limit = 10, sort = 'createdAt', status }) => {
  const pageNum = Number(page);
  const limitNum = Number(limit);

  if (!Number.isInteger(pageNum) || pageNum < 1) {
    return { error: 'page должен быть целым числом >= 1' };
  }
  if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > MAX_LIMIT) {
    return { error: `limit должен быть целым числом от 1 до ${MAX_LIMIT}` };
  }
  if (!SORT_FIELDS.includes(sort)) {
    return { error: `sort должен быть одним из: ${SORT_FIELDS.join(', ')}` };
  }
  if (status !== undefined && !TESTIMONIAL_STATUSES.includes(status)) {
    return { error: `status должен быть одним из: ${TESTIMONIAL_STATUSES.join(', ')}` };
  }

  return { pageNum, limitNum, sort };
};

// Дата-only строка вида "2025-12-31" трактуется JS как начало дня (00:00:00 UTC).
// Для конца периода это обрезает весь последний день — нормализуем явно.
const toEndOfDayIfDateOnly = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59.999Z` : value;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const parseDateParam = (value, { endOfDay = false } = {}) => {
  if (value === undefined) return { value: undefined };

  // JS Date не проверяет календарную корректность: new Date('2025-02-30')
  // не даёт Invalid Date, а тихо "перекатывается" на 2025-03-02
  if (DATE_ONLY_PATTERN.test(value)) {
    const asDate = new Date(`${value}T00:00:00.000Z`);
    if (asDate.toISOString().slice(0, 10) !== value) {
      return { error: `Некорректная календарная дата: ${value}` };
    }
  }

  const normalized = endOfDay ? toEndOfDayIfDateOnly(value) : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return { error: `Некорректная дата: ${value}` };
  }
  return { value: date };
};

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Валидация minRating/maxRating для поиска. Оба опциональны, но если заданы —
// должны быть числами 1-5 (та же граница, что и в схеме Testimonial.rating),
// и min не может быть больше max.
const parseRatingRange = (minRating, maxRating) => {
  const min = minRating !== undefined ? Number(minRating) : undefined;
  const max = maxRating !== undefined ? Number(maxRating) : undefined;

  if (min !== undefined && (!Number.isFinite(min) || min < 1 || min > 5)) {
    return { error: 'minRating должен быть числом от 1 до 5' };
  }
  if (max !== undefined && (!Number.isFinite(max) || max < 1 || max > 5)) {
    return { error: 'maxRating должен быть числом от 1 до 5' };
  }
  if (min !== undefined && max !== undefined && min > max) {
    return { error: 'minRating не может быть больше maxRating' };
  }

  return { min, max };
};

// State machine — чистая функция, легко unit-тестируется без БД и без Express:
// isValidStatusTransition('draft', 'recording') === true
// isValidStatusTransition('draft', 'draft') === false (same-state запрещён)
const isValidStatusTransition = (currentStatus, nextStatus) => {
  const allowedNextStatus = ALLOWED_STATUS_TRANSITIONS[currentStatus];
  return Array.isArray(allowedNextStatus)
    ? allowedNextStatus.includes(nextStatus)
    : allowedNextStatus === nextStatus;
};

module.exports = {
  getUserIdFromReq,
  pickAllowedFields,
  pickSettingsFields,
  parseListQuery,
  parseDateParam,
  escapeRegex,
  parseRatingRange,
  isValidStatusTransition,
  SORT_FIELDS,
  MAX_LIMIT
};
