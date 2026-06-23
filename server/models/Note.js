const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
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
  meeting: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Meeting'
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  // Shared notes - visible to both student and navigator
  sharedContent: {
    type: String,
    default: ''
  },
  // Private notes - only visible to navigators/admins
  privateContent: {
    type: String,
    default: ''
  },
  // Legacy field - kept for backwards compatibility
  content: {
    type: String,
    default: ''
  },
  type: {
    type: String,
    enum: ['private', 'shared'],
    default: 'private'
  },
  // For shared notes
  sharedAt: {
    type: Date
  },
  emailSent: {
    type: Boolean,
    default: false
  },
  emailSentAt: {
    type: Date
  },
  // Tags for categorization
  tags: [{
    type: String,
    trim: true
  }],
  // Attachments (if any)
  attachments: [{
    filename: String,
    url: String,
    mimeType: String,
    size: Number,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Edit history
  editHistory: [{
    editedAt: Date,
    editedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    previousContent: String
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

// Indexes for better query performance
noteSchema.index({ student: 1, navigator: 1 });
noteSchema.index({ meeting: 1 });
noteSchema.index({ type: 1 });
noteSchema.index({ createdAt: -1 });
noteSchema.index({ tags: 1 });

// Virtual for preview (first 200 characters of shared content)
noteSchema.virtual('preview').get(function() {
  const content = this.sharedContent || this.content || '';
  if (content.length <= 200) return content;
  return content.substring(0, 200) + '...';
});

// Method to share note (make it visible to student)
noteSchema.methods.share = async function() {
  this.type = 'shared';
  this.sharedAt = new Date();
  return this.save();
};

// Method to track edits
noteSchema.methods.trackEdit = async function(userId, newSharedContent, newPrivateContent) {
  this.editHistory.push({
    editedAt: new Date(),
    editedBy: userId,
    previousContent: JSON.stringify({ shared: this.sharedContent, private: this.privateContent })
  });
  if (newSharedContent !== undefined) this.sharedContent = newSharedContent;
  if (newPrivateContent !== undefined) this.privateContent = newPrivateContent;
  return this.save();
};

// Static method to get notes by student
noteSchema.statics.getByStudent = function(studentId, navigatorId) {
  const query = { student: studentId };
  if (navigatorId) {
    query.navigator = navigatorId;
  }
  return this.find(query).sort({ createdAt: -1 });
};

// Static method to get private notes (navigator only)
noteSchema.statics.getPrivateNotes = function(studentId, navigatorId) {
  return this.find({
    student: studentId,
    navigator: navigatorId,
    type: 'private'
  }).sort({ createdAt: -1 });
};

// Static method to get shared notes
noteSchema.statics.getSharedNotes = function(studentId) {
  return this.find({
    student: studentId,
    type: 'shared'
  }).sort({ createdAt: -1 });
};

// Transform output
noteSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Note', noteSchema);
