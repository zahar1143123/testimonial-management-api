const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
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

router.use(protect);

router.route('/settings')
  .get(getSettings)
  .post(upsertSettings);

router.get('/analytics', getAnalytics);
router.get('/search', searchTestimonials);

router.route('/')
  .post(createTestimonial)
  .get(getTestimonials);

router.route('/:testimonialId')
  .get(getTestimonialById)
  .put(updateTestimonial)
  .delete(deleteTestimonial);

router.patch('/:testimonialId/status', updateStatus);
router.post('/:testimonialId/share', shareTestimonial);

module.exports = router;