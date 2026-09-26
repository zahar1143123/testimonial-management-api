const { Testimonial } = require('../models/testimonial');
const { v4: uuidv4 } = require('uuid');
const { ALLOWED_SHARE_CHANNELS } = require('../lib/constants');
const {
  getUserIdFromReq,
  pickAllowedFields,
  parseListQuery,
  isValidStatusTransition
} = require('../services/testimonialService');

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
    // FIX (ревью, п.1): без tie-breaker по _id порядок документов с
    // одинаковым значением sort-поля не гарантирован между запросами —
    // обход всех страниц дублирует/пропускает записи.
    const testimonials = await Testimonial.find(query)
      .sort({ [sort]: -1, _id: -1 })
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
        pages: Math.ceil(total / limitNum)
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

    const fieldsToUpdate = pickAllowedFields(req.body);
    if (Object.keys(fieldsToUpdate).length === 0) {
      return res.status(400).json({
        code: 400,
        status: 'failure',
        message: 'Укажите хотя бы одно поле для обновления'
      });
    }

    // Мутируем уже полученный документ и сохраняем его же, а не запускаем
    // вторую отдельную findOneAndUpdate-операцию по тому же testimonialId.
    Object.assign(testimonial, fieldsToUpdate);
    await testimonial.save();

    return res.status(200).json({
      code: 200,
      status: 'success',
      message: 'Отзыв успешно обновлен',
      data: testimonial
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

    // Проверка допустимости перехода вынесена в services/testimonialService.js —
    // same-state переход (например draft -> draft) НЕ считается допустимым.
    if (!isValidStatusTransition(currentStatus, nextStatus)) {
      return res.status(400).json({
        code: 400,
        status: 'failure',
        message: `Cannot transition from ${currentStatus} to ${nextStatus}`
      });
    }

    const update = { status: nextStatus };
    if (nextStatus === 'shared') {
      update.sharedAt = new Date();
    }
    
    const updated = await Testimonial.findOneAndUpdate(
      {
        testimonialId: req.params.testimonialId,
        userId: currentUserId,
        status: currentStatus,
        isDeleted: false
      },
      { $set: update },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(409).json({
        code: 409,
        status: 'failure',
        message: 'Статус отзыва уже был изменён параллельным запросом — повторите попытку'
      });
    }

    return res.status(200).json({
      code: 200,
      status: 'success',
      message: 'Статус отзыва успешно обновлен',
      data: updated
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

    // Атомарное обновление через aggregation-pipeline update: объединение
    // каналов ($setUnion) и условный переход статуса/sharedAt ($cond)
    // выполняются одной неделимой операцией на стороне MongoDB. При двух
    // параллельных share-запросах с разными каналами (email vs facebook)
    // оба набора гарантированно сохранятся — раньше здесь был обычный
    // findOne -> мутация -> save(), где второй save() мог молча
    // перезаписать результат первого (та же гонка, что чинили в updateStatus).
    const updated = await Testimonial.findOneAndUpdate(
      {
        testimonialId: req.params.testimonialId,
        userId: currentUserId,
        isDeleted: false,
        status: { $in: ['completed', 'shared'] }
      },
      [
        {
          $set: {
            sharedChannels: { $setUnion: ['$sharedChannels', channels] },
            status: {
              $cond: [{ $eq: ['$status', 'completed'] }, 'shared', '$status']
            },
            sharedAt: {
              $cond: [{ $eq: ['$sharedAt', null] }, '$$NOW', '$sharedAt']
            }
          }
        }
      ],
      { returnDocument: 'after', updatePipeline: true }
    );

    if (!updated) {
      return res.status(409).json({
        code: 409,
        status: 'failure',
        message: 'Отзыв изменился между проверкой и сохранением — повторите попытку'
      });
    }

    return res.status(200).json({
      code: 200,
      status: 'success',
      message: 'Шаринг отзыва успешно записан',
      data: updated
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
  shareTestimonial
};
