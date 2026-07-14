/**
 * Meeting Service - Single Responsibility: Meeting business logic
 * Extracts validation, conflict checking, and business rules from routes
 */
const { meetingRepository, userRepository, availabilityRepository } = require('../repositories');
const SchoolQuarter = require('../models/SchoolQuarter');
const { getPacificDayOfWeek, getPacificComponents } = require('../utils/timezone');

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Validation error class for business rule violations
 */
class MeetingValidationError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = 'MeetingValidationError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Meeting Service class - encapsulates all meeting-related business logic
 */
class MeetingService {
  constructor(
    meetingRepo = meetingRepository,
    userRepo = userRepository,
    availabilityRepo = availabilityRepository
  ) {
    // Dependency injection for testability
    this.meetingRepo = meetingRepo;
    this.userRepo = userRepo;
    this.availabilityRepo = availabilityRepo;
  }

  /**
   * Validate that navigator exists and is active
   */
  async validateNavigator(navigatorId) {
    const navigator = await this.userRepo.findNavigator(navigatorId);
    if (!navigator) {
      throw new MeetingValidationError('Invalid navigator');
    }
    return navigator;
  }

  /**
   * Check 24-hour advance booking rule for students
   */
  validateStudentAdvanceBooking(meetingStart, userRole) {
    if (userRole !== 'student') return;

    const now = new Date();
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    if (meetingStart < twentyFourHoursFromNow) {
      throw new MeetingValidationError(
        'Students cannot schedule meetings less than 24 hours in advance. Please select a later time or contact your learning navigator directly.'
      );
    }
  }

  /**
   * Validate meeting is within active school quarter
   */
  async validateQuarter(meetingStart) {
    const quarterCheck = await SchoolQuarter.isDateInActiveQuarter(meetingStart);
    if (!quarterCheck.valid && !quarterCheck.noQuarterSet) {
      throw new MeetingValidationError(quarterCheck.message, 400, {
        quarterInfo: {
          name: quarterCheck.quarterName,
          startDate: quarterCheck.startDate,
          endDate: quarterCheck.endDate
        }
      });
    }
    return quarterCheck;
  }

  /**
   * Check if meeting time falls within navigator's available hours
   */
  async validateAvailability(navigatorId, meetingStart, meetingEnd) {
    const weeklyHours = await this.availabilityRepo.findByUser(navigatorId);
    const dayOfWeek = getPacificDayOfWeek(meetingStart);
    const dayName = DAYS[dayOfWeek];

    const dayAvailability = weeklyHours ? weeklyHours[dayName] : null;

    // Check if the day is available
    if (!dayAvailability || !dayAvailability.enabled || !dayAvailability.slots || dayAvailability.slots.length === 0) {
      throw new MeetingValidationError(
        `The navigator is not available on ${dayName}. Please select a different date.`
      );
    }

    // Check if meeting time falls within any available slot
    const meetingStartPacific = getPacificComponents(meetingStart);
    const meetingEndPacific = getPacificComponents(meetingEnd);
    const meetingStartMinutes = meetingStartPacific.hours * 60 + meetingStartPacific.minutes;
    const meetingEndMinutes = meetingEndPacific.hours * 60 + meetingEndPacific.minutes;

    const isWithinAvailableSlot = dayAvailability.slots.some(slot => {
      const [slotStartHour, slotStartMin] = slot.startTime.split(':').map(Number);
      const [slotEndHour, slotEndMin] = slot.endTime.split(':').map(Number);
      const slotStartMinutes = slotStartHour * 60 + slotStartMin;
      const slotEndMinutes = slotEndHour * 60 + slotEndMin;

      return meetingStartMinutes >= slotStartMinutes && meetingEndMinutes <= slotEndMinutes;
    });

    if (!isWithinAvailableSlot) {
      const meetingTimeStr = `${String(meetingStartPacific.hours).padStart(2, '0')}:${String(meetingStartPacific.minutes).padStart(2, '0')}`;
      const availableTimesStr = dayAvailability.slots.map(s => `${s.startTime}-${s.endTime}`).join(', ');
      throw new MeetingValidationError(
        `The selected time (${meetingTimeStr} Pacific) is outside the navigator's available hours (${availableTimesStr}). Please select from the available time slots.`
      );
    }

    return { dayName, dayAvailability };
  }

  /**
   * Check for scheduling conflicts
   */
  async checkConflicts(navigatorId, startTime, endTime, excludeMeetingId = null) {
    const conflictingMeeting = await this.meetingRepo.findConflicting(
      navigatorId,
      startTime,
      endTime,
      excludeMeetingId
    );

    if (conflictingMeeting) {
      throw new MeetingValidationError(
        'The navigator already has a meeting scheduled during this time'
      );
    }
  }

  /**
   * Validate phone number is provided for phone meetings
   */
  validatePhoneMeeting(location, phoneNumber) {
    if (location === 'phone' && !phoneNumber) {
      throw new MeetingValidationError(
        'Phone number is required for phone meetings'
      );
    }
  }

  /**
   * Full validation for creating a new meeting
   */
  async validateBooking(meetingData, user) {
    const { navigatorId, startTime, endTime } = meetingData;
    const meetingStart = new Date(startTime);
    const meetingEnd = new Date(endTime);

    // Run all validations
    const navigator = await this.validateNavigator(navigatorId);
    this.validateStudentAdvanceBooking(meetingStart, user.role);
    this.validatePhoneMeeting(meetingData.location, meetingData.phoneNumber);
    await this.validateQuarter(meetingStart);
    await this.validateAvailability(navigatorId, meetingStart, meetingEnd);
    await this.checkConflicts(navigatorId, meetingStart, meetingEnd);

    return { navigator, meetingStart, meetingEnd };
  }

  /**
   * Calculate recurrence settings based on user role
   */
  async calculateRecurrenceSettings(isRecurring, userRole, recurrence) {
    if (!isRecurring) return { frequency: null, endDate: null };

    let frequency = 'weekly';
    let endDate = null;

    if (userRole === 'student') {
      // Students: force weekly until quarter end
      frequency = 'weekly';
      endDate = await SchoolQuarter.getRecurrenceEndDate(null);
    } else {
      // Navigators/Admins: use provided values, capped by quarter
      frequency = recurrence?.frequency || 'weekly';
      if (recurrence?.endDate) {
        endDate = await SchoolQuarter.getRecurrenceEndDate(new Date(recurrence.endDate));
      } else {
        endDate = await SchoolQuarter.getRecurrenceEndDate(null);
      }
    }

    return { frequency, endDate };
  }

  /**
   * Create a meeting
   */
  async createMeeting(meetingData, user) {
    // Validate booking
    const { navigator, meetingStart, meetingEnd } = await this.validateBooking(meetingData, user);

    // Determine student ID
    let studentId = user._id;
    if (user.role !== 'student' && meetingData.studentId) {
      studentId = meetingData.studentId;
    }

    // Calculate recurrence settings
    const { frequency: recurrenceFrequency, endDate: recurrenceEndDate } = 
      await this.calculateRecurrenceSettings(
        meetingData.isRecurring,
        user.role,
        meetingData.recurrence
      );

    // Determine meeting link for virtual meetings
    // Priority: explicit meetingLink > navigator's zoomLink > env fallback
    let meetingLink = meetingData.meetingLink;
    if (!meetingLink && meetingData.location !== 'phone') {
      meetingLink = navigator.zoomLink || process.env.ZOOM_LINK;
    }

    // Create the meeting
    const meeting = await this.meetingRepo.create({
      student: studentId,
      navigator: meetingData.navigatorId,
      title: meetingData.title || 'Learning Navigator Session',
      description: meetingData.description,
      startTime: meetingStart,
      endTime: meetingEnd,
      type: meetingData.isRecurring ? 'recurring' : 'initial',
      isRecurring: meetingData.isRecurring || false,
      recurrence: meetingData.isRecurring ? {
        frequency: recurrenceFrequency,
        dayOfWeek: meetingStart.getDay(),
        endDate: recurrenceEndDate
      } : undefined,
      location: meetingData.location || 'virtual',
      meetingLink: meetingLink,
      phoneNumber: meetingData.location === 'phone' ? meetingData.phoneNumber : undefined,
      createdBy: user._id
    });

    return { meeting, recurrenceEndDate };
  }

  /**
   * Update a meeting (reschedule)
   */
  async updateMeeting(meetingId, updateData, user) {
    const meeting = await this.meetingRepo.findById(meetingId);

    if (!meeting) {
      throw new MeetingValidationError('Meeting not found', 404);
    }

    // Check permissions
    const canUpdate = 
      user.role === 'administrator' ||
      meeting.student.toString() === user._id.toString() ||
      meeting.navigator.toString() === user._id.toString();

    if (!canUpdate) {
      throw new MeetingValidationError('You do not have permission to update this meeting', 403);
    }

    const { startTime, endTime, title, description, location, meetingLink, phoneNumber } = updateData;
    const isRescheduling = startTime || endTime;

    // Check for conflicts if rescheduling
    if (isRescheduling) {
      const newStart = startTime ? new Date(startTime) : meeting.startTime;
      const newEnd = endTime ? new Date(endTime) : meeting.endTime;

      await this.checkConflicts(meeting.navigator, newStart, newEnd, meeting._id);

      meeting.rescheduledFrom = meeting.startTime;
      meeting.rescheduledBy = user._id;
      if (startTime) meeting.startTime = newStart;
      if (endTime) meeting.endTime = newEnd;
    }

    if (title) meeting.title = title;
    if (description !== undefined) meeting.description = description;
    if (location) {
      // Validate phone number if changing to phone location
      if (location === 'phone' && !phoneNumber && !meeting.phoneNumber) {
        throw new MeetingValidationError('Phone number is required for phone meetings');
      }
      meeting.location = location;
    }
    if (meetingLink !== undefined) meeting.meetingLink = meetingLink;
    if (phoneNumber !== undefined) {
      meeting.phoneNumber = location === 'phone' || meeting.location === 'phone' ? phoneNumber : undefined;
    }

    await meeting.save();

    return { meeting, isRescheduling };
  }

  /**
   * Cancel a meeting
   */
  async cancelMeeting(meetingId, user, reason) {
    const meeting = await this.meetingRepo.findById(meetingId);

    if (!meeting) {
      throw new MeetingValidationError('Meeting not found', 404);
    }

    // Check permissions
    const canCancel = 
      user.role === 'administrator' ||
      meeting.student.toString() === user._id.toString() ||
      meeting.navigator.toString() === user._id.toString();

    if (!canCancel) {
      throw new MeetingValidationError('You do not have permission to cancel this meeting', 403);
    }

    meeting.status = 'cancelled';
    meeting.cancelledBy = user._id;
    meeting.cancellationReason = reason;
    meeting.cancelledAt = new Date();

    await meeting.save();

    return meeting;
  }

  /**
   * Mark meeting as completed
   */
  async completeMeeting(meetingId, user) {
    const meeting = await this.meetingRepo.findById(meetingId);

    if (!meeting) {
      throw new MeetingValidationError('Meeting not found', 404);
    }

    // Only navigator of the meeting or admin can mark as complete
    if (user.role !== 'administrator' && 
        meeting.navigator.toString() !== user._id.toString()) {
      throw new MeetingValidationError('Only the assigned navigator can complete this meeting', 403);
    }

    meeting.status = 'completed';
    await meeting.save();

    return meeting;
  }

  /**
   * Mark meeting as no-show
   */
  async markNoShow(meetingId, user) {
    const meeting = await this.meetingRepo.findById(meetingId);

    if (!meeting) {
      throw new MeetingValidationError('Meeting not found', 404);
    }

    if (user.role !== 'administrator' && 
        meeting.navigator.toString() !== user._id.toString()) {
      throw new MeetingValidationError('Only the assigned navigator can mark this meeting', 403);
    }

    meeting.status = 'no_show';
    await meeting.save();

    return meeting;
  }

  /**
   * Delete a recurring meeting series
   */
  async deleteRecurringSeries(meetingId, user, scope = 'all', reason = null) {
    const meeting = await this.meetingRepo.findById(meetingId);

    if (!meeting) {
      throw new MeetingValidationError('Meeting not found', 404);
    }

    if (!meeting.isRecurring) {
      throw new MeetingValidationError('This meeting is not part of a recurring series');
    }

    // Check permissions
    const canDelete = 
      user.role === 'administrator' ||
      meeting.student.toString() === user._id.toString() ||
      meeting.navigator.toString() === user._id.toString();

    if (!canDelete) {
      throw new MeetingValidationError('You do not have permission to delete this meeting series', 403);
    }

    // Determine the parent meeting ID
    const parentId = meeting.recurrence?.parentMeetingId || meeting._id;

    // Find all meetings in the series
    const meetingsToDelete = await this.meetingRepo.findSeriesMeetings(parentId, scope);

    if (meetingsToDelete.length === 0) {
      throw new MeetingValidationError('No active meetings found in this series', 404);
    }

    // Cancel all meetings
    const meetingIds = meetingsToDelete.map(m => m._id);
    await this.meetingRepo.cancelMeetings(meetingIds, user._id, reason || 'Recurring series deleted');

    return meetingsToDelete;
  }

  /**
   * Check user access to a meeting
   */
  hasAccess(meeting, user) {
    return (
      user.role === 'administrator' ||
      meeting.student._id.toString() === user._id.toString() ||
      meeting.navigator._id.toString() === user._id.toString()
    );
  }
}

// Export singleton instance
const meetingService = new MeetingService();

module.exports = meetingService;
module.exports.MeetingService = MeetingService;
module.exports.MeetingValidationError = MeetingValidationError;
