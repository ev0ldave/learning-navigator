/**
 * Quarter Service - Single Responsibility: School quarter business logic
 * Extracts validation and business rules from routes
 */
const quarterRepository = require('../repositories/QuarterRepository');

/**
 * Validation error class for business rule violations
 */
class QuarterValidationError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = 'QuarterValidationError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Quarter Service class - encapsulates all quarter-related business logic
 */
class QuarterService {
  constructor(quarterRepo = quarterRepository) {
    this.quarterRepo = quarterRepo;
  }

  /**
   * Validate date range
   */
  validateDateRange(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (end <= start) {
      throw new QuarterValidationError('End date must be after start date');
    }
  }

  /**
   * Check if quarter already exists
   */
  async checkDuplicate(year, quarter) {
    const existing = await this.quarterRepo.findByYearAndQuarter(year, quarter);
    if (existing) {
      throw new QuarterValidationError(`${quarter} ${year} quarter already exists`);
    }
  }

  /**
   * Create a new school quarter
   */
  async createQuarter(quarterData, userId) {
    const { name, year, quarter, startDate, endDate, isActive } = quarterData;

    // Validate
    this.validateDateRange(startDate, endDate);
    await this.checkDuplicate(year, quarter);

    // Create quarter
    const newQuarter = await this.quarterRepo.create({
      name,
      year,
      quarter,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      isActive: isActive || false,
      createdBy: userId
    });

    return newQuarter;
  }

  /**
   * Update a school quarter
   */
  async updateQuarter(quarterId, updates) {
    const quarter = await this.quarterRepo.findById(quarterId);
    
    if (!quarter) {
      throw new QuarterValidationError('School quarter not found', 404);
    }

    const { name, year, quarter: quarterType, startDate, endDate, isActive } = updates;

    if (name) quarter.name = name;
    if (year) quarter.year = year;
    if (quarterType) quarter.quarter = quarterType;
    if (startDate) quarter.startDate = new Date(startDate);
    if (endDate) quarter.endDate = new Date(endDate);
    if (typeof isActive === 'boolean') quarter.isActive = isActive;

    // Validate date range
    this.validateDateRange(quarter.startDate, quarter.endDate);

    await quarter.save();
    return quarter;
  }

  /**
   * Activate a quarter
   */
  async activateQuarter(quarterId) {
    const quarter = await this.quarterRepo.activate(quarterId);
    
    if (!quarter) {
      throw new QuarterValidationError('School quarter not found', 404);
    }

    return quarter;
  }

  /**
   * Delete a quarter
   */
  async deleteQuarter(quarterId) {
    const quarter = await this.quarterRepo.findById(quarterId);
    
    if (!quarter) {
      throw new QuarterValidationError('School quarter not found', 404);
    }

    await quarter.deleteOne();
    return { deleted: true };
  }

  /**
   * Get active quarter
   */
  async getActiveQuarter() {
    return this.quarterRepo.findActive();
  }

  /**
   * Get all quarters
   */
  async getAllQuarters() {
    return this.quarterRepo.findAllSorted();
  }
}

// Export singleton instance and class for DI
const quarterService = new QuarterService();
module.exports = quarterService;
module.exports.QuarterService = QuarterService;
module.exports.QuarterValidationError = QuarterValidationError;
