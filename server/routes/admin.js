const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { isAuthenticated, requireAdmin } = require('../middleware/auth');
const { 
  getJobStats, 
  getFailedJobs, 
  retryJob, 
  cleanupOldJobs 
} = require('../services/jobQueue');
const quarterService = require('../services/quarterService');
const { QuarterValidationError } = require('../services/quarterService');

/**
 * Error handler helper for QuarterValidationError
 */
const handleServiceError = (error, res) => {
  if (error instanceof QuarterValidationError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message
    });
  }
  console.error('Unexpected error:', error);
  return res.status(500).json({ success: false, message: 'An error occurred' });
};

// @route   GET /api/admin/jobs/stats
// @desc    Get job queue statistics
// @access  Admin only
router.get('/jobs/stats', isAuthenticated, requireAdmin, async (req, res) => {
  try {
    const stats = await getJobStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting job stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching job statistics'
    });
  }
});

// @route   GET /api/admin/jobs/failed
// @desc    Get failed jobs
// @access  Admin only
router.get('/jobs/failed', isAuthenticated, requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const jobs = await getFailedJobs(limit);
    res.json({
      success: true,
      jobs,
      count: jobs.length
    });
  } catch (error) {
    console.error('Error getting failed jobs:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching failed jobs'
    });
  }
});

// @route   POST /api/admin/jobs/:id/retry
// @desc    Retry a failed job
// @access  Admin only
router.post('/jobs/:id/retry', isAuthenticated, requireAdmin, async (req, res) => {
  try {
    const result = await retryJob(req.params.id);
    res.json({
      success: true,
      message: 'Job scheduled for retry',
      ...result
    });
  } catch (error) {
    console.error('Error retrying job:', error);
    res.status(error.message === 'Job not found' ? 404 : 500).json({
      success: false,
      message: error.message || 'Error retrying job'
    });
  }
});

// @route   POST /api/admin/jobs/cleanup
// @desc    Clean up old completed jobs
// @access  Admin only
router.post('/jobs/cleanup', isAuthenticated, requireAdmin, async (req, res) => {
  try {
    const daysOld = parseInt(req.query.days) || 7;
    const result = await cleanupOldJobs(daysOld);
    res.json({
      success: true,
      message: `Cleaned up jobs older than ${daysOld} days`,
      ...result
    });
  } catch (error) {
    console.error('Error cleaning up jobs:', error);
    res.status(500).json({
      success: false,
      message: 'Error cleaning up jobs'
    });
  }
});

// ============================================================================
// School Quarter Management
// ============================================================================

// @route   GET /api/admin/quarters
// @desc    Get all school quarters
// @access  Admin only
router.get('/quarters', isAuthenticated, requireAdmin, async (req, res) => {
  try {
    const quarters = await quarterService.getAllQuarters();
    
    res.json({
      success: true,
      quarters
    });
  } catch (error) {
    console.error('Error fetching quarters:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching school quarters'
    });
  }
});

// @route   GET /api/admin/quarters/active
// @desc    Get the active school quarter
// @access  Private (any authenticated user)
router.get('/quarters/active', isAuthenticated, async (req, res) => {
  try {
    const activeQuarter = await quarterService.getActiveQuarter();
    
    res.json({
      success: true,
      quarter: activeQuarter || null,
      message: activeQuarter ? undefined : 'No active quarter set'
    });
  } catch (error) {
    console.error('Error fetching active quarter:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching active quarter'
    });
  }
});

// @route   POST /api/admin/quarters
// @desc    Create a new school quarter
// @access  Admin only
router.post('/quarters',
  isAuthenticated,
  requireAdmin,
  [
    body('name').trim().notEmpty().withMessage('Quarter name is required'),
    body('year').isInt({ min: 2020, max: 2100 }).withMessage('Valid year required'),
    body('quarter').isIn(['fall', 'winter', 'spring', 'summer']).withMessage('Valid quarter type required'),
    body('startDate').isISO8601().withMessage('Valid start date required'),
    body('endDate').isISO8601().withMessage('Valid end date required'),
    body('isActive').optional().isBoolean()
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

      // Use QuarterService for business logic
      const quarter = await quarterService.createQuarter(req.body, req.user._id);

      res.status(201).json({
        success: true,
        message: 'School quarter created successfully',
        quarter
      });
    } catch (error) {
      if (error instanceof QuarterValidationError) {
        return handleServiceError(error, res);
      }
      console.error('Error creating quarter:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating school quarter'
      });
    }
  }
);

// @route   PUT /api/admin/quarters/:id
// @desc    Update a school quarter
// @access  Admin only
router.put('/quarters/:id',
  isAuthenticated,
  requireAdmin,
  [
    body('name').optional().trim().notEmpty(),
    body('year').optional().isInt({ min: 2020, max: 2100 }),
    body('quarter').optional().isIn(['fall', 'winter', 'spring', 'summer']),
    body('startDate').optional().isISO8601(),
    body('endDate').optional().isISO8601(),
    body('isActive').optional().isBoolean()
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

      // Use QuarterService for business logic
      const quarter = await quarterService.updateQuarter(req.params.id, req.body);

      res.json({
        success: true,
        message: 'School quarter updated successfully',
        quarter
      });
    } catch (error) {
      if (error instanceof QuarterValidationError) {
        return handleServiceError(error, res);
      }
      console.error('Error updating quarter:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating school quarter'
      });
    }
  }
);

// @route   PUT /api/admin/quarters/:id/activate
// @desc    Set a quarter as the active quarter
// @access  Admin only
router.put('/quarters/:id/activate', isAuthenticated, requireAdmin, async (req, res) => {
  try {
    // Use QuarterService for business logic
    const quarter = await quarterService.activateQuarter(req.params.id);

    res.json({
      success: true,
      message: `${quarter.name} is now the active quarter`,
      quarter
    });
  } catch (error) {
    if (error instanceof QuarterValidationError) {
      return handleServiceError(error, res);
    }
    console.error('Error activating quarter:', error);
    res.status(500).json({
      success: false,
      message: 'Error activating school quarter'
    });
  }
});

// @route   DELETE /api/admin/quarters/:id
// @desc    Delete a school quarter
// @access  Admin only
router.delete('/quarters/:id', isAuthenticated, requireAdmin, async (req, res) => {
  try {
    // Use QuarterService for business logic
    await quarterService.deleteQuarter(req.params.id);

    res.json({
      success: true,
      message: 'School quarter deleted successfully'
    });
  } catch (error) {
    if (error instanceof QuarterValidationError) {
      return handleServiceError(error, res);
    }
    console.error('Error deleting quarter:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting school quarter'
    });
  }
});

module.exports = router;
