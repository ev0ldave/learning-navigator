const BaseRepository = require('./BaseRepository');
const SchoolQuarter = require('../models/SchoolQuarter');

/**
 * Quarter Repository - Handles all SchoolQuarter data access
 * Single Responsibility: Data access operations for school quarters
 */
class QuarterRepository extends BaseRepository {
  constructor() {
    super(SchoolQuarter);
  }

  /**
   * Find all quarters sorted by year and quarter
   */
  async findAllSorted() {
    return this.find({}, {
      sort: { year: -1, quarter: 1 },
      populate: [{ path: 'createdBy', select: 'firstName lastName email' }]
    });
  }

  /**
   * Find active quarter
   */
  async findActive() {
    return this.findOne({ isActive: true });
  }

  /**
   * Find quarter by year and quarter type
   */
  async findByYearAndQuarter(year, quarter) {
    return this.findOne({ year, quarter });
  }

  /**
   * Activate a quarter (deactivates all others via model hook)
   */
  async activate(id) {
    const quarter = await this.findById(id);
    if (!quarter) return null;
    
    quarter.isActive = true;
    await quarter.save(); // Pre-save hook deactivates others
    return quarter;
  }
}

// Export singleton instance and class for DI
const quarterRepository = new QuarterRepository();
module.exports = quarterRepository;
module.exports.QuarterRepository = QuarterRepository;
