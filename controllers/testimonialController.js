const { Testimonial } = require('../models/testimonial');
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

const createTestimonial = async (req, res) => {
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
      data: testimonial
    });
  } catch (error) {
    console.error('Create testimonial error:', error.message);
    return res.status(500).json({
      code: 500,
      status: 'failure',
      message: error.message || 'Ошибка при создании отзыва'
    });
  }
};

const getTestimonials = async (req, res) => {
  try {
    const rawUserId = getUserIdFromReq(req);
    const { status, page = 1, limit = 10, sort = 'createdAt' } = req.query;

    const query = {
      userId: Number(rawUserId),
      isDeleted: false
    };

    if (status) {
      query.status = status;
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
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
    return res.status(500).json({
      code: 500,
      status: 'failure',
      message: error.message || 'Ошибка при получении отзывов'
    });
  }
};

const getTestimonialById = async (req, res) => {
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
    return res.status(500).json({
      code: 500,
      status: 'failure',
      message: error.message || 'Ошибка при получении отзыва'
    });
  }
};

const updateTestimonial = async (req, res) => {
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
    return res.status(500).json({
      code: 500,
      status: 'failure',
      message: error.message || 'Ошибка при обновлении отзыва'
    });
  }
};

const updateStatus = async (req, res) => {
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

    // Проверка допустимости перехода по State Machine
    if (currentStatus !== nextStatus) {
      const allowed = ALLOWED_STATUS_TRANSITIONS[currentStatus];
      const isAllowed = Array.isArray(allowed)
        ? allowed.includes(nextStatus)
        : allowed === nextStatus;

      if (!isAllowed) {
        return res.status(400).json({
          code: 400,
          status: 'failure',
          message: `Cannot transition from ${currentStatus} to ${nextStatus}`
        });
      }
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
    return res.status(500).json({
      code: 500,
      status: 'failure',
      message: error.message || 'Ошибка при обновлении статуса'
    });
  }
};

const deleteTestimonial = async (req, res) => {
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
    return res.status(500).json({
      code: 500,
      status: 'failure',
      message: error.message || 'Ошибка при удалении отзыва'
    });
  }
};

const shareTestimonial = async (req, res) => {
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
    return res.status(500).json({
      code: 500,
      status: 'failure',
      message: error.message || 'Ошибка при шаринге отзыва'
    });
  }
};

const getSettings = async (req, res) => {
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
    return res.status(500).json({
      code: 500,
      status: 'failure',
      message: error.message || 'Ошибка при получении настроек'
    });
  }
};

const upsertSettings = async (req, res) => {
  try {
    const userId = Number(getUserIdFromReq(req));
    const settings = await TestimonialSettings.findOneAndUpdate(
      { userId },
      { $set: { ...req.body, userId } },
      { new: true, upsert: true, runValidators: true }
    );

    return res.status(200).json({
      code: 200,
      status: 'success',
      message: 'Настройки успешно сохранены',
      data: settings
    });
  } catch (error) {
    return res.status(500).json({
      code: 500,
      status: 'failure',
      message: error.message || 'Ошибка при сохранении настроек'
    });
  }
};

const getAnalytics = async (req, res) => {
  try {
    const userId = Number(getUserIdFromReq(req));
    const { startDate, endDate } = req.query;

    const matchStage = {
      userId,
      isDeleted: false
    };

    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
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
          startDate: startDate || null,
          endDate: endDate || null
        }
      }
    });
  } catch (error) {
    return res.status(500).json({
      code: 500,
      status: 'failure',
      message: error.message || 'Ошибка при получении аналитики'
    });
  }
};

const searchTestimonials = async (req, res) => {
  try {
    const userId = Number(getUserIdFromReq(req));
    const {
      q,
      createdAfter,
      createdBefore,
      minRating,
      maxRating,
      page = 1,
      limit = 10,
      sort = 'createdAt'
    } = req.query;

    const query = {
      userId,
      isDeleted: false
    };

    if (q) {
      query.$or = [
        { customerName: { $regex: q, $options: 'i' } },
        { text: { $regex: q, $options: 'i' } }
      ];
    }

    if (createdAfter || createdBefore) {
      query.createdAt = {};
      if (createdAfter) query.createdAt.$gte = new Date(createdAfter);
      if (createdBefore) query.createdAt.$lte = new Date(createdBefore);
    }

    if (minRating || maxRating) {
      query.rating = {};
      if (minRating) query.rating.$gte = Number(minRating);
      if (maxRating) query.rating.$lte = Number(maxRating);
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
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
    return res.status(500).json({
      code: 500,
      status: 'failure',
      message: error.message || 'Ошибка при поиске отзывов'
    });
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