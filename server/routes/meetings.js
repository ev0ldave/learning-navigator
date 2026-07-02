const express = require('express');
const router = express.Router();
const { body, validationResult, query } = require('express-validator');
const Meeting = require('../models/Meeting');
const User = require('../models/User');
const WeeklyHours = require('../models/AvailableHours');
const SchoolQuarter = require('../models/SchoolQuarter');
const { 
  isAuthenticated, 
  requireNavigator,
  requireStudentAccess,
  validateObjectId
} = require('../middleware/auth');
const { 
  queueCalendarCreate, 
  queueCalendarUpdate, 
  queueCalendarDelete, 
  queueMeetingNotification 
} = require('../services/jobQueue');
const { getPacificDayOfWeek, getPacificComponents, getPacificTimeString } = require('../utils/timezone');

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Validate ObjectId params
router.param('id', validateObjectId('id'));

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
      
      // Validate meeting date is within active school quarter
      const quarterCheck = await SchoolQuarter.isDateInActiveQuarter(meetingStart);
      if (!quarterCheck.valid && !quarterCheck.noQuarterSet) {
        return res.status(400).json({
          success: false,
          message: quarterCheck.message,
          quarterInfo: {
            name: quarterCheck.quarterName,
            startDate: quarterCheck.startDate,
            endDate: quarterCheck.endDate
          }
        });
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
      
      // Create Google Calendar event
      await queueCalendarCreate(meeting._id.toString());
      
      // Send notifications
      await queueMeetingNotification(meeting._id.toString(), 'scheduled');
      
      // If recurring, create future meetings (capped to quarter end date)
      if (isRecurring && recurrence?.endDate) {
        const requestedEndDate = new Date(recurrence.endDate);
        const cappedEndDate = await SchoolQuarter.getRecurrenceEndDate(requestedEndDate);
        await createRecurringMeetings(meeting, cappedEndDate);
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
      
      // Update calendar event and send notification
      if (isRescheduling) {
        await queueCalendarUpdate(meeting._id.toString());
        await queueMeetingNotification(meeting._id.toString(), 'rescheduled');
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
      
      // Delete calendar event and send notification
      await queueCalendarDelete(meeting);
      await queueMeetingNotification(meeting._id.toString(), 'cancelled');
      
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

// @route   DELETE /api/meetings/series/:id
// @desc    Delete a recurring meeting series (all or future only)
// @access  Private (student, navigator, or admin)
router.delete('/series/:id',
  isAuthenticated,
  [
    query('scope').optional().isIn(['all', 'future']).withMessage('Scope must be "all" or "future"')
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

      const { scope = 'all' } = req.query;
      const reason = req.body?.reason;

      // Find the meeting
      const meeting = await Meeting.findById(req.params.id);

      if (!meeting) {
        return res.status(404).json({
          success: false,
          message: 'Meeting not found'
        });
      }

      if (!meeting.isRecurring) {
        return res.status(400).json({
          success: false,
          message: 'This meeting is not part of a recurring series'
        });
      }

      // Check permissions - student, navigator, or admin can delete
      const canDelete = 
        req.user.role === 'administrator' ||
        meeting.student.toString() === req.user._id.toString() ||
        meeting.navigator.toString() === req.user._id.toString();

      if (!canDelete) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to delete this meeting series'
        });
      }

      // Determine the parent meeting ID
      const parentId = meeting.recurrence?.parentMeetingId || meeting._id;

      // Build query to find all meetings in the series
      const seriesQuery = {
        $or: [
          { _id: parentId },
          { 'recurrence.parentMeetingId': parentId }
        ],
        status: { $in: ['scheduled', 'confirmed'] } // Only delete active meetings
      };

      // If scope is 'future', only delete meetings from today onwards
      if (scope === 'future') {
        seriesQuery.startTime = { $gte: new Date() };
      }

      // Find all meetings to delete
      const meetingsToDelete = await Meeting.find(seriesQuery)
        .populate('student', 'firstName lastName email')
        .populate('navigator', 'firstName lastName email');

      if (meetingsToDelete.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No active meetings found in this series'
        });
      }

      // Cancel all meetings in the series (soft delete by setting status to cancelled)
      const meetingIds = meetingsToDelete.map(m => m._id);
      
      await Meeting.updateMany(
        { _id: { $in: meetingIds } },
        {
          $set: {
            status: 'cancelled',
            cancelledBy: req.user._id,
            cancellationReason: reason || 'Recurring series deleted',
            cancelledAt: new Date()
          }
        }
      );

      // Delete calendar events and send notifications for each meeting
      const calendarErrors = [];
      const notificationErrors = [];

      for (const meetingToCancel of meetingsToDelete) {
        const calResult = await queueCalendarDelete(meetingToCancel);
        if (calResult?.error) {
          calendarErrors.push(meetingToCancel._id);
        }
        const notifResult = await queueMeetingNotification(meetingToCancel._id.toString(), 'cancelled');
        if (notifResult?.error) {
          notificationErrors.push(meetingToCancel._id);
        }
      }

      res.json({
        success: true,
        message: `Successfully cancelled ${meetingsToDelete.length} meeting(s) in the series`,
        deletedCount: meetingsToDelete.length,
        scope,
        warnings: {
          calendarErrors: calendarErrors.length > 0 ? `Failed to delete ${calendarErrors.length} calendar event(s)` : null,
          notificationErrors: notificationErrors.length > 0 ? `Failed to send ${notificationErrors.length} notification(s)` : null
        }
      });
    } catch (error) {
      console.error('Delete meeting series error:', error);
      res.status(500).json({
        success: false,
        message: 'Error deleting meeting series'
      });
    }
  }
);

// @route   PUT /api/meetings/series/:id/recurrence
// @desc    Update recurrence frequency for a meeting series
// @access  Private (navigator or admin)
router.put('/series/:id/recurrence',
  isAuthenticated,
  requireNavigator,
  [
    body('frequency').isIn(['weekly', 'biweekly', 'triweekly', 'monthly']).withMessage('Invalid frequency'),
    body('endDate').optional().isISO8601().withMessage('Invalid end date')
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

      const { frequency, endDate } = req.body;

      // Find the meeting
      const meeting = await Meeting.findById(req.params.id);

      if (!meeting) {
        return res.status(404).json({
          success: false,
          message: 'Meeting not found'
        });
      }

      if (!meeting.isRecurring) {
        return res.status(400).json({
          success: false,
          message: 'This meeting is not part of a recurring series'
        });
      }

      // Check permissions
      const canUpdate = 
        req.user.role === 'administrator' ||
        meeting.navigator.toString() === req.user._id.toString();

      if (!canUpdate) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to update this meeting series'
        });
      }

      // Determine the parent meeting
      const parentId = meeting.recurrence?.parentMeetingId || meeting._id;
      const parentMeeting = await Meeting.findById(parentId);

      if (!parentMeeting) {
        return res.status(404).json({
          success: false,
          message: 'Parent meeting not found'
        });
      }

      // Get the old frequency for comparison
      const oldFrequency = parentMeeting.recurrence?.frequency || 'weekly';
      
      // If frequency hasn't changed and no new end date, nothing to do
      if (oldFrequency === frequency && !endDate) {
        return res.json({
          success: true,
          message: 'No changes made',
          meeting: parentMeeting
        });
      }

      // Find all future child meetings (scheduled and after today)
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const futureMeetings = await Meeting.find({
        'recurrence.parentMeetingId': parentId,
        startTime: { $gte: today },
        status: { $in: ['scheduled', 'confirmed'] }
      });

      // Delete calendar events for future meetings
      for (const futureMeeting of futureMeetings) {
        try {
          await queueCalendarDelete(futureMeeting._id.toString());
        } catch (err) {
          console.error('Error deleting calendar event for meeting:', futureMeeting._id, err);
        }
      }

      // Delete future child meetings from database
      const deleteResult = await Meeting.deleteMany({
        'recurrence.parentMeetingId': parentId,
        startTime: { $gte: today },
        status: { $in: ['scheduled', 'confirmed'] }
      });

      console.log(`Deleted ${deleteResult.deletedCount} future meetings for frequency update`);

      // Update the parent meeting's recurrence settings
      parentMeeting.recurrence = {
        ...parentMeeting.recurrence,
        frequency: frequency,
        endDate: endDate ? new Date(endDate) : parentMeeting.recurrence?.endDate
      };
      await parentMeeting.save();

      // Calculate the new end date (use provided or existing, capped by quarter)
      let recurrenceEndDate = endDate ? new Date(endDate) : parentMeeting.recurrence?.endDate;
      
      if (recurrenceEndDate) {
        // Cap to quarter end date if active
        const SchoolQuarter = require('../models/SchoolQuarter');
        recurrenceEndDate = await SchoolQuarter.getRecurrenceEndDate(recurrenceEndDate);
      }

      // Recreate future meetings with new frequency if we have an end date
      let newMeetings = [];
      if (recurrenceEndDate) {
        // Start from the parent meeting's date/time, but only create future occurrences
        const startDate = parentMeeting.startTime > today ? parentMeeting.startTime : today;
        
        // Create a template meeting for the helper function
        const templateMeeting = {
          ...parentMeeting.toObject(),
          _id: parentId,
          recurrence: {
            ...parentMeeting.recurrence,
            frequency: frequency
          }
        };

        newMeetings = await createRecurringMeetingsFromDate(templateMeeting, startDate, recurrenceEndDate);

        // Create calendar events for new meetings
        for (const newMeeting of newMeetings) {
          try {
            await queueCalendarCreate(newMeeting._id.toString());
          } catch (err) {
            console.error('Error creating calendar event for meeting:', newMeeting._id, err);
          }
        }
      }

      // Update the parent's calendar event if it exists
      try {
        await queueCalendarUpdate(parentId.toString());
      } catch (err) {
        console.error('Error updating parent calendar event:', err);
      }

      res.json({
        success: true,
        message: `Recurrence updated to ${frequency}. ${deleteResult.deletedCount} future meetings removed, ${newMeetings.length} new meetings created.`,
        deletedCount: deleteResult.deletedCount,
        createdCount: newMeetings.length,
        meeting: parentMeeting
      });
    } catch (error) {
      console.error('Update recurrence error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating recurrence settings'
      });
    }
  }
);

// Helper function to create recurring meetings from a specific start date
async function createRecurringMeetingsFromDate(parentMeeting, startDate, endDate) {
  const meetings = [];
  const frequency = parentMeeting.recurrence?.frequency || 'weekly';
  
  const duration = parentMeeting.endTime - parentMeeting.startTime;
  
  // Calculate interval in days
  const addDays = frequency === 'weekly' ? 7 : frequency === 'biweekly' ? 14 : frequency === 'triweekly' ? 21 : 30;
  
  // Start from the parent meeting's time but on/after startDate
  let currentDate = new Date(parentMeeting.startTime);
  
  // Advance to startDate if parent meeting is in the past
  while (currentDate < startDate) {
    currentDate = new Date(currentDate.getTime() + addDays * 24 * 60 * 60 * 1000);
  }
  
  // Skip the first occurrence if it matches the parent meeting exactly
  if (currentDate.getTime() === new Date(parentMeeting.startTime).getTime()) {
    currentDate = new Date(currentDate.getTime() + addDays * 24 * 60 * 60 * 1000);
  }
  
  while (currentDate <= endDate) {
    const newMeeting = new Meeting({
      student: parentMeeting.student,
      navigator: parentMeeting.navigator,
      title: parentMeeting.title,
      description: parentMeeting.description,
      startTime: currentDate,
      endTime: new Date(currentDate.getTime() + duration),
      duration: parentMeeting.duration,
      type: 'recurring',
      isRecurring: true,
      recurrence: {
        frequency: frequency,
        endDate: endDate,
        parentMeetingId: parentMeeting._id
      },
      location: parentMeeting.location,
      meetingLink: parentMeeting.meetingLink,
      createdBy: parentMeeting.createdBy
    });
    
    meetings.push(newMeeting);
    currentDate = new Date(currentDate.getTime() + addDays * 24 * 60 * 60 * 1000);
  }
  
  if (meetings.length > 0) {
    await Meeting.insertMany(meetings);
  }
  
  return meetings;
}

// Helper function to create recurring meetings
async function createRecurringMeetings(parentMeeting, endDate) {
  const meetings = [];
  const frequency = parentMeeting.recurrence?.frequency || 'weekly';
  
  let currentDate = new Date(parentMeeting.startTime);
  const duration = parentMeeting.endTime - parentMeeting.startTime;
  
  const addDays = frequency === 'weekly' ? 7 : frequency === 'biweekly' ? 14 : frequency === 'triweekly' ? 21 : 30;
  
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
