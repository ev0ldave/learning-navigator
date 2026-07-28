/**
 * Report Service - Single Responsibility: Report business logic
 * Extracts validation and business rules from routes
 */
const { reportRepository, userRepository, meetingRepository, noteRepository } = require('../repositories');
const { metricsCalculator } = require('./reporting/MetricRegistry');
const { groupingEngine } = require('./reporting/GroupingRegistry');
const { displayFormatter } = require('./reporting/DisplayFormatter');

/**
 * Validation error class for business rule violations
 */
class ReportValidationError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = 'ReportValidationError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Report Service class - orchestrates report generation.
 * Depends on repository abstractions and dedicated metric/grouping/formatting
 * collaborators rather than concrete Mongoose models (Dependency Inversion),
 * and no longer computes metrics or formats labels itself (Single Responsibility).
 */
class ReportService {
  constructor({
    reportRepo = reportRepository,
    userRepo = userRepository,
    meetingRepo = meetingRepository,
    noteRepo = noteRepository,
    metrics = metricsCalculator,
    grouping = groupingEngine,
    formatter = displayFormatter
  } = {}) {
    this.reportRepo = reportRepo;
    this.userRepo = userRepo;
    this.meetingRepo = meetingRepo;
    this.noteRepo = noteRepo;
    this.metrics = metrics;
    this.grouping = grouping;
    this.formatter = formatter;
  }

  /**
   * Check if user has access to view a report
   */
  hasViewAccess(report, user) {
    if (user.role === 'administrator') return true;
    
    const generatedById = report.generatedBy._id || report.generatedBy;
    if (generatedById.toString() === user._id.toString()) return true;
    
    // Check if user is in sharedWith list
    if (report.sharedWith?.some(s => s.user.toString() === user._id.toString())) {
      return true;
    }
    
    return false;
  }

  /**
   * Check if user has access to edit/delete a report
   */
  hasEditAccess(report, user) {
    if (user.role === 'administrator') return true;
    
    const generatedById = report.generatedBy._id || report.generatedBy;
    return generatedById.toString() === user._id.toString();
  }

  /**
   * Validate student exists
   */
  async validateStudent(studentId) {
    const student = await this.userRepo.findById(studentId);
    if (!student) {
      throw new ReportValidationError('Student not found');
    }
    return student;
  }

  /**
   * Generate individual student progress report
   */
  async generateIndividualReport(reportData, user) {
    const { studentId, startDate, endDate, title } = reportData;

    const student = await this.validateStudent(studentId);

    // Generate report data via repository (aggregation detail stays in the repo)
    const data = await this.reportRepo.generateIndividualReportData(
      user._id,
      studentId,
      new Date(startDate),
      new Date(endDate)
    );

    const report = await this.reportRepo.create({
      generatedBy: user._id,
      type: 'individual_progress',
      title: title || `Progress Report - ${student.firstName} ${student.lastName}`,
      scope: {
        student: studentId,
        startDate: new Date(startDate),
        endDate: new Date(endDate)
      },
      data
    });

    return report;
  }

  /**
   * Generate group progress report
   */
  async generateGroupReport(reportData, user) {
    const { studentIds, startDate, endDate, title } = reportData;

    // Fetch meetings via repository (scoping by role handled inside)
    const meetings = await this.meetingRepo.findForGroupReport(
      { studentIds, startDate, endDate },
      user
    );

    // Calculate group statistics
    const totalSessions = meetings.length;
    const completedSessions = meetings.filter(m => m.status === 'completed').length;
    const cancelledSessions = meetings.filter(m => m.status === 'cancelled').length;
    const noShowSessions = meetings.filter(m => m.status === 'no_show').length;
    const totalDuration = meetings.reduce((sum, m) => sum + (m.duration || 0), 0);

    // Group by student
    const studentStats = {};
    meetings.forEach(meeting => {
      const studentId = meeting.student._id.toString();
      if (!studentStats[studentId]) {
        studentStats[studentId] = {
          student: meeting.student,
          totalSessions: 0,
          completed: 0,
          cancelled: 0,
          noShow: 0
        };
      }
      studentStats[studentId].totalSessions++;
      if (meeting.status === 'completed') studentStats[studentId].completed++;
      if (meeting.status === 'cancelled') studentStats[studentId].cancelled++;
      if (meeting.status === 'no_show') studentStats[studentId].noShow++;
    });

    const report = await this.reportRepo.create({
      generatedBy: user._id,
      type: 'group_progress',
      title: title || 'Group Progress Report',
      scope: {
        students: studentIds,
        startDate: new Date(startDate),
        endDate: new Date(endDate)
      },
      data: {
        summary: {
          totalSessions,
          completedSessions,
          cancelledSessions,
          noShowSessions,
          totalDuration,
          averageSessionDuration: totalSessions > 0 ? Math.round(totalDuration / totalSessions) : 0
        },
        sessions: meetings.map(m => {
          const studentName = m.student ? `${m.student.firstName || ''} ${m.student.lastName || ''}`.trim() : 'Unknown';
          return {
            meeting: m._id,
            date: m.startTime,
            duration: m.duration,
            status: m.status,
            studentName: studentName || 'Unknown',
            studentId: m.student?._id
          };
        }),
        progress: {
          attendanceRate: totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0
        },
        customFields: {
          studentBreakdown: Object.values(studentStats)
        }
      }
    });

    return report;
  }

  /**
   * Generate session history report
   */
  async generateSessionHistoryReport(reportData, user) {
    const { startDate, endDate, studentId, title } = reportData;

    const meetings = await this.meetingRepo.findForSessionHistory(
      { startDate, endDate, studentId },
      user
    );

    const meetingIds = meetings.map(m => m._id);
    const notes = await this.noteRepo.findForSessionHistory(meetingIds, user._id);

    const report = await this.reportRepo.create({
      generatedBy: user._id,
      type: 'session_history',
      title: title || 'Session History Report',
      scope: {
        student: studentId || undefined,
        startDate: new Date(startDate),
        endDate: new Date(endDate)
      },
      data: {
        summary: {
          totalSessions: meetings.length,
          completedSessions: meetings.filter(m => m.status === 'completed').length,
          cancelledSessions: meetings.filter(m => m.status === 'cancelled').length,
          noShowSessions: meetings.filter(m => m.status === 'no_show').length,
          totalDuration: meetings.reduce((sum, m) => sum + (m.duration || 0), 0)
        },
        sessions: meetings.map(m => ({
          meeting: m._id,
          date: m.startTime,
          duration: m.duration,
          status: m.status,
          student: m.student,
          notes: notes.filter(n => n.meeting?.toString() === m._id.toString()).length
        }))
      }
    });

    return report;
  }

  /**
   * Delete a report
   */
  async deleteReport(reportId, user) {
    const report = await this.reportRepo.findById(reportId);

    if (!report) {
      throw new ReportValidationError('Report not found', 404);
    }

    if (!this.hasEditAccess(report, user)) {
      throw new ReportValidationError('You can only delete your own reports', 403);
    }

    await this.reportRepo.deleteById(reportId);
    return { deleted: true };
  }

  /**
   * Get available report configuration options
   * Returns metrics, groupings, and filters that can be selected
   */
  getReportOptions() {
    return {
      metrics: [
        { id: 'totalSessions', label: 'Total Sessions', description: 'Count of all sessions in period', category: 'sessions' },
        { id: 'completedSessions', label: 'Completed Sessions', description: 'Sessions marked as completed', category: 'sessions' },
        { id: 'cancelledSessions', label: 'Cancelled Sessions', description: 'Sessions that were cancelled', category: 'sessions' },
        { id: 'noShowSessions', label: 'No-Show Sessions', description: 'Sessions where student did not attend', category: 'sessions' },
        { id: 'attendanceRate', label: 'Attendance Rate', description: 'Percentage of sessions completed', category: 'performance' },
        { id: 'totalDuration', label: 'Total Duration', description: 'Sum of all session durations (minutes)', category: 'time' },
        { id: 'averageDuration', label: 'Average Duration', description: 'Average session length (minutes)', category: 'time' },
        { id: 'noteCount', label: 'Notes Created', description: 'Number of notes written in period', category: 'engagement' },
        { id: 'sharedNotes', label: 'Shared Notes', description: 'Notes shared with students', category: 'engagement' },
        { id: 'meetingTypes', label: 'Meeting Types Breakdown', description: 'Distribution by meeting location type', category: 'breakdown' },
        { id: 'statusBreakdown', label: 'Status Breakdown', description: 'Distribution by meeting status', category: 'breakdown' },
        { id: 'weeklyTrend', label: 'Weekly Trend', description: 'Sessions per week over time', category: 'trends' },
        { id: 'monthlyTrend', label: 'Monthly Trend', description: 'Sessions per month over time', category: 'trends' }
      ],
      groupBy: [
        { id: 'none', label: 'No Grouping', description: 'Aggregate all data together' },
        { id: 'student', label: 'By Student', description: 'Break down metrics per student' },
        { id: 'week', label: 'By Week', description: 'Break down metrics by week' },
        { id: 'month', label: 'By Month', description: 'Break down metrics by month' },
        { id: 'status', label: 'By Status', description: 'Group by meeting status' },
        { id: 'location', label: 'By Location Type', description: 'Group by meeting location (virtual/in-person)' }
      ],
      filters: [
        { id: 'status', label: 'Meeting Status', type: 'multiselect', options: ['scheduled', 'completed', 'cancelled', 'no_show'] },
        { id: 'location', label: 'Location Type', type: 'multiselect', options: ['virtual', 'in_person', 'phone'] }
      ],
      detailOptions: [
        { id: 'sessionList', label: 'Include Session List', description: 'List individual sessions' },
        { id: 'notesSummary', label: 'Include Notes Summary', description: 'Summary of notes created' },
        { id: 'studentInfo', label: 'Include Student Details', description: 'Include student contact info' }
      ]
    };
  }

  /**
   * Generate a custom multi-dimensional report
   */
  async generateCustomReport(config, user) {
    const {
      title,
      startDate,
      endDate,
      studentIds = [],
      metrics = [],
      groupBy = 'none',
      includeDetails = false,
      filters = {}
    } = config;

    // Fetch meetings via repository (role scoping + filters handled inside)
    const meetings = await this.meetingRepo.findForCustomReport(
      { startDate, endDate, studentIds, filters },
      user
    );

    // Fetch notes if needed
    let notes = [];
    if (metrics.includes('noteCount') || metrics.includes('sharedNotes') || includeDetails) {
      notes = await this.noteRepo.findForCustomReport({ startDate, endDate, studentIds }, user);
    }

    // Calculate selected metrics
    const data = {
      summary: this._calculateMetrics(meetings, notes, metrics),
      config: { metrics, groupBy, filters, includeDetails }
    };

    // Apply grouping
    if (groupBy !== 'none') {
      data.grouped = this._groupData(meetings, notes, groupBy, metrics);
    }

    // Include session details if requested
    if (includeDetails) {
      data.sessions = meetings.map(m => ({
        meeting: m._id,
        date: m.startTime,
        duration: m.duration,
        status: m.status,
        location: m.location,
        studentName: m.student ? `${m.student.firstName} ${m.student.lastName}` : 'Unknown',
        studentId: m.student?._id,
        navigatorName: m.navigator ? `${m.navigator.firstName} ${m.navigator.lastName}` : 'Unknown'
      }));
    }

    // Determine report type and scope
    const reportType = studentIds.length === 1 ? 'individual_progress' : 'custom';
    const scope = {
      startDate: new Date(startDate),
      endDate: new Date(endDate)
    };
    
    if (studentIds.length === 1) {
      scope.student = studentIds[0];
    } else if (studentIds.length > 1) {
      scope.students = studentIds;
    }

    // Generate title if not provided
    const reportTitle = title || this._generateReportTitle(metrics, groupBy, studentIds, meetings);

    const report = await this.reportRepo.create({
      generatedBy: user._id,
      type: reportType,
      title: reportTitle,
      scope,
      data
    });

    return report;
  }

  /**
   * Calculate selected metrics from meeting data (delegates to MetricsCalculator).
   */
  _calculateMetrics(meetings, notes, selectedMetrics) {
    return this.metrics.calculate(meetings, notes, selectedMetrics);
  }

  /**
   * Group data by the specified dimension (delegates to the grouping engine).
   */
  _groupData(meetings, notes, groupBy, metrics) {
    return this.grouping.group(meetings, notes, groupBy, metrics);
  }

  /**
   * Generate a descriptive title based on report configuration
   */
  _generateReportTitle(metrics, groupBy, studentIds, meetings) {
    const parts = [];
    
    // Add scope
    if (studentIds.length === 1 && meetings.length > 0) {
      const student = meetings.find(m => m.student)?.student;
      if (student) {
        parts.push(`${student.firstName} ${student.lastName}`);
      }
    } else if (studentIds.length > 1) {
      parts.push(`${studentIds.length} Students`);
    } else {
      parts.push('All Students');
    }

    // Add grouping
    if (groupBy !== 'none') {
      parts.push(this.grouping.titleLabel(groupBy));
    }

    parts.push('Report');
    return parts.filter(Boolean).join(' ');
  }
}

// Export singleton instance and class for DI
const reportService = new ReportService();
module.exports = reportService;
module.exports.ReportService = ReportService;
module.exports.ReportValidationError = ReportValidationError;
