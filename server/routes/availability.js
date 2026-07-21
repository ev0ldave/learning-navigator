const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { availabilityRepository } = require('../repositories');
const availabilityService = require('../services/availabilityService');
const { AvailabilityValidationError } = require('../services/availabilityService');
const { isAuthenticated, requireNavigator } = require('../middleware/auth');

/**
 * Error handler helper for AvailabilityValidationError
 */
const handleServiceError = (error, res) => {
  if (error instanceof AvailabilityValidationError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message
    });
  }
  console.error('Unexpected error:', error);
  return res.status(500).json({ success: false, message: 'An error occurred' });
};

// @route   GET /api/availability
// @desc    Get weekly hours for current user (creates default if none exist)
// @access  Private/Navigator
router.get('/', isAuthenticated, requireNavigator, async (req, res) => {
  try {
    const weeklyHours = await availabilityService.getOrCreateWeeklyHours(req.user._id);
    
    res.json({
      success: true,
      weeklyHours
    });
  } catch (error) {
    console.error('Get weekly hours error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching weekly hours'
    });
  }
});

// @route   GET /api/availability/user/:userId
// @desc    Get weekly hours for a specific user (for students booking)
// @access  Private
router.get('/user/:userId', isAuthenticated, async (req, res) => {
  try {
    const weeklyHours = await availabilityService.getWeeklyHoursForBooking(req.params.userId);
    
    res.json({
      success: true,
      weeklyHours
    });
  } catch (error) {
    console.error('Get user weekly hours error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching weekly hours'
    });
  }
});

// @route   PUT /api/availability
// @desc    Update weekly hours schedule
// @access  Private/Navigator
router.put('/',
  isAuthenticated,
  requireNavigator,
  async (req, res) => {
    try {
      // Use AvailabilityService for business logic
      const weeklyHours = await availabilityService.updateWeeklyHours(req.user._id, req.body);
      
      res.json({
        success: true,
        message: 'Weekly hours updated',
        weeklyHours
      });
    } catch (error) {
      if (error instanceof AvailabilityValidationError) {
        return handleServiceError(error, res);
      }
      console.error('Update weekly hours error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating weekly hours'
      });
    }
  }
);

// @route   GET /api/availability/slots/:userId
// @desc    Get available time slots for a specific date range (for booking UI)
// @access  Private
router.get('/slots/:userId', isAuthenticated, async (req, res) => {
  try {
    const { userId } = req.params;
    const { date, duration = 30 } = req.query;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required'
      });
    }
    
    // Use AvailabilityService for business logic
    const result = await availabilityService.getAvailableSlots(
      userId,
      date,
      duration,
      req.user.role
    );
    
    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Get availability slots error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching availability slots'
    });
  }
});

// @route   POST /api/availability/blocks/:dayName
// @desc    Add a new availability block (time slot) to a specific day
// @access  Private/Navigator
router.post('/blocks/:dayName',
  isAuthenticated,
  requireNavigator,
  [
    body('startTime').matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Start time must be in HH:MM format'),
    body('endTime').matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('End time must be in HH:MM format')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      const { dayName } = req.params;
      const { startTime, endTime } = req.body;

      // Use AvailabilityService for business logic
      const weeklyHours = await availabilityService.addBlock(
        req.user._id,
        dayName,
        startTime,
        endTime
      );

      res.status(201).json({
        success: true,
        message: `Availability block added to ${dayName}`,
        weeklyHours
      });
    } catch (error) {
      if (error instanceof AvailabilityValidationError) {
        return handleServiceError(error, res);
      }
      console.error('Add availability block error:', error);
      res.status(500).json({
        success: false,
        message: 'Error adding availability block'
      });
    }
  }
);

// @route   DELETE /api/availability/blocks/:dayName/:slotIndex
// @desc    Remove an availability block (time slot) from a specific day
// @access  Private/Navigator
router.delete('/blocks/:dayName/:slotIndex',
  isAuthenticated,
  requireNavigator,
  async (req, res) => {
    try {
      const { dayName, slotIndex } = req.params;

      // Use AvailabilityService for business logic
      const weeklyHours = await availabilityService.removeBlock(
        req.user._id,
        dayName,
        slotIndex
      );

      res.json({
        success: true,
        message: `Availability block removed from ${dayName}`,
        weeklyHours
      });
    } catch (error) {
      if (error instanceof AvailabilityValidationError) {
        return handleServiceError(error, res);
      }
      console.error('Remove availability block error:', error);
      res.status(500).json({
        success: false,
        message: 'Error removing availability block'
      });
    }
  }
);

module.exports = router;
