const BaseRepository = require('./BaseRepository');
const Report = require('../models/Report');

/**
 * Report Repository - Handles all Report data access
 * Single Responsibility: Data access operations for reports
 */
class ReportRepository extends BaseRepository {
  constructor() {
    super(Report);
  }

  /**
   * Find report by ID with full details
   */
  async findByIdWithDetails(id) {
    return this.findById(id, {
      populate: [
        { path: 'scope.student', select: 'firstName lastName email profilePicture' },
        { path: 'scope.students', select: 'firstName lastName email' },
        { path: 'generatedBy', select: 'firstName lastName' },
        { path: 'data.sessions.meeting' }
      ]
    });
  }

  /**
   * Find reports for a user based on role with pagination
   */
  async findForUser(userId, role, filters = {}, pagination = {}) {
    const query = {};
    
    // Admin can see all reports
    if (role !== 'administrator') {
      query.generatedBy = userId;
    }
    
    if (filters.type) {
      query.type = filters.type;
    }

    const skip = ((pagination.page || 1) - 1) * (pagination.limit || 20);

    const [reports, total] = await Promise.all([
      this.find(query, {
        sort: { createdAt: -1 },
        skip,
        limit: pagination.limit || 20,
        populate: [
          { path: 'scope.student', select: 'firstName lastName email' },
          { path: 'scope.students', select: 'firstName lastName email' },
          { path: 'generatedBy', select: 'firstName lastName' }
        ]
      }),
      this.count(query)
    ]);

    return { reports, total };
  }

  /**
   * Add export record to report
   */
  async addExport(id, format) {
    const report = await this.findById(id);
    if (!report) return null;
    
    report.exports.push({
      format,
      exportedAt: new Date()
    });
    await report.save();
    return report;
  }
}

// Export singleton instance and class for DI
const reportRepository = new ReportRepository();
module.exports = reportRepository;
module.exports.ReportRepository = ReportRepository;
