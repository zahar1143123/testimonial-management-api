const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const TESTIMONIAL_STATUSES = [
  'draft',
  'recording',
  'processing',
  'completed',
  'shared',
];

const ALLOWED_CHANNELS = ['email', 'sms', 'facebook', 'instagram'];

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
    },
    customerEmail: {
      type: String,
      default: '',
      trim: true,
      lowercase: true,
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
      enum: ALLOWED_CHANNELS,
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

module.exports = {
  Testimonial: mongoose.model('Testimonial', testimonialSchema),
  TESTIMONIAL_STATUSES,
  ALLOWED_CHANNELS,
};