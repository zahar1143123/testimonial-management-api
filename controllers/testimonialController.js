const { Testimonial, TESTIMONIAL_STATUSES } = require('../models/testimonial');
const TestimonialSettings = require('../models/testimonialSettings');
const { v4: uuidv4 } = require('uuid');
const { ALLOWED_STATUS_TRANSITIONS, ALLOWED_SHARE_CHANNELS } = require('../lib/constants');

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

const parseDateParam = (value, { endOfDay = false } = {}) => {
  if (value === undefined) return { value: undefined };
  const normalized = endOfDay ? toEndOfDayIfDateOnly(value) : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return { error: `Некорректная дата: ${value}` };
  }
  return { value: date };
};

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const createTestimonial = async (req, res, next) => {
  try {
    const rawUserId = getUserIdFromReq(req);

    if (!rawUserId) {
      return res.status(401).json({
        code: 401,
        status: 'failure',
        message: 'Не авторизован: ID пользователя не найден в токене'
      });
    }

    const userId = Number(rawUserId);

    const testimonial = await Testimonial.create({
      ...pickAllowedFields(req.body),
      userId,
      testimonialId: uuidv4()
    });

    return res.status(201).json({
      code: 201,
      status: 'success',
      message: 'Отзыв успешно создан',
      data: testimonial
    });
  } catch (error) {
    return next(error);
  }
};

const getTestimonials = async (req, res, next) => {
  try {
    const rawUserId = getUserIdFromReq(req);
    const { status } = req.query;

    const parsed = parseListQuery(req.query);
    if (parsed.error) {
      return res.status(400).json({ code: 400, status: 'failure', message: parsed.error });
    }
    const { pageNum, limitNum, sort } = parsed;

    const query = {
      userId: Number(rawUserId),
      isDeleted: false
    };

    if (status) {
      query.status = status;
    }

    const skip = (pageNum - 1) * limitNum;

    const total = await Testimonial.countDocuments(query);
    const testimonials = await Testimonial.find(query)
      .sort({ [sort]: -1 })
      .skip(skip)
      .limit(limitNum);

    return res.status(200).json({
      code: 200,
      status: 'success',
      message: 'Данные успешно получены',
      data: testimonials,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum) || 1
      }
    });
  } catch (error) {
    return next(error);
  }
};

const getTestimonialById = async (req, res, next) => {
  try {
    const currentUserId = Number(getUserIdFromReq(req));
    const testimonial = await Testimonial.findOne({
      testimonialId: req.params.testimonialId,
      isDeleted: false
    });

    if (!testimonial) {
      return res.status(404).json({
        code: 404,
        status: 'failure',
        message: 'Отзыв не найден'
      });
    }

    if (testimonial.userId !== currentUserId) {
      return res.status(403).json({
        code: 403,
        status: 'failure',
        message: 'Доступ запрещен: вы не являетесь владельцем этого отзыва'
      });
    }

    return res.status(200).json({
      code: 200,
      status: 'success',
      message: 'Отзыв успешно найден',
      data: testimonial
    });
  } catch (error) {
    return next(error);
  }
};

const updateTestimonial = async (req, res, next) => {
  try {
    const currentUserId = Number(getUserIdFromReq(req));
    const testimonial = await Testimonial.findOne({
      testimonialId: req.params.testimonialId,
      isDeleted: false
    });

    if (!testimonial) {
      return res.status(404).json({
        code: 404,
        status: 'failure',
        message: 'Отзыв не найден'
      });
    }

    if (testimonial.userId !== currentUserId) {
      return res.status(403).json({
        code: 403,
        status: 'failure',
        message: 'Доступ запрещен'
      });
    }

    const updated = await Testimonial.findOneAndUpdate(
      { testimonialId: req.params.testimonialId },
      { $set: pickAllowedFields(req.body) },
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      code: 200,
      status: 'success',
      message: 'Отзыв успешно обновлен',
      data: updated
    });
  } catch (error) {
    return next(error);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const { status: nextStatus } = req.body;
    const currentUserId = Number(getUserIdFromReq(req));

    if (!nextStatus) {
      return res.status(400).json({
        code: 400,
        status: 'failure',
        message: 'Укажите новый status в теле запроса'
      });
    }

    const testimonial = await Testimonial.findOne({
      testimonialId: req.params.testimonialId,
      isDeleted: false
    });

    if (!testimonial) {
      return res.status(404).json({
        code: 404,
        status: 'failure',
        message: 'Отзыв не найден'
      });
    }

    if (testimonial.userId !== currentUserId) {
      return res.status(403).json({
        code: 403,
        status: 'failure',
        message: 'Доступ запрещен'
      });
    }

    const currentStatus = testimonial.status;

    // Проверка допустимости перехода по State Machine.
    // Важно: same-state переход (например draft -> draft) НЕ считается
    // допустимым просто потому что "ничего не меняется" — ТЗ описывает
    // строго определённую цепочку переходов, и same-state в неё не входит.
    const allowedNextStatus = ALLOWED_STATUS_TRANSITIONS[currentStatus];
    const isAllowed = Array.isArray(allowedNextStatus)
      ? allowedNextStatus.includes(nextStatus)
      : allowedNextStatus === nextStatus;

    if (!isAllowed) {
      return res.status(400).json({
        code: 400,
        status: 'failure',
        message: `Cannot transition from ${currentStatus} to ${nextStatus}`
      });
    }

    testimonial.status = nextStatus;
    if (nextStatus === 'shared') {
      testimonial.sharedAt = new Date();
    }

    await testimonial.save();

    return res.status(200).json({
      code: 200,
      status: 'success',
      message: 'Статус отзыва успешно обновлен',
      data: testimonial
    });
  } catch (error) {
    return next(error);
  }
};

const deleteTestimonial = async (req, res, next) => {
  try {
    const currentUserId = Number(getUserIdFromReq(req));
    const testimonial = await Testimonial.findOne({
      testimonialId: req.params.testimonialId,
      isDeleted: false
    });

    if (!testimonial) {
      return res.status(404).json({
        code: 404,
        status: 'failure',
        message: 'Отзыв не найден'
      });
    }

    if (testimonial.userId !== currentUserId) {
      return res.status(403).json({
        code: 403,
        status: 'failure',
        message: 'Доступ запрещен'
      });
    }

    testimonial.isDeleted = true;
    testimonial.deletedAt = new Date();
    await testimonial.save();

    return res.status(200).json({
      code: 200,
      status: 'success',
      message: 'Отзыв успешно удален',
      data: {}
    });
  } catch (error) {
    return next(error);
  }
};

const shareTestimonial = async (req, res, next) => {
  try {
    const { channels } = req.body;
    const currentUserId = Number(getUserIdFromReq(req));

    if (!channels || !Array.isArray(channels) || channels.length === 0) {
      return res.status(400).json({
        code: 400,
        status: 'failure',
        message: 'Передайте массив channels'
      });
    }

    const invalidChannels = channels.filter(
      (ch) => !ALLOWED_SHARE_CHANNELS.includes(ch)
    );
    if (invalidChannels.length > 0) {
      return res.status(400).json({
        code: 400,
        status: 'failure',
        message: `Недопустимые каналы: ${invalidChannels.join(', ')}`
      });
    }

    const testimonial = await Testimonial.findOne({
      testimonialId: req.params.testimonialId,
      isDeleted: false
    });

    if (!testimonial) {
      return res.status(404).json({
        code: 404,
        status: 'failure',
        message: 'Отзыв не найден'
      });
    }

    if (testimonial.userId !== currentUserId) {
      return res.status(403).json({
        code: 403,
        status: 'failure',
        message: 'Доступ запрещен'
      });
    }

    // Шарить можно только готовый отзыв — иначе клиент мог бы разослать
    // клиенту ссылку на ещё не записанный/не обработанный черновик
    if (!['completed', 'shared'].includes(testimonial.status)) {
      return res.status(400).json({
        code: 400,
        status: 'failure',
        message: `Нельзя поделиться отзывом в статусе "${testimonial.status}" — сначала переведите его в "completed"`
      });
    }

    const updatedChannels = Array.from(
      new Set([...(testimonial.sharedChannels || []), ...channels])
    );
    testimonial.sharedChannels = updatedChannels;

    if (testimonial.status === 'completed') {
      testimonial.status = 'shared';
    }

    if (!testimonial.sharedAt) {
      testimonial.sharedAt = new Date();
    }

    await testimonial.save();

    return res.status(200).json({
      code: 200,
      status: 'success',
      message: 'Шаринг отзыва успешно записан',
      data: testimonial
    });
  } catch (error) {
    return next(error);
  }
};

const getSettings = async (req, res, next) => {
  try {
    const userId = Number(getUserIdFromReq(req));
    const settings = await TestimonialSettings.findOne({ userId });

    return res.status(200).json({
      code: 200,
      status: 'success',
      message: 'Настройки успешно получены',
      data: settings || null
    });
  } catch (error) {
    return next(error);
  }
};

const upsertSettings = async (req, res, next) => {
  try {
    const userId = Number(getUserIdFromReq(req));
    const settings = await TestimonialSettings.findOneAndUpdate(
      { userId },
      { $set: { ...pickSettingsFields(req.body), userId } },
      { new: true, upsert: true, runValidators: true }
    );

    return res.status(200).json({
      code: 200,
      status: 'success',
      message: 'Настройки успешно сохранены',
      data: settings
    });
  } catch (error) {
    return next(error);
  }
};

const getAnalytics = async (req, res, next) => {
  try {
    const userId = Number(getUserIdFromReq(req));
    const { startDate, endDate } = req.query;

    const start = parseDateParam(startDate);
    if (start.error) {
      return res.status(400).json({ code: 400, status: 'failure', message: start.error });
    }
    const end = parseDateParam(endDate, { endOfDay: true });
    if (end.error) {
      return res.status(400).json({ code: 400, status: 'failure', message: end.error });
    }
    if (start.value && end.value && start.value > end.value) {
      return res.status(400).json({
        code: 400,
        status: 'failure',
        message: 'startDate не может быть позже endDate'
      });
    }

    const matchStage = {
      userId,
      isDeleted: false
    };

    if (start.value || end.value) {
      matchStage.createdAt = {};
      if (start.value) matchStage.createdAt.$gte = start.value;
      if (end.value) matchStage.createdAt.$lte = end.value;
    }

    const stats = await Testimonial.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const total = await Testimonial.countDocuments(matchStage);

    const overallRatingResult = await Testimonial.aggregate([
      { $match: { ...matchStage, rating: { $exists: true, $ne: null } } },
      { $group: { _id: null, averageRating: { $avg: '$rating' } } }
    ]);

    const averageRating =
      overallRatingResult.length > 0
        ? Number(overallRatingResult[0].averageRating.toFixed(1))
        : 0;

    const byStatus = {
      draft: 0,
      recording: 0,
      processing: 0,
      completed: 0,
      shared: 0
    };

    stats.forEach((item) => {
      if (Object.prototype.hasOwnProperty.call(byStatus, item._id)) {
        byStatus[item._id] = item.count;
      }
    });

    return res.status(200).json({
      code: 200,
      status: 'success',
      message: 'Аналитика успешно получена',
      data: {
        overview: {
          total,
          byStatus,
          averageRating
        },
        period: {
          startDate: start.value ? start.value.toISOString() : null,
          endDate: end.value ? end.value.toISOString() : null
        }
      }
    });
  } catch (error) {
    return next(error);
  }
};

const MAX_SEARCH_QUERY_LENGTH = 200;

const searchTestimonials = async (req, res, next) => {
  try {
    const userId = Number(getUserIdFromReq(req));
    const { q, createdAfter, createdBefore, minRating, maxRating } = req.query;

    const parsed = parseListQuery(req.query);
    if (parsed.error) {
      return res.status(400).json({ code: 400, status: 'failure', message: parsed.error });
    }
    const { pageNum, limitNum, sort } = parsed;

    if (q && q.length > MAX_SEARCH_QUERY_LENGTH) {
      return res.status(400).json({
        code: 400,
        status: 'failure',
        message: `q не должен превышать ${MAX_SEARCH_QUERY_LENGTH} символов`
      });
    }

    const after = parseDateParam(createdAfter);
    if (after.error) {
      return res.status(400).json({ code: 400, status: 'failure', message: after.error });
    }
    const before = parseDateParam(createdBefore, { endOfDay: true });
    if (before.error) {
      return res.status(400).json({ code: 400, status: 'failure', message: before.error });
    }
    if (after.value && before.value && after.value > before.value) {
      return res.status(400).json({
        code: 400,
        status: 'failure',
        message: 'createdAfter не может быть позже createdBefore'
      });
    }

    const query = {
      userId,
      isDeleted: false
    };

    if (q) {
      // Экранируем спецсимволы, чтобы пользовательский текст нельзя было
      // использовать как произвольное regex-выражение
      const safe = escapeRegex(q);
      query.$or = [
        { customerName: { $regex: safe, $options: 'i' } },
        { text: { $regex: safe, $options: 'i' } }
      ];
    }

    if (after.value || before.value) {
      query.createdAt = {};
      if (after.value) query.createdAt.$gte = after.value;
      if (before.value) query.createdAt.$lte = before.value;
    }

    if (minRating || maxRating) {
      query.rating = {};
      if (minRating) query.rating.$gte = Number(minRating);
      if (maxRating) query.rating.$lte = Number(maxRating);
    }

    const skip = (pageNum - 1) * limitNum;

    const total = await Testimonial.countDocuments(query);
    const testimonials = await Testimonial.find(query)
      .sort({ [sort]: -1 })
      .skip(skip)
      .limit(limitNum);

    return res.status(200).json({
      code: 200,
      status: 'success',
      message: 'Результаты поиска успешно получены',
      data: testimonials,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum) || 1
      }
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createTestimonial,
  getTestimonials,
  getTestimonialById,
  updateTestimonial,
  updateStatus,
  deleteTestimonial,
  shareTestimonial,
  getSettings,
  upsertSettings,
  getAnalytics,
  searchTestimonials
};
