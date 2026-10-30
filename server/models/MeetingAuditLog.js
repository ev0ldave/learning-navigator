const mongoose = require('mongoose');

const meetingAuditLogSchema = new mongoose.Schema({
  meeting: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Meeting',
    required: true
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  navigator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  action: {
    type: String,
    enum: ['created', 'updated', 'rescheduled', 'cancelled', 'completed', 'no_show', 'recurrence_updated'],
    required: true
  },
  // Null when the change was made by an automated process
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // Name/role snapshot so history stays readable if the user is later renamed or removed
  performedByName: {
    type: String,
    required: true
  },
  performedByRole: {
    type: String,
    required: true
  },
  changes: [{
    _id: false,
    field: String,
    from: mongoose.Schema.Types.Mixed,
    to: mongoose.Schema.Types.Mixed
  }],
  details: String,
  // Meeting state right after the change
  snapshot: {
    title: String,
    startTime: Date,
    endTime: Date,
    status: String,
    location: String
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

meetingAuditLogSchema.index({ student: 1, createdAt: -1 });
meetingAuditLogSchema.index({ meeting: 1, createdAt: -1 });

module.exports = mongoose.model('MeetingAuditLog', meetingAuditLogSchema);
