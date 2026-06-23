const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  type: {
    type: String,
    enum: [
      'meeting_scheduled',
      'meeting_cancelled',
      'meeting_rescheduled',
      'meeting_reminder',
      'note_shared',
      'profile_updated',
      'navigator_assigned',
      'system_announcement'
    ],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  // Related entities
  meeting: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Meeting'
  },
  note: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Note'
  },
  // Delivery status
  channels: {
    email: {
      enabled: {
        type: Boolean,
        default: true
      },
      sent: {
        type: Boolean,
        default: false
      },
      sentAt: Date,
      error: String
    },
    inApp: {
      enabled: {
        type: Boolean,
        default: true
      },
      read: {
        type: Boolean,
        default: false
      },
      readAt: Date
    }
  },
  // Priority
  priority: {
    type: String,
    enum: ['low', 'normal', 'high'],
    default: 'normal'
  },
  // Additional data
  metadata: {
    type: mongoose.Schema.Types.Mixed
  },
  // Scheduling
  scheduledFor: Date,
  expiresAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, 'channels.inApp.read': 1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ scheduledFor: 1 });

// Virtual for is read
notificationSchema.virtual('isRead').get(function() {
  return this.channels.inApp.read;
});

// Method to mark as read
notificationSchema.methods.markAsRead = async function() {
  this.channels.inApp.read = true;
  this.channels.inApp.readAt = new Date();
  return this.save();
};

// Method to mark email as sent
notificationSchema.methods.markEmailSent = async function() {
  this.channels.email.sent = true;
  this.channels.email.sentAt = new Date();
  return this.save();
};

// Static method to get unread count
notificationSchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({
    recipient: userId,
    'channels.inApp.read': false
  });
};

// Static method to get recent notifications
notificationSchema.statics.getRecent = function(userId, limit = 20) {
  return this.find({ recipient: userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('sender', 'firstName lastName profilePicture')
    .populate('meeting', 'title startTime');
};

// Transform output
notificationSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Notification', notificationSchema);
