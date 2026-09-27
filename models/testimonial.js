const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { ALLOWED_SHARE_CHANNELS } = require('../lib/constants');

const TESTIMONIAL_STATUSES = [
  'draft',
  'recording',
  'processing',
  'completed',
  'shared',
];

const testimonialSchema = new mongoose.Schema(
  {
    testimonialId: {
      type: String,
      default: uuidv4,
      unique: true,
      index: true,
    },
    userId: {
      type: Number,
      required: [true, 'User ID is required'],
      index: true,
    },
    customerName: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
      validate: {
        validator: (v) => v.trim().length > 0,
        message: 'Customer name cannot be empty or whitespace only',
      },
    },
    customerEmail: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
      validate: {
        validator: (v) => v === '' || /^\S+@\S+\.\S+$/.test(v),
        message: 'customerEmail имеет некорректный формат',
      },
    },
    customerPhone: {
      type: String,
      default: '',
      trim: true,
    },
    videoUrl: {
      type: String,
      default: '',
      trim: true,
      // Раньше сюда можно было записать любую строку — теперь допускаем
      // либо пустую строку (видео ещё не записано), либо валидный http(s) URL.
      validate: {
        validator: (v) => v === '' || /^https?:\/\/\S+$/i.test(v),
        message: 'videoUrl должен быть пустой строкой или валидным http(s) URL',
      },
    },
    rating: {
      type: Number,
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating cannot exceed 5'],
      default: null,
    },
    text: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: {
        values: TESTIMONIAL_STATUSES,
        message: '{VALUE} is not a valid testimonial status',
      },
      default: 'draft',
      index: true,
    },
    consentGiven: {
      type: Boolean,
      default: false,
    },
    sharedAt: {
      type: Date,
      default: null,
    },
    sharedChannels: {
      type: [String],
      enum: ALLOWED_SHARE_CHANNELS,
      default: [],
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Составной индекс по ТЗ
testimonialSchema.index({ userId: 1, isDeleted: 1 });

testimonialSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = {
  Testimonial: mongoose.model('Testimonial', testimonialSchema),
  TESTIMONIAL_STATUSES,
  ALLOWED_CHANNELS: ALLOWED_SHARE_CHANNELS,
};