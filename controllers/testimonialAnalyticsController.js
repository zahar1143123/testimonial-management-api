const { Testimonial } = require('../models/testimonial');
const {
  getUserIdFromReq,
  parseListQuery,
  parseDateParam,
  escapeRegex,
  parseRatingRange
} = require('../services/testimonialService');

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

    const [result] = await Testimonial.aggregate([
      { $match: matchStage },
      {
        $facet: {
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          averageRating: [
            { $match: { rating: { $exists: true, $ne: null } } },
            { $group: { _id: null, avg: { $avg: '$rating' } } }
          ],
          total: [{ $count: 'count' }]
        }
      }
    ]);

    const total = result.total[0]?.count || 0;
    const averageRating = result.averageRating[0]
      ? Number(result.averageRating[0].avg.toFixed(1))
      : 0;

    const byStatus = {
      draft: 0,
      recording: 0,
      processing: 0,
      completed: 0,
      shared: 0
    };

    result.byStatus.forEach((item) => {
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

    const ratingRange = parseRatingRange(minRating, maxRating);
    if (ratingRange.error) {
      return res.status(400).json({ code: 400, status: 'failure', message: ratingRange.error });
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

    if (ratingRange.min !== undefined || ratingRange.max !== undefined) {
      query.rating = {};
      if (ratingRange.min !== undefined) query.rating.$gte = ratingRange.min;
      if (ratingRange.max !== undefined) query.rating.$lte = ratingRange.max;
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
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAnalytics,
  searchTestimonials
};
