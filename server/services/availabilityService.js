/**
 * Availability Service - Single Responsibility: Availability business logic
 * Extracts validation and business rules from routes
 */
const { availabilityRepository, meetingRepository } = require('../repositories');
const Meeting = require('../models/Meeting');
const {
  parseDateAsPacific,
  createPacificDate
} = require('../utils/timezone');

/**
 * Validation error class for business rule violations
 */
class AvailabilityValidationError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = 'AvailabilityValidationError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

// Valid day names
const VALID_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Availability Service class - encapsulates all availability-related business logic
 */
class AvailabilityService {
  constructor(availabilityRepo = availabilityRepository) {
    this.availabilityRepo = availabilityRepo;
  }

  /**
   * Validate time format (HH:MM)
   */
  isValidTimeFormat(time) {
    return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
  }

  /**
   * Validate slots array
   */
  validateSlots(slots) {
    if (!Array.isArray(slots)) return false;
    return slots.every(slot =>
      slot.startTime &&
      slot.endTime &&
      this.isValidTimeFormat(slot.startTime) &&
      this.isValidTimeFormat(slot.endTime) &&
      slot.startTime < slot.endTime
    );
  }

  /**
   * Validate day name
   */
  validateDayName(dayName) {
    if (!VALID_DAYS.includes(dayName.toLowerCase())) {
      throw new AvailabilityValidationError(
        'Invalid day name. Must be one of: sunday, monday, tuesday, wednesday, thursday, friday, saturday'
      );
    }
    return dayName.toLowerCase();
  }

  /**
   * Validate time slot
   */
  validateTimeSlot(startTime, endTime) {
    if (startTime >= endTime) {
      throw new AvailabilityValidationError('End time must be after start time');
    }
  }

  /**
   * Get or create weekly hours for user
   */
  async getOrCreateWeeklyHours(userId) {
    let weeklyHours = await this.availabilityRepo.findByUser(userId);

    if (!weeklyHours) {
      weeklyHours = await this.availabilityRepo.create({ user: userId });
    }

    return weeklyHours;
  }

  /**
   * Get weekly hours for a user (for booking)
   */
  async getWeeklyHoursForBooking(userId) {
    const weeklyHours = await this.availabilityRepo.findByUser(userId);

    if (!weeklyHours) {
      // Return empty availability if not configured
      return {
        user: userId,
        sunday: { enabled: false, slots: [] },
        monday: { enabled: false, slots: [] },
        tuesday: { enabled: false, slots: [] },
        wednesday: { enabled: false, slots: [] },
        thursday: { enabled: false, slots: [] },
        friday: { enabled: false, slots: [] },
        saturday: { enabled: false, slots: [] },
        _notConfigured: true
      };
    }

    return weeklyHours;
  }

  /**
   * Update weekly hours
   */
  async updateWeeklyHours(userId, updates) {
    const { sunday, monday, tuesday, wednesday, thursday, friday, saturday, timezone } = updates;

    // Validate each day's slots if provided
    const days = { sunday, monday, tuesday, wednesday, thursday, friday, saturday };
    for (const [dayName, dayData] of Object.entries(days)) {
      if (dayData && dayData.enabled && dayData.slots) {
        if (!this.validateSlots(dayData.slots)) {
          throw new AvailabilityValidationError(
            `Invalid time slots for ${dayName}. Times must be in HH:MM format and end time must be after start time.`
          );
        }
      }
    }

    let weeklyHours = await this.availabilityRepo.findByUser(userId);

    if (!weeklyHours) {
      weeklyHours = await this.availabilityRepo.create({ user: userId });
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
    return weeklyHours;
  }

  /**
   * Add availability block to a day
   */
  async addBlock(userId, dayName, startTime, endTime) {
    const day = this.validateDayName(dayName);
    this.validateTimeSlot(startTime, endTime);

    let weeklyHours = await this.getOrCreateWeeklyHours(userId);
    const dayData = weeklyHours[day];

    // Check for overlapping slots
    const hasOverlap = dayData.slots.some(slot => {
      return (startTime < slot.endTime && endTime > slot.startTime);
    });

    if (hasOverlap) {
      throw new AvailabilityValidationError('The new time slot overlaps with an existing slot');
    }

    // Add the new slot
    dayData.slots.push({ startTime, endTime });

    // Sort slots by start time
    dayData.slots.sort((a, b) => a.startTime.localeCompare(b.startTime));

    // Enable the day if not already enabled
    dayData.enabled = true;

    await weeklyHours.save();
    return weeklyHours;
  }

  /**
   * Remove availability block from a day
   */
  async removeBlock(userId, dayName, slotIndex) {
    const day = this.validateDayName(dayName);
    const index = parseInt(slotIndex);

    if (isNaN(index) || index < 0) {
      throw new AvailabilityValidationError('Invalid slot index');
    }

    const weeklyHours = await this.availabilityRepo.findByUser(userId);

    if (!weeklyHours) {
      throw new AvailabilityValidationError('No availability schedule found', 404);
    }

    const dayData = weeklyHours[day];

    if (index >= dayData.slots.length) {
      throw new AvailabilityValidationError('Slot index out of range');
    }

    // Remove the slot
    dayData.slots.splice(index, 1);

    // If no slots remain, disable the day
    if (dayData.slots.length === 0) {
      dayData.enabled = false;
    }

    await weeklyHours.save();
    return weeklyHours;
  }

  /**
   * Get available time slots for a specific date
   */
  async getAvailableSlots(userId, date, duration, userRole) {
    const weeklyHours = await this.availabilityRepo.findByUser(userId);

    if (!weeklyHours) {
      return { slots: [], message: 'Navigator has not set their availability yet' };
    }

    // Parse date as Pacific calendar date
    const { year, month, day, dayOfWeek } = parseDateAsPacific(date);
    const dayName = VALID_DAYS[dayOfWeek];
    const dayAvailability = weeklyHours[dayName];

    if (!dayAvailability || !dayAvailability.enabled) {
      return { slots: [], dayAvailability, message: 'No availability on this day' };
    }

    // Get existing meetings for this date
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
    const minBookingTime = userRole === 'student'
      ? new Date(now.getTime() + 24 * 60 * 60 * 1000)
      : now;

    dayAvailability.slots.forEach(timeSlot => {
      const [startHour, startMin] = timeSlot.startTime.split(':').map(Number);
      const [endHour, endMin] = timeSlot.endTime.split(':').map(Number);

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

    return { slots, dayAvailability };
  }
}

// Export singleton instance and class for DI
const availabilityService = new AvailabilityService();
module.exports = availabilityService;
module.exports.AvailabilityService = AvailabilityService;
module.exports.AvailabilityValidationError = AvailabilityValidationError;
