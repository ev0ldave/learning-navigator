const express = require('express');
const router = express.Router();
const { body, validationResult, query } = require('express-validator');
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
        
        // If recurring, create future meetings and their calendar events
        if (req.body.isRecurring && recurrenceEndDate) {
          const recurringMeetings = await meetingService.generateRecurringMeetings(meeting, recurrenceEndDate);
          for (const child of recurringMeetings) {
            try {
              await queueCalendarCreate(child._id.toString());
            } catch (err) {
              console.error('Error creating calendar event for recurring meeting:', child._id, err);
            }
          }
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

      const { frequency } = req.body;

      // Delegate DB/business logic to the service
      const result = await meetingService.updateRecurrence(req.params.id, req.body, req.user);

      if (result.noChanges) {
        return res.json({
          success: true,
          message: 'No changes made',
          meeting: result.parentMeeting
        });
      }

      // Reconcile calendar side effects for removed future meetings
      // Pass the full document so its calendar event IDs are available for deletion
      for (const removed of result.deletedMeetings) {
        try {
          await queueCalendarDelete(removed);
        } catch (err) {
          console.error('Error deleting calendar event for meeting:', removed._id, err);
        }
      }

      // Create calendar events for the newly generated meetings
      for (const newMeeting of result.newMeetings) {
        try {
          await queueCalendarCreate(newMeeting._id.toString());
        } catch (err) {
          console.error('Error creating calendar event for meeting:', newMeeting._id, err);
        }
      }

      // Update the parent's calendar event if it exists
      try {
        await queueCalendarUpdate(result.parentId.toString());
      } catch (err) {
        console.error('Error updating parent calendar event:', err);
      }

      res.json({
        success: true,
        message: `Recurrence updated to ${frequency}. ${result.deletedCount} future meetings removed, ${result.newMeetings.length} new meetings created.`,
        deletedCount: result.deletedCount,
        createdCount: result.newMeetings.length,
        meeting: result.parentMeeting
      });
    } catch (error) {
      if (error instanceof MeetingValidationError) {
        return handleServiceError(error, res);
      }
      console.error('Update recurrence error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating recurrence settings'
      });
    }
  }
);

module.exports = router;
