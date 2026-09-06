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
    },
    videoLengthOptions: {
      type: [Number],
      default: [5, 10, 15, 20, 25],
    },
    questionnaire: {
      type: [String],
      default: ['What do you like about our service?'],
    },
    sendingOptions: {
      type: [String],
      default: ['email', 'sms'],
    },
    thankYouMessage: {
      type: String,
      default: 'Thank you!',
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