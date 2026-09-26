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
    const fields = pickSettingsFields(req.body);

    // FIX (ревью, п.6): раньше $set: { ...fields, userId } подставлял
    // contactConsent целиком объектом, и Mongo заменял вложенный документ
    // полностью — { enabled: false } стирал ранее сохранённый text. Теперь
    // при частичном обновлении contactConsent разбираем его на
    // dot-notation пути, так что $set трогает только те под-поля, которые
    // реально передал клиент.
    const { contactConsent, ...rest } = fields;
    const setPayload = { ...rest, userId };

    if (contactConsent && typeof contactConsent === 'object') {
      if (contactConsent.enabled !== undefined) {
        setPayload['contactConsent.enabled'] = contactConsent.enabled;
      }
      if (contactConsent.text !== undefined) {
        setPayload['contactConsent.text'] = contactConsent.text;
      }
    }

    const settings = await TestimonialSettings.findOneAndUpdate(
      { userId },
      { $set: setPayload },
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
