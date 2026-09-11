const express = require('express');
const router = express.Router();
const {
  createTestimonial,
  getTestimonials,
  getTestimonialById,
  updateTestimonial,
  updateStatus
} = require('../controllers/testimonialController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.route('/')
  .post(createTestimonial)
  .get(getTestimonials);

router.route('/:testimonialId')
  .get(getTestimonialById)
  .patch(updateTestimonial);

router.patch('/:testimonialId/status', updateStatus);

module.exports = router;