const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Report = require('../models/Report');
const Meeting = require('../models/Meeting');
const Note = require('../models/Note');
const User = require('../models/User');
const { isAuthenticated, requireNavigator } = require('../middleware/auth');
const { generateReportPDF } = require('../services/pdfService');

// @route   GET /api/reports
// @desc    Get all reports for current user
// @access  Private/Navigator
router.get('/', isAuthenticated, requireNavigator, async (req, res) => {
  try {
    const { type, page = 1, limit = 20 } = req.query;
    
    const query = { generatedBy: req.user._id };
    if (type) query.type = type;
    
    // Admin can see all reports
    if (req.user.role === 'administrator') {
      delete query.generatedBy;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [reports, total] = await Promise.all([
      Report.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('scope.student', 'firstName lastName email')
        .populate('scope.students', 'firstName lastName email')
        .populate('generatedBy', 'firstName lastName'),
      Report.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      reports,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get reports error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching reports'
    });
  }
});

// @route   GET /api/reports/:id
// @desc    Get report by ID
// @access  Private/Navigator
router.get('/:id', isAuthenticated, requireNavigator, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate('scope.student', 'firstName lastName email profilePicture')
      .populate('scope.students', 'firstName lastName email')
      .populate('generatedBy', 'firstName lastName')
      .populate('data.sessions.meeting');
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }
    
    // Check access
    const hasAccess = 
      req.user.role === 'administrator' ||
      report.generatedBy._id.toString() === req.user._id.toString() ||
      report.sharedWith.some(s => s.user.toString() === req.user._id.toString());
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    res.json({
      success: true,
      report
    });
  } catch (error) {
    console.error('Get report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching report'
    });
  }
});

// @route   POST /api/reports/individual
// @desc    Generate individual student progress report
// @access  Private/Navigator
router.post('/individual',
  isAuthenticated,
  requireNavigator,
  [
    body('studentId').isMongoId().withMessage('Valid student ID required'),
    body('startDate').isISO8601().withMessage('Valid start date required'),
    body('endDate').isISO8601().withMessage('Valid end date required'),
    body('title').optional().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }
      
      const { studentId, startDate, endDate, title } = req.body;
      
      // Verify student exists
      const student = await User.findById(studentId);
      if (!student) {
        return res.status(400).json({
          success: false,
          message: 'Student not found'
        });
      }
      
      // Generate report data
      const reportData = await Report.generateIndividualReport(
        req.user._id,
        studentId,
        new Date(startDate),
        new Date(endDate)
      );
      
      // Create report
      const report = new Report({
        generatedBy: req.user._id,
        type: 'individual_progress',
        title: title || `Progress Report - ${student.firstName} ${student.lastName}`,
        scope: {
          student: studentId,
          startDate: new Date(startDate),
          endDate: new Date(endDate)
        },
        data: reportData
      });
      
      await report.save();
      
      await report.populate([
        { path: 'scope.student', select: 'firstName lastName email' },
        { path: 'generatedBy', select: 'firstName lastName' }
      ]);
      
      res.status(201).json({
        success: true,
        message: 'Report generated successfully',
        report
      });
    } catch (error) {
      console.error('Generate individual report error:', error);
      res.status(500).json({
        success: false,
        message: 'Error generating report'
      });
    }
  }
);

// @route   POST /api/reports/group
// @desc    Generate group progress report
// @access  Private/Navigator
router.post('/group',
  isAuthenticated,
  requireNavigator,
  [
    body('studentIds').isArray({ min: 1 }).withMessage('At least one student required'),
    body('studentIds.*').isMongoId(),
    body('startDate').isISO8601().withMessage('Valid start date required'),
    body('endDate').isISO8601().withMessage('Valid end date required'),
    body('title').optional().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }
      
      const { studentIds, startDate, endDate, title } = req.body;
      
      // Build query - admins can see all meetings, navigators only their own
      const meetingQuery = {
        student: { $in: studentIds },
        startTime: { $gte: new Date(startDate), $lte: new Date(endDate) }
      };
      
      // Non-admin users can only see meetings where they are the navigator
      if (req.user.role !== 'administrator') {
        meetingQuery.navigator = req.user._id;
      }
      
      // Get all meetings for the students
      const meetings = await Meeting.find(meetingQuery)
        .populate('student', 'firstName lastName');
      
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
      
      const report = new Report({
        generatedBy: req.user._id,
        type: 'group_progress',
        title: title || `Group Progress Report`,
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
      
      await report.save();
      
      await report.populate([
        { path: 'scope.students', select: 'firstName lastName email' },
        { path: 'generatedBy', select: 'firstName lastName' }
      ]);
      
      res.status(201).json({
        success: true,
        message: 'Group report generated successfully',
        report
      });
    } catch (error) {
      console.error('Generate group report error:', error);
      res.status(500).json({
        success: false,
        message: 'Error generating report'
      });
    }
  }
);

// @route   POST /api/reports/session-history
// @desc    Generate session history report
// @access  Private/Navigator
router.post('/session-history',
  isAuthenticated,
  requireNavigator,
  [
    body('startDate').isISO8601(),
    body('endDate').isISO8601(),
    body('studentId').optional().isMongoId()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }
      
      const { startDate, endDate, studentId, title } = req.body;
      
      const meetingQuery = {
        navigator: req.user._id,
        startTime: { $gte: new Date(startDate), $lte: new Date(endDate) }
      };
      
      if (studentId) {
        meetingQuery.student = studentId;
      }
      
      const meetings = await Meeting.find(meetingQuery)
        .sort({ startTime: -1 })
        .populate('student', 'firstName lastName email')
        .populate('notes');
      
      // Get notes for these meetings
      const meetingIds = meetings.map(m => m._id);
      const notes = await Note.find({
        meeting: { $in: meetingIds },
        navigator: req.user._id
      });
      
      const report = new Report({
        generatedBy: req.user._id,
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
      
      await report.save();
      
      res.status(201).json({
        success: true,
        message: 'Session history report generated successfully',
        report
      });
    } catch (error) {
      console.error('Generate session history error:', error);
      res.status(500).json({
        success: false,
        message: 'Error generating report'
      });
    }
  }
);

// @route   GET /api/reports/:id/export/:format
// @desc    Export report in specified format
// @access  Private/Navigator
router.get('/:id/export/:format', isAuthenticated, requireNavigator, async (req, res) => {
  try {
    const { id, format } = req.params;
    
    if (!['pdf', 'json'].includes(format)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid export format. Use pdf or json'
      });
    }
    
    const report = await Report.findById(id)
      .populate('scope.student', 'firstName lastName email')
      .populate('scope.students', 'firstName lastName email')
      .populate('generatedBy', 'firstName lastName');
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }
    
    // Check access
    if (req.user.role !== 'administrator' && 
        report.generatedBy._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Generate filename
    const safeTitle = report.title.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    const timestamp = new Date().toISOString().split('T')[0];
    
    if (format === 'pdf') {
      try {
        const pdfBuffer = await generateReportPDF(report);
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_${timestamp}.pdf"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        
        return res.send(pdfBuffer);
      } catch (pdfError) {
        console.error('PDF generation error:', pdfError);
        return res.status(500).json({
          success: false,
          message: 'Error generating PDF'
        });
      }
    }
    
    // For JSON, return directly
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_${timestamp}.json"`);
      return res.json(report);
    }
    
    // Track export
    report.exports.push({
      format,
      exportedAt: new Date()
    });
    await report.save();
    
  } catch (error) {
    console.error('Export report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting report'
    });
  }
});

// @route   DELETE /api/reports/:id
// @desc    Delete a report
// @access  Private/Navigator
router.delete('/:id', isAuthenticated, requireNavigator, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }
    
    if (req.user.role !== 'administrator' && 
        report.generatedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own reports'
      });
    }
    
    await Report.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Report deleted successfully'
    });
  } catch (error) {
    console.error('Delete report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting report'
    });
  }
});

module.exports = router;
