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
  shareTestimonial
} = require('../controllers/testimonialController');

router.use(protect);

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