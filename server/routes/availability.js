const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const WeeklyHours = require('../models/AvailableHours');
const { isAuthenticated, requireNavigator } = require('../middleware/auth');
const { 
  getPacificDayOfWeek, 
  getPacificComponents, 
  createPacificDate, 
  getPacificStartOfDay, 
  getPacificEndOfDay,
  parseDateAsPacific
} = require('../utils/timezone');

// Helper to validate time format (HH:MM)
const isValidTimeFormat = (time) => {
  return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
};

// Helper to validate slots array
const validateSlots = (slots) => {
  if (!Array.isArray(slots)) return false;
  return slots.every(slot => 
    slot.startTime && 
    slot.endTime && 
    isValidTimeFormat(slot.startTime) && 
    isValidTimeFormat(slot.endTime) &&
    slot.startTime < slot.endTime
  );
};

// @route   GET /api/availability
// @desc    Get weekly hours for current user (creates default if none exist)
// @access  Private/Navigator
router.get('/', isAuthenticated, requireNavigator, async (req, res) => {
  try {
    let weeklyHours = await WeeklyHours.findOne({ user: req.user._id });
    
    // Create default schedule if none exists
    if (!weeklyHours) {
      weeklyHours = new WeeklyHours({ user: req.user._id });
      await weeklyHours.save();
    }
    
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
    const { userId } = req.params;
    
    let weeklyHours = await WeeklyHours.findOne({ user: userId })
      .populate('user', 'firstName lastName');
    
    // If no schedule exists, return empty availability
    // Navigators must explicitly set their availability for students to book
    if (!weeklyHours) {
      weeklyHours = {
        user: userId,
        sunday: { enabled: false, slots: [] },
        monday: { enabled: false, slots: [] },
        tuesday: { enabled: false, slots: [] },
        wednesday: { enabled: false, slots: [] },
        thursday: { enabled: false, slots: [] },
        friday: { enabled: false, slots: [] },
        saturday: { enabled: false, slots: [] },
        _notConfigured: true // Flag to indicate availability not set
      };
    }
    
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
      const { sunday, monday, tuesday, wednesday, thursday, friday, saturday, timezone } = req.body;
      
      // Validate each day's slots if provided
      const days = { sunday, monday, tuesday, wednesday, thursday, friday, saturday };
      for (const [dayName, dayData] of Object.entries(days)) {
        if (dayData && dayData.enabled && dayData.slots) {
          if (!validateSlots(dayData.slots)) {
            return res.status(400).json({
              success: false,
              message: `Invalid time slots for ${dayName}. Times must be in HH:MM format and end time must be after start time.`
            });
          }
        }
      }
      
      // Find or create weekly hours
      let weeklyHours = await WeeklyHours.findOne({ user: req.user._id });
      
      if (!weeklyHours) {
        weeklyHours = new WeeklyHours({ user: req.user._id });
      }
      
      // Update each day if provided
      if (sunday !== undefined) weeklyHours.sunday = sunday;
      if (monday !== undefined) weeklyHours.monday = monday;
      if (tuesday !== undefined) weeklyHours.tuesday = tuesday;
      if (wednesday !== undefined) weeklyHours.wednesday = wednesday;
      if (thursday !== undefined) weeklyHours.thursday = thursday;
      if (friday !== undefined) weeklyHours.friday = friday;
      if (saturday !== undefined) weeklyHours.saturday = saturday;
      if (timezone) weeklyHours.timezone = timezone;
      
      await weeklyHours.save();
      
      res.json({
        success: true,
        message: 'Weekly hours updated',
        weeklyHours
      });
    } catch (error) {
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
    
    // Get the weekly hours for the user
    const weeklyHours = await WeeklyHours.findOne({ user: userId });
    
    // If navigator hasn't set their availability, return empty slots
    // Navigators must explicitly configure their availability for students to book
    if (!weeklyHours) {
      return res.json({
        success: true,
        slots: [],
        message: 'Navigator has not set their availability yet'
      });
    }
    
    // Parse date as Pacific calendar date (handles both YYYY-MM-DD and ISO formats)
    const { year, month, day, dayOfWeek } = parseDateAsPacific(date);
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = days[dayOfWeek];
    const dayAvailability = weeklyHours[dayName];
    
    // If day is not enabled, return empty slots
    if (!dayAvailability || !dayAvailability.enabled) {
      return res.json({
        success: true,
        slots: [],
        message: 'No availability on this day'
      });
    }
    
    // Get existing meetings for this date (use Pacific time boundaries)
    const Meeting = require('../models/Meeting');
    const startOfDay = createPacificDate(year, month, day, 0, 0, 0);
    const endOfDay = createPacificDate(year, month, day, 23, 59, 59);
    
    const existingMeetings = await Meeting.find({
      navigator: userId,
      startTime: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ['scheduled', 'confirmed'] }
    });
    
    // Generate available slots
    const slots = [];
    const slotDuration = parseInt(duration);
    
    // Calculate minimum booking time - students must book 24 hours in advance
    const now = new Date();
    const minBookingTime = req.user.role === 'student' 
      ? new Date(now.getTime() + 24 * 60 * 60 * 1000) 
      : now;
    
    dayAvailability.slots.forEach(timeSlot => {
      const [startHour, startMin] = timeSlot.startTime.split(':').map(Number);
      const [endHour, endMin] = timeSlot.endTime.split(':').map(Number);
      
      // Create slot times in Pacific timezone
      let current = createPacificDate(year, month, day, startHour, startMin, 0);
      const slotEndTime = createPacificDate(year, month, day, endHour, endMin, 0);
      
      while (current < slotEndTime) {
        const slotEnd = new Date(current.getTime() + slotDuration * 60 * 1000);
        
        if (slotEnd > slotEndTime) break;
        
        // Check for conflicts with existing meetings
        const hasConflict = existingMeetings.some(meeting => {
          const meetingStart = new Date(meeting.startTime);
          const meetingEnd = new Date(meeting.endTime);
          return current < meetingEnd && slotEnd > meetingStart;
        });
        
        // Only add slots that are bookable and without conflicts
        if (!hasConflict && current > minBookingTime) {
          slots.push({
            start: new Date(current),
            end: new Date(slotEnd),
            available: true
          });
        }
        
        current = new Date(current.getTime() + slotDuration * 60 * 1000);
      }
    });
    
    res.json({
      success: true,
      slots,
      dayAvailability
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
      const validDays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

      if (!validDays.includes(dayName.toLowerCase())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid day name. Must be one of: sunday, monday, tuesday, wednesday, thursday, friday, saturday'
        });
      }

      // Validate that end time is after start time
      if (startTime >= endTime) {
        return res.status(400).json({
          success: false,
          message: 'End time must be after start time'
        });
      }

      // Find or create weekly hours
      let weeklyHours = await WeeklyHours.findOne({ user: req.user._id });

      if (!weeklyHours) {
        weeklyHours = new WeeklyHours({ user: req.user._id });
      }

      const day = dayName.toLowerCase();
      const dayData = weeklyHours[day];

      // Check for overlapping slots
      const hasOverlap = dayData.slots.some(slot => {
        return (startTime < slot.endTime && endTime > slot.startTime);
      });

      if (hasOverlap) {
        return res.status(400).json({
          success: false,
          message: 'The new time slot overlaps with an existing slot'
        });
      }

      // Add the new slot
      dayData.slots.push({ startTime, endTime });
      
      // Sort slots by start time
      dayData.slots.sort((a, b) => a.startTime.localeCompare(b.startTime));
      
      // Enable the day if not already enabled
      dayData.enabled = true;

      await weeklyHours.save();

      res.status(201).json({
        success: true,
        message: `Availability block added to ${dayName}`,
        weeklyHours
      });
    } catch (error) {
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
      const validDays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

      if (!validDays.includes(dayName.toLowerCase())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid day name'
        });
      }

      const index = parseInt(slotIndex);
      if (isNaN(index) || index < 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid slot index'
        });
      }

      let weeklyHours = await WeeklyHours.findOne({ user: req.user._id });

      if (!weeklyHours) {
        return res.status(404).json({
          success: false,
          message: 'No availability schedule found'
        });
      }

      const day = dayName.toLowerCase();
      const dayData = weeklyHours[day];

      if (index >= dayData.slots.length) {
        return res.status(400).json({
          success: false,
          message: 'Slot index out of range'
        });
      }

      // Remove the slot
      dayData.slots.splice(index, 1);

      // If no slots remain, disable the day
      if (dayData.slots.length === 0) {
        dayData.enabled = false;
      }

      await weeklyHours.save();

      res.json({
        success: true,
        message: `Availability block removed from ${dayName}`,
        weeklyHours
      });
    } catch (error) {
      console.error('Remove availability block error:', error);
      res.status(500).json({
        success: false,
        message: 'Error removing availability block'
      });
    }
  }
);

module.exports = router;
