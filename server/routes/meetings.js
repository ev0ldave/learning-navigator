const express = require('express');
const router = express.Router();
const { body, validationResult, query } = require('express-validator');
const Meeting = require('../models/Meeting');
const SchoolQuarter = require('../models/SchoolQuarter');
const { meetingRepository } = require('../repositories');
const meetingService = require('../services/meetingService');
const { MeetingValidationError } = require('../services/meetingService');
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

// Validate ObjectId params
router.param('id', validateObjectId('id'));

/**
 * Error handler helper for MeetingValidationError
 */
const handleServiceError = (error, res) => {
  if (error instanceof MeetingValidationError) {
    const response = { success: false, message: error.message };
    if (error.details) {
      Object.assign(response, error.details);
    }
    return res.status(error.statusCode).json(response);
  }
  console.error('Unexpected error:', error);
  return res.status(500).json({ success: false, message: 'An error occurred' });
};

// @route   GET /api/meetings
// @desc    Get meetings for current user
// @access  Private
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const { startDate, endDate, status, page = 1, limit = 50 } = req.query;
    
    const { meetings, total } = await meetingRepository.findForUser(
      req.user._id,
      req.user.role,
      { startDate, endDate, status },
      { page: parseInt(page), limit: parseInt(limit) }
    );
    
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
    const meetings = await meetingRepository.findUpcoming(req.user._id, req.user.role, 10);
    
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
    const meeting = await meetingRepository.findByIdWithDetails(req.params.id);
    
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }
    
    // Check access using service
    if (!meetingService.hasAccess(meeting, req.user)) {
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
    body('recurrence.frequency').optional().isIn(['weekly', 'biweekly', 'triweekly', 'monthly']),
    body('location').optional().isIn(['in_person', 'virtual', 'phone']),
    body('phoneNumber').optional().trim(),
    body('phoneNumber').custom((value, { req }) => {
      if (req.body.location === 'phone' && !value) {
        throw new Error('Phone number is required for phone meetings');
      }
      return true;
    }),
    body('isPastMeeting').optional().isBoolean(),
    body('status').optional().isIn(['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']),
    body('studentId').optional().isMongoId().withMessage('Valid student ID required')
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
      
      // Use MeetingService for business logic
      const { meeting, recurrenceEndDate, isRetroactive } = await meetingService.createMeeting(req.body, req.user);
      
      // Populate for response
      await meeting.populate([
        { path: 'student', select: 'firstName lastName email profilePicture' },
        { path: 'navigator', select: 'firstName lastName email profilePicture' }
      ]);
      
      // Only create calendar events and send notifications for future meetings
      if (!isRetroactive) {
        // Create Google Calendar event
        await queueCalendarCreate(meeting._id.toString());
        
        // Send notifications
        await queueMeetingNotification(meeting._id.toString(), 'scheduled');
        
        // If recurring, create future meetings
        if (req.body.isRecurring && recurrenceEndDate) {
          await createRecurringMeetings(meeting, recurrenceEndDate);
        }
      }
      
      res.status(201).json({
        success: true,
        message: isRetroactive ? 'Past meeting recorded successfully' : 'Meeting scheduled successfully',
        meeting
      });
    } catch (error) {
      if (error instanceof MeetingValidationError) {
        return handleServiceError(error, res);
      }
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
    body('location').optional().isIn(['in_person', 'virtual', 'phone']),
    body('phoneNumber').optional().trim(),
    body('phoneNumber').custom((value, { req }) => {
      // If changing to phone location, require phone number
      if (req.body.location === 'phone' && !value) {
        throw new Error('Phone number is required for phone meetings');
      }
      return true;
    })
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
      
      // Use MeetingService for business logic
      const { meeting, isRescheduling } = await meetingService.updateMeeting(
        req.params.id,
        req.body,
        req.user
      );
      
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
      if (error instanceof MeetingValidationError) {
        return handleServiceError(error, res);
      }
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
      // Use MeetingService for business logic
      const meeting = await meetingService.cancelMeeting(
        req.params.id,
        req.user,
        req.body.reason
      );
      
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
      if (error instanceof MeetingValidationError) {
        return handleServiceError(error, res);
      }
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
    // Use MeetingService for business logic
    const meeting = await meetingService.completeMeeting(req.params.id, req.user);
    
    res.json({
      success: true,
      message: 'Meeting marked as completed',
      meeting
    });
  } catch (error) {
    if (error instanceof MeetingValidationError) {
      return handleServiceError(error, res);
    }
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
    // Use MeetingService for business logic
    const meeting = await meetingService.markNoShow(req.params.id, req.user);
    
    res.json({
      success: true,
      message: 'Meeting marked as no-show',
      meeting
    });
  } catch (error) {
    if (error instanceof MeetingValidationError) {
      return handleServiceError(error, res);
    }
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

      // Use MeetingService for business logic
      const meetingsToDelete = await meetingService.deleteRecurringSeries(
        req.params.id,
        req.user,
        scope,
        reason
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
      if (error instanceof MeetingValidationError) {
        return handleServiceError(error, res);
      }
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
// @access  Private (navigator or admin only - students cannot modify)
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

      // Check permissions - only navigators and admins can update recurrence
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

      // Calculate new end date (capped by quarter)
      let recurrenceEndDate = endDate ? new Date(endDate) : parentMeeting.recurrence?.endDate;
      if (recurrenceEndDate) {
        recurrenceEndDate = await SchoolQuarter.getRecurrenceEndDate(recurrenceEndDate);
      }

      // Update the parent meeting's recurrence settings
      parentMeeting.recurrence = {
        ...parentMeeting.recurrence,
        frequency: frequency,
        endDate: recurrenceEndDate
      };
      await parentMeeting.save();

      // Recreate future meetings with new frequency if we have an end date
      let newMeetings = [];
      if (recurrenceEndDate) {
        newMeetings = await createRecurringMeetings(parentMeeting, recurrenceEndDate);

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
      phoneNumber: parentMeeting.phoneNumber,
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
