const Testimonial = require('../models/testimonial');
const { v4: uuidv4 } = require('uuid');
const { ALLOWED_STATUS_TRANSITIONS, ALLOWED_SHARE_CHANNELS } = require('../lib/constants');

const createTestimonial = async (req, res) => {
  try {
    const { customerName, customerEmail, customerPhone, videoUrl, rating, text, consentGiven } = req.body;

    if (!customerName) {
      return res.status(400).json({
        code: 400,
        status: 'failure',
        message: 'Поле customerName обязательно для заполнения'
      });
    }

    const testimonial = await Testimonial.create({
      testimonialId: uuidv4(),
      userId: req.user.userId,
      customerName,
      customerEmail,
      customerPhone,
      videoUrl,
      rating,
      text,
      consentGiven: consentGiven || false,
      status: 'draft'
    });

    return res.status(201).json({
      code: 201,
      status: 'success',
      message: 'Отзыв успешно создан',
      data: testimonial
    });
  } catch (error) {
    return res.status(500).json({
      code: 500,
      status: 'failure',
      message: error.message || 'Ошибка при создании отзыва'
    });
  }
};

const getTestimonials = async (req, res) => {
  try {
    const { status, page = 1, limit = 10, sort = 'createdAt' } = req.query;

    const query = {
      userId: req.user.userId,
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

    if (testimonial.userId !== req.user.userId) {
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

    if (testimonial.userId !== req.user.userId) {
      return res.status(403).json({
        code: 403,
        status: 'failure',
        message: 'Доступ запрещен'
      });
    }

    const updated = await Testimonial.findOneAndUpdate(
      { testimonialId: req.params.testimonialId },
      { $set: req.body },
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

    if (testimonial.userId !== req.user.userId) {
      return res.status(403).json({
        code: 403,
        status: 'failure',
        message: 'Доступ запрещен'
      });
    }

    const currentStatus = testimonial.status;
    const expectedStatus = ALLOWED_STATUS_TRANSITIONS[currentStatus];

    if (expectedStatus !== nextStatus) {
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
    return res.status(500).json({
      code: 500,
      status: 'failure',
      message: error.message || 'Ошибка при обновлении статуса'
    });
  }
};

const deleteTestimonial = async (req, res) => {
  try {
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

    if (testimonial.userId !== req.user.userId) {
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

    if (!channels || !Array.isArray(channels) || channels.length === 0) {
      return res.status(400).json({
        code: 400,
        status: 'failure',
        message: 'Передайте массив channels'
      });
    }

    const invalidChannels = channels.filter(ch => !ALLOWED_SHARE_CHANNELS.includes(ch));
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

    if (testimonial.userId !== req.user.userId) {
      return res.status(403).json({
        code: 403,
        status: 'failure',
        message: 'Доступ запрещен'
      });
    }

    const updatedChannels = Array.from(new Set([...(testimonial.sharedChannels || []), ...channels]));
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

module.exports = {
  createTestimonial,
  getTestimonials,
  getTestimonialById,
  updateTestimonial,
  updateStatus,
  deleteTestimonial,
  shareTestimonial
};