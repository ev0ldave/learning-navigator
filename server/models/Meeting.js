const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  navigator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    default: 'Learning Navigator Session'
  },
  description: {
    type: String,
    trim: true
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  duration: {
    type: Number, // in minutes
    default: 30
  },
  status: {
    type: String,
    enum: ['scheduled', 'confirmed', 'cancelled', 'completed', 'no_show'],
    default: 'scheduled'
  },
  type: {
    type: String,
    enum: ['initial', 'follow_up', 'recurring'],
    default: 'initial'
  },
  // Recurrence settings
  isRecurring: {
    type: Boolean,
    default: false
  },
  recurrence: {
    frequency: {
      type: String,
      enum: ['weekly', 'biweekly', 'triweekly', 'monthly'],
      default: 'weekly'
    },
    dayOfWeek: {
      type: Number, // 0-6 (Sunday-Saturday)
      min: 0,
      max: 6
    },
    endDate: Date,
    parentMeetingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Meeting'
    }
  },
  // Google Calendar integration
  googleEventId: {
    type: String
  },
  studentCalendarEventId: {
    type: String
  },
  navigatorCalendarEventId: {
    type: String
  },
  // Meeting location
  location: {
    type: String,
    enum: ['in_person', 'virtual', 'phone'],
    default: 'virtual'
  },
  meetingLink: {
    type: String
  },
  // Cancellation/Reschedule info
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  cancellationReason: {
    type: String
  },
  cancelledAt: {
    type: Date
  },
  rescheduledFrom: {
    type: Date
  },
  rescheduledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Notes attached to this meeting
  notes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Note'
  }],
  // Notifications sent
  notificationsSent: [{
    type: {
      type: String,
      enum: ['scheduled', 'reminder', 'cancelled', 'rescheduled']
    },
    sentAt: Date,
    sentTo: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Pre-save hook to set meeting link for virtual meetings
meetingSchema.pre('save', function(next) {
  if (this.location === 'virtual' && !this.meetingLink && process.env.ZOOM_LINK) {
    this.meetingLink = process.env.ZOOM_LINK;
  }
  next();
});

// Indexes for better query performance
meetingSchema.index({ student: 1, startTime: 1 });
meetingSchema.index({ navigator: 1, startTime: 1 });
meetingSchema.index({ status: 1 });
meetingSchema.index({ startTime: 1, endTime: 1 });
meetingSchema.index({ 'recurrence.parentMeetingId': 1 });

// Virtual for formatted date
meetingSchema.virtual('formattedDate').get(function() {
  return this.startTime.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
});

// Virtual for formatted time
meetingSchema.virtual('formattedTime').get(function() {
  if (!this.startTime || !this.endTime) {
    return '';
  }
  const start = this.startTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  const end = this.endTime.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  return `${start} - ${end}`;
});

// Method to check if meeting is in the past
meetingSchema.methods.isPast = function() {
  return this.endTime < new Date();
};

// Method to check if meeting is upcoming
meetingSchema.methods.isUpcoming = function() {
  return this.startTime > new Date();
};

// Method to cancel meeting
meetingSchema.methods.cancel = async function(userId, reason) {
  this.status = 'cancelled';
  this.cancelledBy = userId;
  this.cancellationReason = reason;
  this.cancelledAt = new Date();
  return this.save();
};

// Method to reschedule meeting
meetingSchema.methods.reschedule = async function(newStartTime, newEndTime, userId) {
  this.rescheduledFrom = this.startTime;
  this.rescheduledBy = userId;
  this.startTime = newStartTime;
  this.endTime = newEndTime;
  return this.save();
};

// Pre-save middleware to calculate duration
meetingSchema.pre('save', function(next) {
  if (this.startTime && this.endTime) {
    this.duration = Math.round((this.endTime - this.startTime) / (1000 * 60));
  }
  next();
});

// Transform output
meetingSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Meeting', meetingSchema);
