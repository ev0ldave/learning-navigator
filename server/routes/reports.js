const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { reportRepository } = require('../repositories');
const reportService = require('../services/reportService');
const { ReportValidationError } = require('../services/reportService');
const { isAuthenticated, requireNavigator, validateObjectId } = require('../middleware/auth');
const { generateReportPDF } = require('../services/pdfService');
const { generateReportExcel } = require('../services/excelService');

// Validate ObjectId params
router.param('id', validateObjectId('id'));

/**
 * Error handler helper for ReportValidationError
 */
const handleServiceError = (error, res) => {
  if (error instanceof ReportValidationError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message
    });
  }
  console.error('Unexpected error:', error);
  return res.status(500).json({ success: false, message: 'An error occurred' });
};

// @route   GET /api/reports
// @desc    Get all reports for current user
// @access  Private/Navigator
router.get('/', isAuthenticated, requireNavigator, async (req, res) => {
  try {
    const { type, page = 1, limit = 20 } = req.query;
    
    const { reports, total } = await reportRepository.findForUser(
      req.user._id,
      req.user.role,
      { type },
      { page: parseInt(page), limit: parseInt(limit) }
    );
    
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
    const report = await reportRepository.findByIdWithDetails(req.params.id);
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }
    
    // Check access using service
    if (!reportService.hasViewAccess(report, req.user)) {
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
      
      // Use ReportService for business logic
      const report = await reportService.generateIndividualReport(req.body, req.user);
      
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
      if (error instanceof ReportValidationError) {
        return handleServiceError(error, res);
      }
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
      
      // Use ReportService for business logic
      const report = await reportService.generateGroupReport(req.body, req.user);
      
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
      if (error instanceof ReportValidationError) {
        return handleServiceError(error, res);
      }
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
      
      // Use ReportService for business logic
      const report = await reportService.generateSessionHistoryReport(req.body, req.user);
      
      res.status(201).json({
        success: true,
        message: 'Session history report generated successfully',
        report
      });
    } catch (error) {
      if (error instanceof ReportValidationError) {
        return handleServiceError(error, res);
      }
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
    
    if (!['pdf', 'json', 'xlsx'].includes(format)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid export format. Use pdf, xlsx, or json'
      });
    }
    
    const report = await reportRepository.findByIdWithDetails(id);
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }
    
    // Check access using service
    if (!reportService.hasViewAccess(report, req.user)) {
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
    
    // For Excel export
    if (format === 'xlsx') {
      try {
        const excelBuffer = await generateReportExcel(report);
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}_${timestamp}.xlsx"`);
        res.setHeader('Content-Length', excelBuffer.length);
        
        return res.send(Buffer.from(excelBuffer));
      } catch (excelError) {
        console.error('Excel generation error:', excelError);
        return res.status(500).json({
          success: false,
          message: 'Error generating Excel file'
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
    await reportRepository.addExport(id, format);
    
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
    // Use ReportService for business logic
    await reportService.deleteReport(req.params.id, req.user);
    
    res.json({
      success: true,
      message: 'Report deleted successfully'
    });
  } catch (error) {
    if (error instanceof ReportValidationError) {
      return handleServiceError(error, res);
    }
    console.error('Delete report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting report'
    });
  }
});

// @route   GET /api/reports/config/options
// @desc    Get available report dimensions and metrics
// @access  Private/Navigator
router.get('/config/options', isAuthenticated, requireNavigator, async (req, res) => {
  try {
    const options = reportService.getReportOptions();
    res.json({
      success: true,
      options
    });
  } catch (error) {
    console.error('Get report options error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching report options'
    });
  }
});

// @route   POST /api/reports/custom
// @desc    Generate a custom multi-dimensional report
// @access  Private/Navigator
router.post('/custom',
  isAuthenticated,
  requireNavigator,
  [
    body('title').optional().trim(),
    body('startDate').isISO8601().withMessage('Valid start date required'),
    body('endDate').isISO8601().withMessage('Valid end date required'),
    body('studentIds').optional().isArray(),
    body('studentIds.*').optional().isMongoId(),
    body('metrics').isArray({ min: 1 }).withMessage('At least one metric required'),
    body('metrics.*').isString(),
    body('groupBy').optional().isString(),
    body('includeDetails').optional().isBoolean(),
    body('filters').optional().isObject()
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
      
      const report = await reportService.generateCustomReport(req.body, req.user);
      
      await report.populate([
        { path: 'scope.student', select: 'firstName lastName email' },
        { path: 'scope.students', select: 'firstName lastName email' },
        { path: 'generatedBy', select: 'firstName lastName' }
      ]);
      
      res.status(201).json({
        success: true,
        message: 'Custom report generated successfully',
        report
      });
    } catch (error) {
      if (error instanceof ReportValidationError) {
        return handleServiceError(error, res);
      }
      console.error('Generate custom report error:', error);
      res.status(500).json({
        success: false,
        message: 'Error generating custom report'
      });
    }
  }
);

module.exports = router;
