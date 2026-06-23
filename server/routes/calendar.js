const express = require('express');
const router = express.Router();
const Meeting = require('../models/Meeting');
const User = require('../models/User');
const WeeklyHours = require('../models/AvailableHours');
const { isAuthenticated, requireNavigator } = require('../middleware/auth');
const { 
  getPacificComponents, 
  getPacificDayOfWeek, 
  createPacificDate, 
  getPacificStartOfDay, 
  getPacificEndOfDay,
  parseDateAsPacific
} = require('../utils/timezone');

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// @route   GET /api/calendar/events
// @desc    Get calendar events for current user (meetings + weekly availability visualization)
// @access  Private
router.get('/events', isAuthenticated, async (req, res) => {
  try {
    const { start, end } = req.query;
    
    if (!start || !end) {
      return res.status(400).json({
        success: false,
        message: 'Start and end dates are required'
      });
    }
    
    const meetingQuery = {
      startTime: { $gte: new Date(start) },
      endTime: { $lte: new Date(end) },
      status: { $ne: 'cancelled' }
    };
    
    // Filter by user role
    if (req.user.role === 'student') {
      meetingQuery.student = req.user._id;
    } else if (req.user.role === 'learning_navigator') {
      meetingQuery.navigator = req.user._id;
    }
    // Admin sees all
    
    const meetings = await Meeting.find(meetingQuery)
      .populate('student', 'firstName lastName email profilePicture')
      .populate('navigator', 'firstName lastName email profilePicture');
    
    // Transform meetings to calendar event format
    const meetingEvents = meetings.map(meeting => ({
      id: meeting._id,
      title: meeting.title,
      start: meeting.startTime,
      end: meeting.endTime,
      status: meeting.status,
      location: meeting.location,
      meetingLink: meeting.meetingLink,
      student: meeting.student,
      navigator: meeting.navigator,
      isRecurring: meeting.isRecurring,
      color: getStatusColor(meeting.status),
      type: 'meeting'
    }));
    
    // Generate availability events from weekly schedule for navigators/admins
    let availableEvents = [];
    if (req.user.role === 'learning_navigator' || req.user.role === 'administrator') {
      const weeklyHours = await WeeklyHours.findOne({ user: req.user._id });
      
      if (weeklyHours) {
        availableEvents = generateWeeklyAvailabilityEvents(weeklyHours, new Date(start), new Date(end));
      }
    }
    
    res.json({
      success: true,
      events: [...meetingEvents, ...availableEvents]
    });
  } catch (error) {
    console.error('Get calendar events error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching calendar events'
    });
  }
});

// @route   GET /api/calendar/availability/:navigatorId
// @desc    Get navigator availability for a specific date
// @access  Private
router.get('/availability/:navigatorId', isAuthenticated, async (req, res) => {
  try {
    const { navigatorId } = req.params;
    const { date } = req.query;
    
    const navigator = await User.findOne({
      _id: navigatorId,
      role: { $in: ['learning_navigator', 'administrator'] }
    });
    
    if (!navigator) {
      return res.status(404).json({
        success: false,
        message: 'Navigator not found'
      });
    }
    
    // Parse the date as a Pacific calendar date (handles both YYYY-MM-DD and ISO formats)
    const { year, month, day, dayOfWeek } = parseDateAsPacific(date);
    const dayName = DAYS[dayOfWeek];
    
    // Get existing meetings for the date (use Pacific time boundaries)
    const startOfDay = createPacificDate(year, month, day, 0, 0, 0);
    const endOfDay = createPacificDate(year, month, day, 23, 59, 59);
    
    const existingMeetings = await Meeting.find({
      navigator: navigatorId,
      startTime: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ['scheduled', 'confirmed'] }
    });
    
    // Get weekly hours
    const weeklyHours = await WeeklyHours.findOne({ user: navigatorId });
    
    // Get day availability from weekly schedule
    const dayAvailability = weeklyHours ? weeklyHours[dayName] : { enabled: false, slots: [] };
    
    // Generate available time slots (pass user role for 24-hour restriction)
    // Pass the parsed date components to ensure correct Pacific date is used
    const availableSlots = generateSlotsFromWeeklySchedule(
      dayAvailability,
      existingMeetings,
      { year, month, day },
      30,
      req.user.role
    );
    
    res.json({
      success: true,
      dayAvailability,
      bookedSlots: existingMeetings.map(m => ({
        start: m.startTime,
        end: m.endTime
      })),
      availableSlots
    });
  } catch (error) {
    console.error('Get availability error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching availability'
    });
  }
});

// @route   GET /api/calendar/slots/:navigatorId
// @desc    Get available booking slots for a navigator over a date range
// @access  Private
router.get('/slots/:navigatorId', isAuthenticated, async (req, res) => {
  try {
    const { navigatorId } = req.params;
    const { startDate, endDate, duration = 30 } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start and end dates are required'
      });
    }
    
    const navigator = await User.findOne({
      _id: navigatorId,
      role: { $in: ['learning_navigator', 'administrator'] }
    });
    
    if (!navigator) {
      return res.status(404).json({
        success: false,
        message: 'Navigator not found'
      });
    }
    
    // Get existing meetings in date range
    const existingMeetings = await Meeting.find({
      navigator: navigatorId,
      startTime: { $gte: new Date(startDate), $lte: new Date(endDate) },
      status: { $in: ['scheduled', 'confirmed'] }
    });
    
    // Get weekly hours
    const weeklyHours = await WeeklyHours.findOne({ user: navigatorId });
    
    // If navigator hasn't set their availability, return empty slots
    if (!weeklyHours) {
      return res.json({
        success: true,
        slots: [],
        message: 'Navigator has not set their availability yet'
      });
    }
    
    // Generate available slots for each day
    const slots = [];
    
    // Parse dates and iterate through the range using Pacific dates
    const startComps = parseDateAsPacific(startDate);
    const endComps = parseDateAsPacific(endDate);
    
    // Create Pacific dates for iteration
    let current = createPacificDate(startComps.year, startComps.month, startComps.day, 12, 0, 0);
    const endPacific = createPacificDate(endComps.year, endComps.month, endComps.day, 12, 0, 0);
    
    while (current <= endPacific) {
      const currentComps = getPacificComponents(current);
      const dayOfWeek = currentComps.dayOfWeek;
      const dayName = DAYS[dayOfWeek];
      const dayAvailability = weeklyHours[dayName];
      
      const dayMeetings = existingMeetings.filter(m => {
        const meetingPacific = getPacificComponents(new Date(m.startTime));
        return meetingPacific.year === currentComps.year &&
               meetingPacific.month === currentComps.month &&
               meetingPacific.day === currentComps.day;
      });
      
      const daySlots = generateSlotsFromWeeklySchedule(
        dayAvailability,
        dayMeetings,
        { year: currentComps.year, month: currentComps.month, day: currentComps.day },
        parseInt(duration),
        req.user.role
      );
      
      slots.push(...daySlots);
      
      // Move to next day
      current = new Date(current.getTime() + 24 * 60 * 60 * 1000);
    }
    
    res.json({
      success: true,
      slots
    });
  } catch (error) {
    console.error('Get slots error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching available slots'
    });
  }
});

// Helper function to get status color
function getStatusColor(status) {
  switch (status) {
    case 'scheduled': return '#3788d8';
    case 'confirmed': return '#28a745';
    case 'completed': return '#6c757d';
    case 'cancelled': return '#dc3545';
    case 'no_show': return '#ffc107';
    default: return '#3788d8';
  }
}

// Helper function to generate calendar events from weekly schedule
function generateWeeklyAvailabilityEvents(weeklyHours, startDate, endDate) {
  const events = [];
  
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const currentDate = new Date(d);
    const dayOfWeek = getPacificDayOfWeek(currentDate);
    const dayName = DAYS[dayOfWeek];
    const dayAvailability = weeklyHours[dayName];
    
    if (dayAvailability && dayAvailability.enabled && dayAvailability.slots) {
      const { year, month, day } = getPacificComponents(currentDate);
      
      dayAvailability.slots.forEach((slot, index) => {
        const [startHour, startMin] = slot.startTime.split(':').map(Number);
        const [endHour, endMin] = slot.endTime.split(':').map(Number);
        
        // Create slot times in Pacific timezone
        const slotStart = createPacificDate(year, month, day, startHour, startMin, 0);
        const slotEnd = createPacificDate(year, month, day, endHour, endMin, 0);
        
        events.push({
          id: `availability-${currentDate.toISOString().split('T')[0]}-${index}`,
          title: 'Available',
          start: slotStart,
          end: slotEnd,
          color: '#4caf50', // Green for available
          type: 'availability',
          display: 'background' // Shows as background event
        });
      });
    }
  }
  
  return events;
}

// Helper function to generate time slots from weekly schedule
// date can be either a Date object or { year, month, day } components
function generateSlotsFromWeeklySchedule(dayAvailability, existingMeetings, date, slotDuration = 30, userRole = null) {
  const slots = [];
  
  if (!dayAvailability || !dayAvailability.enabled || !dayAvailability.slots || dayAvailability.slots.length === 0) {
    return slots;
  }
  
  // Calculate minimum booking time - students must book 24 hours in advance
  const now = new Date();
  const minBookingTime = userRole === 'student' 
    ? new Date(now.getTime() + 24 * 60 * 60 * 1000) 
    : now;
  
  // Get the date components - handle both Date objects and { year, month, day } objects
  let year, month, day;
  if (date instanceof Date) {
    const comps = getPacificComponents(date);
    year = comps.year;
    month = comps.month;
    day = comps.day;
  } else {
    // Already have { year, month, day } components
    year = date.year;
    month = date.month;
    day = date.day;
  }
  
  dayAvailability.slots.forEach(timeSlot => {
    const [startHour, startMin] = timeSlot.startTime.split(':').map(Number);
    const [endHour, endMin] = timeSlot.endTime.split(':').map(Number);
    
    // Create slot times in Pacific timezone
    let current = createPacificDate(year, month, day, startHour, startMin, 0);
    const endTime = createPacificDate(year, month, day, endHour, endMin, 0);
    
    while (current < endTime) {
      const slotEnd = new Date(current.getTime() + slotDuration * 60 * 1000);
      
      if (slotEnd > endTime) break;
      
      // Check if slot conflicts with existing meeting
      const hasMeetingConflict = existingMeetings.some(meeting => {
        const meetingStart = new Date(meeting.startTime);
        const meetingEnd = new Date(meeting.endTime);
        return current < meetingEnd && slotEnd > meetingStart;
      });
      
      // Only add slots that are bookable and don't conflict with meetings
      if (!hasMeetingConflict && current > minBookingTime) {
        slots.push({
          start: new Date(current),
          end: new Date(slotEnd),
          available: true
        });
      }
      
      current = new Date(current.getTime() + slotDuration * 60 * 1000);
    }
  });
  
  return slots;
}

module.exports = router;
