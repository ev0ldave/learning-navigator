const mongoose = require('mongoose');

// Schema for a single time slot within a day
const timeSlotSchema = new mongoose.Schema({
  startTime: {
    type: String, // Format: "HH:MM" (24-hour)
    required: true
  },
  endTime: {
    type: String, // Format: "HH:MM" (24-hour)
    required: true
  }
}, { _id: false });

// Schema for a day's availability
const dayAvailabilitySchema = new mongoose.Schema({
  enabled: {
    type: Boolean,
    default: false
  },
  slots: [timeSlotSchema]
}, { _id: false });

// Weekly working hours schema (like Outlook)
const weeklyHoursSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true // One schedule per user
  },
  timezone: {
    type: String,
    default: 'America/Los_Angeles'
  },
  // Days of week: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  sunday: {
    type: dayAvailabilitySchema,
    default: { enabled: false, slots: [] }
  },
  monday: {
    type: dayAvailabilitySchema,
    default: { enabled: true, slots: [{ startTime: '09:00', endTime: '17:00' }] }
  },
  tuesday: {
    type: dayAvailabilitySchema,
    default: { enabled: true, slots: [{ startTime: '09:00', endTime: '17:00' }] }
  },
  wednesday: {
    type: dayAvailabilitySchema,
    default: { enabled: true, slots: [{ startTime: '09:00', endTime: '17:00' }] }
  },
  thursday: {
    type: dayAvailabilitySchema,
    default: { enabled: true, slots: [{ startTime: '09:00', endTime: '17:00' }] }
  },
  friday: {
    type: dayAvailabilitySchema,
    default: { enabled: true, slots: [{ startTime: '09:00', endTime: '17:00' }] }
  },
  saturday: {
    type: dayAvailabilitySchema,
    default: { enabled: false, slots: [] }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp on save
weeklyHoursSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Helper method to get availability for a specific day number (0-6)
weeklyHoursSchema.methods.getAvailabilityForDay = function(dayNum) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return this[days[dayNum]];
};

// Note: user field already indexed via unique: true

module.exports = mongoose.model('WeeklyHours', weeklyHoursSchema);
