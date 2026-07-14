const BaseRepository = require('./BaseRepository');
const WeeklyHours = require('../models/AvailableHours');

/**
 * Availability Repository - Handles WeeklyHours data access
 */
class AvailabilityRepository extends BaseRepository {
  constructor() {
    super(WeeklyHours);
  }

  async findByUser(userId) {
    return this.findOne({ user: userId });
  }

  async upsertForUser(userId, availabilityData) {
    return this.model.findOneAndUpdate(
      { user: userId },
      { $set: availabilityData },
      { upsert: true, new: true }
    );
  }
}

// Export singleton instance
module.exports = new AvailabilityRepository();
module.exports.AvailabilityRepository = AvailabilityRepository;
