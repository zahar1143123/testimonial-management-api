const express = require('express');
const router = express.Router();
const {
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
} = require('../controllers/testimonialController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .post(createTestimonial)
  .get(getTestimonials);

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