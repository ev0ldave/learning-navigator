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
    // Summary statistics - Mixed to allow flexible metrics
    summary: mongoose.Schema.Types.Mixed,
    // Session details
    sessions: [{
      meeting: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Meeting'
      },
      date: Date,
      duration: Number,
      status: String,
      location: String,
      notes: String,
      studentName: String,
      studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      navigatorName: String
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
    // Grouped data for multi-dimensional reports
    grouped: mongoose.Schema.Types.Mixed,
    // Report configuration (metrics, groupBy, filters used)
    config: mongoose.Schema.Types.Mixed,
    // Custom data (legacy support)
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
// OPTIMIZATION: Uses aggregation pipeline for efficient statistics computation in database
reportSchema.statics.generateIndividualReport = async function(navigatorId, studentId, startDate, endDate) {
  const Meeting = mongoose.model('Meeting');
  const Note = mongoose.model('Note');
  
  // Single aggregation for meeting stats - more efficient than fetch + JS processing
  const [meetingStats] = await Meeting.aggregate([
    {
      $match: {
        navigator: new mongoose.Types.ObjectId(navigatorId),
        student: new mongoose.Types.ObjectId(studentId),
        startTime: { $gte: new Date(startDate), $lte: new Date(endDate) }
      }
    },
    {
      $facet: {
        // Summary statistics
        summary: [
          {
            $group: {
              _id: null,
              totalSessions: { $sum: 1 },
              totalDuration: { $sum: { $ifNull: ['$duration', 0] } },
              completedSessions: {
                $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
              },
              cancelledSessions: {
                $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
              },
              noShowSessions: {
                $sum: { $cond: [{ $eq: ['$status', 'no_show'] }, 1, 0] }
              }
            }
          }
        ],
        // Session details (sorted)
        sessions: [
          { $sort: { startTime: 1 } },
          {
            $project: {
              meeting: '$_id',
              date: '$startTime',
              duration: 1,
              status: 1
            }
          }
        ]
      }
    }
  ]);
  
  // Extract results with defaults for empty result sets
  const summary = meetingStats?.summary[0] || {
    totalSessions: 0,
    totalDuration: 0,
    completedSessions: 0,
    cancelledSessions: 0,
    noShowSessions: 0
  };
  
  const sessions = meetingStats?.sessions || [];
  
  // Calculate derived fields
  const averageSessionDuration = summary.totalSessions > 0 
    ? Math.round(summary.totalDuration / summary.totalSessions) 
    : 0;
  const attendanceRate = summary.totalSessions > 0 
    ? Math.round((summary.completedSessions / summary.totalSessions) * 100) 
    : 0;
  
  return {
    summary: {
      totalSessions: summary.totalSessions,
      completedSessions: summary.completedSessions,
      cancelledSessions: summary.cancelledSessions,
      noShowSessions: summary.noShowSessions,
      totalDuration: summary.totalDuration,
      averageSessionDuration
    },
    sessions,
    progress: {
      attendanceRate
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
