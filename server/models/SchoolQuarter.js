const mongoose = require('mongoose');

const schoolQuarterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  year: {
    type: Number,
    required: true
  },
  quarter: {
    type: String,
    enum: ['fall', 'winter', 'spring', 'summer'],
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Ensure only one active quarter at a time
schoolQuarterSchema.pre('save', async function(next) {
  if (this.isActive && this.isModified('isActive')) {
    // Deactivate all other quarters
    await this.constructor.updateMany(
      { _id: { $ne: this._id } },
      { isActive: false }
    );
  }
  next();
});

// Index for efficient lookups
schoolQuarterSchema.index({ year: 1, quarter: 1 }, { unique: true });
schoolQuarterSchema.index({ isActive: 1 });
schoolQuarterSchema.index({ startDate: 1, endDate: 1 });

// Static method to get the current active quarter
schoolQuarterSchema.statics.getActiveQuarter = async function() {
  return this.findOne({ isActive: true });
};

// Static method to check if a date is within the active quarter
schoolQuarterSchema.statics.isDateInActiveQuarter = async function(date) {
  const activeQuarter = await this.getActiveQuarter();
  if (!activeQuarter) {
    // No active quarter set, allow all dates
    return { valid: true, noQuarterSet: true };
  }
  
  const checkDate = new Date(date);
  const startDate = new Date(activeQuarter.startDate);
  const endDate = new Date(activeQuarter.endDate);
  
  // Set times to compare just dates
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);
  
  if (checkDate < startDate) {
    return {
      valid: false,
      reason: 'before_start',
      message: `Cannot schedule before the quarter start date (${startDate.toLocaleDateString()})`,
      quarterName: activeQuarter.name,
      startDate: activeQuarter.startDate,
      endDate: activeQuarter.endDate
    };
  }
  
  if (checkDate > endDate) {
    return {
      valid: false,
      reason: 'after_end',
      message: `Cannot schedule after the quarter end date (${endDate.toLocaleDateString()})`,
      quarterName: activeQuarter.name,
      startDate: activeQuarter.startDate,
      endDate: activeQuarter.endDate
    };
  }
  
  return {
    valid: true,
    quarterName: activeQuarter.name,
    startDate: activeQuarter.startDate,
    endDate: activeQuarter.endDate
  };
};

// Static method to get the quarter end date for recurring meeting limits
schoolQuarterSchema.statics.getRecurrenceEndDate = async function(requestedEndDate) {
  const activeQuarter = await this.getActiveQuarter();
  if (!activeQuarter) {
    // No active quarter, use requested end date
    return requestedEndDate ? new Date(requestedEndDate) : null;
  }
  
  const quarterEnd = new Date(activeQuarter.endDate);
  
  if (!requestedEndDate) {
    return quarterEnd;
  }
  
  const requested = new Date(requestedEndDate);
  
  // Return the earlier of the two dates
  return requested < quarterEnd ? requested : quarterEnd;
};

module.exports = mongoose.model('SchoolQuarter', schoolQuarterSchema);
