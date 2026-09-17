const TestimonialSettings = require('../models/testimonialSettings');
const { getUserIdFromReq, pickSettingsFields } = require('../services/testimonialService');

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
      { returnDocument: 'after', upsert: true, runValidators: true }
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

module.exports = {
  getSettings,
  upsertSettings
};
