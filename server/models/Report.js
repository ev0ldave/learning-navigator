const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['individual_progress', 'group_progress', 'session_history', 'attendance', 'custom'],
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String
  },
  // Report scope
  scope: {
    // For individual reports
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    // For group reports
    students: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    // Date range
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    }
  },
  // Report data
  data: {
    // Summary statistics
    summary: {
      totalSessions: Number,
      completedSessions: Number,
      cancelledSessions: Number,
      noShowSessions: Number,
      totalDuration: Number, // in minutes
      averageSessionDuration: Number
    },
    // Session details
    sessions: [{
      meeting: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Meeting'
      },
      date: Date,
      duration: Number,
      status: String,
      notes: String,
      studentName: String,
      studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }],
    // Progress metrics
    progress: {
      attendanceRate: Number, // percentage
      goals: [{
        description: String,
        status: String,
        notes: String
      }],
      improvements: [String],
      areasForGrowth: [String]
    },
    // Custom data
    customFields: mongoose.Schema.Types.Mixed
  },
  // Export tracking
  exports: [{
    format: {
      type: String,
      enum: ['pdf', 'excel', 'csv', 'json']
    },
    exportedAt: {
      type: Date,
      default: Date.now
    },
    fileUrl: String,
    fileName: String
  }],
  // Report status
  status: {
    type: String,
    enum: ['draft', 'generated', 'shared'],
    default: 'generated'
  },
  // Sharing
  sharedWith: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    sharedAt: Date,
    accessLevel: {
      type: String,
      enum: ['view', 'download'],
      default: 'view'
    }
  }],
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

// Indexes
reportSchema.index({ generatedBy: 1, createdAt: -1 });
reportSchema.index({ type: 1 });
reportSchema.index({ 'scope.student': 1 });
reportSchema.index({ 'scope.startDate': 1, 'scope.endDate': 1 });

// Virtual for period description
reportSchema.virtual('periodDescription').get(function() {
  const start = this.scope.startDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  const end = this.scope.endDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
  return `${start} - ${end}`;
});

// Method to add export record
reportSchema.methods.addExport = async function(format, fileUrl, fileName) {
  this.exports.push({
    format,
    exportedAt: new Date(),
    fileUrl,
    fileName
  });
  return this.save();
};

// Method to share report
reportSchema.methods.shareWith = async function(userId, accessLevel = 'view') {
  const existingShare = this.sharedWith.find(s => s.user.toString() === userId.toString());
  if (!existingShare) {
    this.sharedWith.push({
      user: userId,
      sharedAt: new Date(),
      accessLevel
    });
    this.status = 'shared';
    return this.save();
  }
  return this;
};

// Static method to generate individual report
reportSchema.statics.generateIndividualReport = async function(navigatorId, studentId, startDate, endDate) {
  const Meeting = mongoose.model('Meeting');
  const Note = mongoose.model('Note');
  
  const meetings = await Meeting.find({
    navigator: navigatorId,
    student: studentId,
    startTime: { $gte: startDate, $lte: endDate }
  }).sort({ startTime: 1 });
  
  const notes = await Note.find({
    navigator: navigatorId,
    student: studentId,
    createdAt: { $gte: startDate, $lte: endDate }
  }).sort({ createdAt: -1 });
  
  const totalSessions = meetings.length;
  const completedSessions = meetings.filter(m => m.status === 'completed').length;
  const cancelledSessions = meetings.filter(m => m.status === 'cancelled').length;
  const noShowSessions = meetings.filter(m => m.status === 'no_show').length;
  const totalDuration = meetings.reduce((sum, m) => sum + (m.duration || 0), 0);
  
  return {
    summary: {
      totalSessions,
      completedSessions,
      cancelledSessions,
      noShowSessions,
      totalDuration,
      averageSessionDuration: totalSessions > 0 ? Math.round(totalDuration / totalSessions) : 0
    },
    sessions: meetings.map(m => ({
      meeting: m._id,
      date: m.startTime,
      duration: m.duration,
      status: m.status
    })),
    progress: {
      attendanceRate: totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0
    }
  };
};

// Transform output
reportSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Report', reportSchema);
