const express = require('express');
const router = express.Router();
const {
  createTestimonial,
  getTestimonials,
  getTestimonialById,
  updateTestimonial,
  updateStatus,
  deleteTestimonial,
  shareTestimonial
} = require('../controllers/testimonialController');
const {
  getSettings,
  upsertSettings
} = require('../controllers/testimonialSettingsController');
const {
  getAnalytics,
  searchTestimonials
} = require('../controllers/testimonialAnalyticsController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .post(createTestimonial)
  .get(getTestimonials);

// Статичные пути должны идти ДО '/:testimonialId', иначе Express
// примет 'settings' / 'analytics' / 'search' за значение :testimonialId
router.route('/settings')
  .get(getSettings)
  .post(upsertSettings);

router.get('/analytics', getAnalytics);
router.get('/search', searchTestimonials);

router.route('/:testimonialId')
  .get(getTestimonialById)
  .put(updateTestimonial)
  .delete(deleteTestimonial);

router.patch('/:testimonialId/status', updateStatus);
router.post('/:testimonialId/share', shareTestimonial);

module.exports = router;
