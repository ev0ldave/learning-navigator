const express = require('express');
const router = express.Router();
const { body, validationResult, query } = require('express-validator');
const Meeting = require('../models/Meeting');
const User = require('../models/User');
const WeeklyHours = require('../models/AvailableHours');
const { 
  isAuthenticated, 
  requireNavigator,
  requireStudentAccess 
} = require('../middleware/auth');
const { sendMeetingNotification } = require('../services/notificationService');
const { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } = require('../services/calendarService');
const { getPacificDayOfWeek, getPacificComponents, getPacificTimeString } = require('../utils/timezone');

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// @route   GET /api/meetings
// @desc    Get meetings for current user
// @access  Private
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      status, 
      page = 1, 
      limit = 50 
    } = req.query;
    
    const query = {};
    
    // Filter by user role
    if (req.user.role === 'student') {
      query.student = req.user._id;
    } else if (req.user.role === 'learning_navigator') {
      query.navigator = req.user._id;
    }
    // Admin sees all meetings
    
    // Date filters
    if (startDate || endDate) {
      query.startTime = {};
      if (startDate) query.startTime.$gte = new Date(startDate);
      if (endDate) query.startTime.$lte = new Date(endDate);
    }
    
    // Status filter (handles comma-separated values)
    if (status) {
      const statuses = status.split(',').map(s => s.trim());
      if (statuses.length > 1) {
        query.status = { $in: statuses };
      } else {
        query.status = status;
      }
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [meetings, total] = await Promise.all([
      Meeting.find(query)
        .sort({ startTime: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('student', 'firstName lastName email profilePicture')
        .populate('navigator', 'firstName lastName email profilePicture')
        .populate('notes'),
      Meeting.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      meetings,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get meetings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching meetings'
    });
  }
});

// @route   GET /api/meetings/upcoming
// @desc    Get upcoming meetings
// @access  Private
router.get('/upcoming', isAuthenticated, async (req, res) => {
  try {
    const query = {
      startTime: { $gte: new Date() },
      status: { $in: ['scheduled', 'confirmed'] }
    };
    
    if (req.user.role === 'student') {
      query.student = req.user._id;
    } else if (req.user.role === 'learning_navigator') {
      query.navigator = req.user._id;
    }
    
    const meetings = await Meeting.find(query)
      .sort({ startTime: 1 })
      .limit(10)
      .populate('student', 'firstName lastName email profilePicture')
      .populate('navigator', 'firstName lastName email profilePicture');
    
    res.json({
      success: true,
      meetings
    });
  } catch (error) {
    console.error('Get upcoming meetings error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching upcoming meetings'
    });
  }
});

// @route   GET /api/meetings/:id
// @desc    Get meeting by ID
// @access  Private
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id)
      .populate('student', 'firstName lastName email profilePicture phone')
      .populate('navigator', 'firstName lastName email profilePicture phone')
      .populate('notes')
      .populate('cancelledBy', 'firstName lastName')
      .populate('rescheduledBy', 'firstName lastName');
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }
    
    // Check access
    const hasAccess = 
      req.user.role === 'administrator' ||
      meeting.student._id.toString() === req.user._id.toString() ||
      meeting.navigator._id.toString() === req.user._id.toString();
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    res.json({
      success: true,
      meeting
    });
  } catch (error) {
    console.error('Get meeting error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching meeting'
    });
  }
});

// @route   POST /api/meetings
// @desc    Create a new meeting
// @access  Private
router.post('/',
  isAuthenticated,
  [
    body('navigatorId').isMongoId().withMessage('Valid navigator ID required'),
    body('startTime').isISO8601().withMessage('Valid start time required'),
    body('endTime').isISO8601().withMessage('Valid end time required'),
    body('title').optional().trim(),
    body('description').optional().trim(),
    body('isRecurring').optional().isBoolean(),
    body('recurrence.frequency').optional().isIn(['weekly', 'biweekly', 'monthly']),
    body('location').optional().isIn(['in_person', 'virtual', 'phone'])
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
      
      const { 
        navigatorId, 
        startTime, 
        endTime, 
        title, 
        description, 
        isRecurring,
        recurrence,
        location,
        meetingLink
      } = req.body;
      
      // For students, they can only book for themselves
      let studentId = req.user._id;
      
      // Navigators and admins can book for any student
      if (req.user.role !== 'student' && req.body.studentId) {
        studentId = req.body.studentId;
      }
      
      // Verify navigator exists
      const navigator = await User.findOne({
        _id: navigatorId,
        role: { $in: ['learning_navigator', 'administrator'] },
        isActive: true
      });
      
      if (!navigator) {
        return res.status(400).json({
          success: false,
          message: 'Invalid navigator'
        });
      }
      
      const meetingStart = new Date(startTime);
      const meetingEnd = new Date(endTime);
      
      // Students cannot schedule meetings within 24 hours
      if (req.user.role === 'student') {
        const now = new Date();
        const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        
        if (meetingStart < twentyFourHoursFromNow) {
          return res.status(400).json({
            success: false,
            message: 'Students cannot schedule meetings less than 24 hours in advance. Please select a later time or contact your learning navigator directly.'
          });
        }
      }
      
      // Check that the meeting falls within the navigator's weekly available hours
      const weeklyHours = await WeeklyHours.findOne({ user: navigatorId });
      const dayOfWeek = getPacificDayOfWeek(meetingStart); // Use Pacific day
      const dayName = DAYS[dayOfWeek];
      
      // Get navigator's availability for this day
      const dayAvailability = weeklyHours ? weeklyHours[dayName] : null;
      
      console.log('Booking validation:', {
        navigatorId,
        dayName,
        dayOfWeek,
        dayAvailability: dayAvailability ? { enabled: dayAvailability.enabled, slots: dayAvailability.slots } : null,
        meetingStartPacific: getPacificTimeString(meetingStart),
        meetingEndPacific: getPacificTimeString(meetingEnd)
      });
      
      // Check if the day is available
      if (!dayAvailability || !dayAvailability.enabled || !dayAvailability.slots || dayAvailability.slots.length === 0) {
        return res.status(400).json({
          success: false,
          message: `The navigator is not available on ${dayName}. Please select a different date.`
        });
      }
      
      // Check if the meeting time falls within any of the day's available slots
      // Use Pacific time to match how slots are generated
      const meetingStartPacific = getPacificComponents(meetingStart);
      const meetingEndPacific = getPacificComponents(meetingEnd);
      const meetingStartHour = meetingStartPacific.hours;
      const meetingStartMin = meetingStartPacific.minutes;
      const meetingEndHour = meetingEndPacific.hours;
      const meetingEndMin = meetingEndPacific.minutes;
      
      // Convert to minutes since midnight for easier comparison
      const meetingStartMinutes = meetingStartHour * 60 + meetingStartMin;
      const meetingEndMinutes = meetingEndHour * 60 + meetingEndMin;
      
      const isWithinAvailableSlot = dayAvailability.slots.some(slot => {
        const [slotStartHour, slotStartMin] = slot.startTime.split(':').map(Number);
        const [slotEndHour, slotEndMin] = slot.endTime.split(':').map(Number);
        const slotStartMinutes = slotStartHour * 60 + slotStartMin;
        const slotEndMinutes = slotEndHour * 60 + slotEndMin;
        
        const isWithin = meetingStartMinutes >= slotStartMinutes && meetingEndMinutes <= slotEndMinutes;
        
        console.log('Slot check:', {
          slot: `${slot.startTime}-${slot.endTime}`,
          meetingTimePacific: `${meetingStartHour}:${String(meetingStartMin).padStart(2,'0')}-${meetingEndHour}:${String(meetingEndMin).padStart(2,'0')}`,
          slotMinutes: `${slotStartMinutes}-${slotEndMinutes}`,
          meetingMinutes: `${meetingStartMinutes}-${meetingEndMinutes}`,
          isWithin
        });
        
        return isWithin;
      });
      
      if (!isWithinAvailableSlot) {
        const meetingTimeStr = `${String(meetingStartHour).padStart(2, '0')}:${String(meetingStartMin).padStart(2, '0')}`;
        const availableTimesStr = dayAvailability.slots.map(s => `${s.startTime}-${s.endTime}`).join(', ');
        return res.status(400).json({
          success: false,
          message: `The selected time (${meetingTimeStr} Pacific) is outside the navigator's available hours (${availableTimesStr}). Please select from the available time slots.`
        });
      }
      
      // Check for scheduling conflicts with the navigator
      const conflictingMeeting = await Meeting.findOne({
        navigator: navigatorId,
        status: { $in: ['scheduled', 'confirmed'] },
        $or: [
          {
            startTime: { $lt: meetingEnd },
            endTime: { $gt: meetingStart }
          }
        ]
      });
      
      if (conflictingMeeting) {
        return res.status(400).json({
          success: false,
          message: 'The navigator already has a meeting scheduled during this time'
        });
      }
      
      // Create meeting
      const meeting = new Meeting({
        student: studentId,
        navigator: navigatorId,
        title: title || 'Learning Navigator Session',
        description,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        type: isRecurring ? 'recurring' : 'initial',
        isRecurring: isRecurring || false,
        recurrence: isRecurring ? {
          frequency: recurrence?.frequency || 'weekly',
          dayOfWeek: new Date(startTime).getDay(),
          endDate: recurrence?.endDate ? new Date(recurrence.endDate) : null
        } : undefined,
        location: location || 'virtual',
        meetingLink,
        createdBy: req.user._id
      });
      
      await meeting.save();
      
      // Populate for response
      await meeting.populate([
        { path: 'student', select: 'firstName lastName email profilePicture' },
        { path: 'navigator', select: 'firstName lastName email profilePicture' }
      ]);
      
      // Create Google Calendar event if tokens available
      try {
        await createCalendarEvent(meeting);
      } catch (calError) {
        console.error('Calendar event creation failed:', calError);
      }
      
      // Send notifications
      try {
        await sendMeetingNotification(meeting, 'scheduled');
      } catch (notifError) {
        console.error('Notification failed:', notifError);
      }
      
      // If recurring, create future meetings
      if (isRecurring && recurrence?.endDate) {
        await createRecurringMeetings(meeting, new Date(recurrence.endDate));
      }
      
      res.status(201).json({
        success: true,
        message: 'Meeting scheduled successfully',
        meeting
      });
    } catch (error) {
      console.error('Create meeting error:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating meeting'
      });
    }
  }
);

// @route   PUT /api/meetings/:id
// @desc    Update a meeting (reschedule)
// @access  Private
router.put('/:id',
  isAuthenticated,
  [
    body('startTime').optional().isISO8601(),
    body('endTime').optional().isISO8601(),
    body('title').optional().trim(),
    body('description').optional().trim(),
    body('location').optional().isIn(['in_person', 'virtual', 'phone'])
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
      
      const meeting = await Meeting.findById(req.params.id);
      
      if (!meeting) {
        return res.status(404).json({
          success: false,
          message: 'Meeting not found'
        });
      }
      
      // Check permissions
      const canUpdate = 
        req.user.role === 'administrator' ||
        meeting.student.toString() === req.user._id.toString() ||
        meeting.navigator.toString() === req.user._id.toString();
      
      if (!canUpdate) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to update this meeting'
        });
      }
      
      const { startTime, endTime, title, description, location, meetingLink } = req.body;
      const isRescheduling = startTime || endTime;
      
      // Check for conflicts if rescheduling
      if (isRescheduling) {
        const newStart = startTime ? new Date(startTime) : meeting.startTime;
        const newEnd = endTime ? new Date(endTime) : meeting.endTime;
        
        const conflictingMeeting = await Meeting.findOne({
          _id: { $ne: meeting._id },
          navigator: meeting.navigator,
          status: { $in: ['scheduled', 'confirmed'] },
          $or: [
            {
              startTime: { $lt: newEnd },
              endTime: { $gt: newStart }
            }
          ]
        });
        
        if (conflictingMeeting) {
          return res.status(400).json({
            success: false,
            message: 'This time slot is not available'
          });
        }
        
        meeting.rescheduledFrom = meeting.startTime;
        meeting.rescheduledBy = req.user._id;
        if (startTime) meeting.startTime = newStart;
        if (endTime) meeting.endTime = newEnd;
      }
      
      if (title) meeting.title = title;
      if (description !== undefined) meeting.description = description;
      if (location) meeting.location = location;
      if (meetingLink !== undefined) meeting.meetingLink = meetingLink;
      
      await meeting.save();
      
      await meeting.populate([
        { path: 'student', select: 'firstName lastName email profilePicture' },
        { path: 'navigator', select: 'firstName lastName email profilePicture' }
      ]);
      
      // Update calendar event
      if (isRescheduling) {
        try {
          await updateCalendarEvent(meeting);
        } catch (calError) {
          console.error('Calendar update failed:', calError);
        }
        
        // Send reschedule notification
        try {
          await sendMeetingNotification(meeting, 'rescheduled');
        } catch (notifError) {
          console.error('Notification failed:', notifError);
        }
      }
      
      res.json({
        success: true,
        message: isRescheduling ? 'Meeting rescheduled successfully' : 'Meeting updated successfully',
        meeting
      });
    } catch (error) {
      console.error('Update meeting error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating meeting'
      });
    }
  }
);

// @route   PUT /api/meetings/:id/cancel
// @desc    Cancel a meeting
// @access  Private
router.put('/:id/cancel',
  isAuthenticated,
  [
    body('reason').optional().trim()
  ],
  async (req, res) => {
    try {
      const meeting = await Meeting.findById(req.params.id);
      
      if (!meeting) {
        return res.status(404).json({
          success: false,
          message: 'Meeting not found'
        });
      }
      
      // Check permissions
      const canCancel = 
        req.user.role === 'administrator' ||
        meeting.student.toString() === req.user._id.toString() ||
        meeting.navigator.toString() === req.user._id.toString();
      
      if (!canCancel) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to cancel this meeting'
        });
      }
      
      meeting.status = 'cancelled';
      meeting.cancelledBy = req.user._id;
      meeting.cancellationReason = req.body.reason;
      meeting.cancelledAt = new Date();
      
      await meeting.save();
      
      await meeting.populate([
        { path: 'student', select: 'firstName lastName email profilePicture' },
        { path: 'navigator', select: 'firstName lastName email profilePicture' }
      ]);
      
      // Delete calendar event
      try {
        await deleteCalendarEvent(meeting);
      } catch (calError) {
        console.error('Calendar deletion failed:', calError);
      }
      
      // Send cancellation notification
      try {
        await sendMeetingNotification(meeting, 'cancelled');
      } catch (notifError) {
        console.error('Notification failed:', notifError);
      }
      
      res.json({
        success: true,
        message: 'Meeting cancelled successfully',
        meeting
      });
    } catch (error) {
      console.error('Cancel meeting error:', error);
      res.status(500).json({
        success: false,
        message: 'Error cancelling meeting'
      });
    }
  }
);

// @route   PUT /api/meetings/:id/complete
// @desc    Mark meeting as completed
// @access  Private/Navigator
router.put('/:id/complete', isAuthenticated, requireNavigator, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }
    
    // Only navigator of the meeting or admin can mark as complete
    if (req.user.role !== 'administrator' && 
        meeting.navigator.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the assigned navigator can complete this meeting'
      });
    }
    
    meeting.status = 'completed';
    await meeting.save();
    
    res.json({
      success: true,
      message: 'Meeting marked as completed',
      meeting
    });
  } catch (error) {
    console.error('Complete meeting error:', error);
    res.status(500).json({
      success: false,
      message: 'Error completing meeting'
    });
  }
});

// @route   PUT /api/meetings/:id/no-show
// @desc    Mark meeting as no-show
// @access  Private/Navigator
router.put('/:id/no-show', isAuthenticated, requireNavigator, async (req, res) => {
  try {
    const meeting = await Meeting.findById(req.params.id);
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }
    
    if (req.user.role !== 'administrator' && 
        meeting.navigator.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the assigned navigator can mark this meeting'
      });
    }
    
    meeting.status = 'no_show';
    await meeting.save();
    
    res.json({
      success: true,
      message: 'Meeting marked as no-show',
      meeting
    });
  } catch (error) {
    console.error('No-show meeting error:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking meeting as no-show'
    });
  }
});

// Helper function to create recurring meetings
async function createRecurringMeetings(parentMeeting, endDate) {
  const meetings = [];
  const frequency = parentMeeting.recurrence?.frequency || 'weekly';
  
  let currentDate = new Date(parentMeeting.startTime);
  const duration = parentMeeting.endTime - parentMeeting.startTime;
  
  const addDays = frequency === 'weekly' ? 7 : frequency === 'biweekly' ? 14 : 30;
  
  while (currentDate <= endDate) {
    currentDate = new Date(currentDate.getTime() + addDays * 24 * 60 * 60 * 1000);
    
    if (currentDate > endDate) break;
    
    const newMeeting = new Meeting({
      student: parentMeeting.student,
      navigator: parentMeeting.navigator,
      title: parentMeeting.title,
      description: parentMeeting.description,
      startTime: currentDate,
      endTime: new Date(currentDate.getTime() + duration),
      type: 'recurring',
      isRecurring: true,
      recurrence: {
        ...parentMeeting.recurrence,
        parentMeetingId: parentMeeting._id
      },
      location: parentMeeting.location,
      meetingLink: parentMeeting.meetingLink,
      createdBy: parentMeeting.createdBy
    });
    
    meetings.push(newMeeting);
  }
  
  if (meetings.length > 0) {
    await Meeting.insertMany(meetings);
  }
  
  return meetings;
}

module.exports = router;
