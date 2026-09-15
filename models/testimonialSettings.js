const mongoose = require('mongoose');

const testimonialSettingsSchema = new mongoose.Schema(
  {
    userId: {
      type: Number,
      required: [true, 'User ID is required'],
      unique: true,
      index: true,
    },
    isEnabled: {
      type: Boolean,
      default: false,
    },
    defaultVideoLength: {
      type: Number,
      default: 10,
      min: [1, 'defaultVideoLength должен быть положительным'],
    },
    videoLengthOptions: {
      type: [Number],
      default: [5, 10, 15, 20, 25],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.every((n) => n > 0),
        message: 'Все значения videoLengthOptions должны быть положительными',
      },
    },
    questionnaire: {
      type: [String],
      default: ['What do you like about our service?'],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.every((s) => typeof s === 'string' && s.trim().length > 0),
        message: 'questionnaire не должен содержать пустые строки',
      },
    },
    sendingOptions: {
      type: [String],
      enum: {
        values: ['email', 'sms'],
        message: '{VALUE} не поддерживается в sendingOptions',
      },
      default: ['email', 'sms'],
    },
    thankYouMessage: {
      type: String,
      default: 'Thank you!',
      maxlength: [500, 'thankYouMessage слишком длинный'],
    },
    contactConsent: {
      enabled: {
        type: Boolean,
        default: true,
      },
      text: {
        type: String,
        default: 'Join our mailing list',
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('TestimonialSettings', testimonialSettingsSchema);