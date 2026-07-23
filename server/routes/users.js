const express = require('express');
const router = express.Router();
const { body, validationResult, param } = require('express-validator');
const { userRepository } = require('../repositories');
const userService = require('../services/userService');
const { UserValidationError } = require('../services/userService');
const { 
  isAuthenticated, 
  requireAdmin, 
  requireNavigator,
  requireOwnershipOrAdmin,
  validateObjectId
} = require('../middleware/auth');

// Validate ObjectId params
router.param('id', validateObjectId('id'));

/**
 * Error handler helper for UserValidationError
 */
const handleServiceError = (error, res) => {
  if (error instanceof UserValidationError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message
    });
  }
  console.error('Unexpected error:', error);
  return res.status(500).json({ success: false, message: 'An error occurred' });
};

// @route   POST /api/users/register
// @desc    Manually register a new user (admin/navigator only)
// @access  Private/Navigator
router.post('/register',
  isAuthenticated,
  requireNavigator,
  [
    body('email').trim().isEmail().withMessage('Valid email is required'),
    body('firstName').trim().notEmpty().withMessage('First name is required'),
    body('lastName').trim().notEmpty().withMessage('Last name is required'),
    body('role').optional().isIn(['student', 'learning_navigator', 'administrator']).withMessage('Invalid role'),
    body('phone').optional().trim(),
    body('assignedNavigator').optional().isMongoId().withMessage('Invalid navigator ID')
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

      const user = await userService.registerUser(req.body, req.user);

      res.status(201).json({
        success: true,
        message: 'User registered successfully. They can now log in with Google to activate their account.',
        user
      });
    } catch (error) {
      if (error instanceof UserValidationError) {
        return handleServiceError(error, res);
      }
      console.error('Register user error:', error);
      res.status(500).json({
        success: false,
        message: 'Error registering user'
      });
    }
  }
);

// @route   GET /api/users
// @desc    Get all users (admin only)
// @access  Private/Admin
router.get('/', isAuthenticated, requireAdmin, async (req, res) => {
  try {
    const { role, page = 1, limit = 20, search } = req.query;
    
    const query = {};
    if (role) query.role = role;
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [users, total] = await Promise.all([
      userRepository.find(query, {
        sort: { createdAt: -1 },
        skip,
        limit: parseInt(limit),
        populate: [{ path: 'assignedNavigator', select: 'firstName lastName email' }]
      }),
      userRepository.count(query)
    ]);
    
    res.json({
      success: true,
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users'
    });
  }
});

// @route   GET /api/users/navigators
// @desc    Get all learning navigators
// @access  Private
router.get('/navigators', isAuthenticated, async (req, res) => {
  try {
    const navigators = await userRepository.findAllNavigators(true);
    
    res.json({
      success: true,
      navigators
    });
  } catch (error) {
    console.error('Get navigators error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching navigators'
    });
  }
});

// @route   GET /api/users/students
// @desc    Get all students (for navigators)
// @access  Private/Navigator
router.get('/students', isAuthenticated, requireNavigator, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, assigned } = req.query;
    
    const query = { role: 'student', isActive: true };
    
    // Filter by assigned navigator
    if (assigned === 'me') {
      query.assignedNavigator = req.user._id;
    } else if (assigned === 'unassigned') {
      query.assignedNavigator = { $exists: false };
    }
    
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [students, total] = await Promise.all([
      userRepository.find(query, {
        sort: { lastName: 1, firstName: 1 },
        skip,
        limit: parseInt(limit),
        populate: [{ path: 'assignedNavigator', select: 'firstName lastName email' }]
      }),
      userRepository.count(query)
    ]);
    
    res.json({
      success: true,
      students,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching students'
    });
  }
});

// @route   GET /api/users/my-students
// @desc    Get students (all for admin/navigator to create notes)
// @access  Private/Navigator
router.get('/my-students', isAuthenticated, requireNavigator, async (req, res) => {
  try {
    console.log('my-students called by user:', req.user?.email, 'role:', req.user?.role);
    
    const students = await userRepository.findAllStudents({
      select: 'firstName lastName email profilePicture phone'
    });
    
    console.log('Found students:', students.length);
    
    res.json({
      success: true,
      students
    });
  } catch (error) {
    console.error('Get my students error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching students'
    });
  }
});

// @route   GET /api/users/:id
// @desc    Get user by ID
// @access  Private
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const user = await userRepository.findById(req.params.id, {
      populate: [
        { path: 'assignedNavigator', select: 'firstName lastName email profilePicture' },
        { path: 'students', select: 'firstName lastName email profilePicture' }
      ]
    });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check access using service
    if (!userService.hasViewAccess(user, req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user'
    });
  }
});

// @route   PUT /api/users/:id
// @desc    Update user profile
// @access  Private
router.put('/:id', 
  isAuthenticated,
  [
    body('firstName').optional().trim().notEmpty(),
    body('lastName').optional().trim().notEmpty(),
    body('phone').optional().trim(),
    body('bio').optional().trim().isLength({ max: 500 }),
    body('zoomLink').optional().trim().isURL().withMessage('Please enter a valid URL')
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
      
      // Use UserService for business logic
      const { user, meetingsUpdated } = await userService.updateProfile(
        req.params.id,
        req.body,
        req.user
      );
      
      res.json({
        success: true,
        message: meetingsUpdated > 0 
          ? `Profile updated successfully. ${meetingsUpdated} future meeting(s) updated with new Zoom link.`
          : 'Profile updated successfully',
        user,
        meetingsUpdated
      });
    } catch (error) {
      if (error instanceof UserValidationError) {
        return handleServiceError(error, res);
      }
      console.error('Update user error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating profile'
      });
    }
  }
);

// @route   PUT /api/users/:id/role
// @desc    Update user role (admin only)
// @access  Private/Admin
router.put('/:id/role', 
  isAuthenticated, 
  requireAdmin,
  [
    body('role').isIn(['student', 'learning_navigator', 'administrator'])
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
      
      // Use UserService for business logic
      const user = await userService.updateRole(req.params.id, req.body.role);
      
      res.json({
        success: true,
        message: 'User role updated successfully',
        user
      });
    } catch (error) {
      if (error instanceof UserValidationError) {
        return handleServiceError(error, res);
      }
      console.error('Update role error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating role'
      });
    }
  }
);

// @route   PUT /api/users/:id/assign-navigator
// @desc    Assign a navigator to a student
// @access  Private/Admin
router.put('/:id/assign-navigator',
  isAuthenticated,
  requireAdmin,
  [
    body('navigatorId').isMongoId()
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
      
      // Use UserService for business logic
      const student = await userService.assignNavigator(req.params.id, req.body.navigatorId);
      
      // Populate for response
      await student.populate('assignedNavigator', 'firstName lastName email');
      
      res.json({
        success: true,
        message: 'Navigator assigned successfully',
        student
      });
    } catch (error) {
      if (error instanceof UserValidationError) {
        return handleServiceError(error, res);
      }
      console.error('Assign navigator error:', error);
      res.status(500).json({
        success: false,
        message: 'Error assigning navigator'
      });
    }
  }
);

// @route   PUT /api/users/:id/availability
// @desc    Update navigator availability
// @access  Private/Navigator
router.put('/:id/availability',
  isAuthenticated,
  requireNavigator,
  async (req, res) => {
    try {
      // Only allow updating own availability
      if (req.user._id.toString() !== req.params.id && req.user.role !== 'administrator') {
        return res.status(403).json({
          success: false,
          message: 'You can only update your own availability'
        });
      }
      
      const { availability } = req.body;
      
      const user = await userRepository.updateById(req.params.id, { availability });
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      res.json({
        success: true,
        message: 'Availability updated successfully',
        availability: user.availability
      });
    } catch (error) {
      console.error('Update availability error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating availability'
      });
    }
  }
);

// @route   DELETE /api/users/:id
// @desc    Deactivate user (soft delete)
// @access  Private/Admin
router.delete('/:id', isAuthenticated, requireAdmin, async (req, res) => {
  try {
    // Use UserService for business logic
    await userService.deactivateUser(req.params.id);
    
    res.json({
      success: true,
      message: 'User deactivated successfully'
    });
  } catch (error) {
    if (error instanceof UserValidationError) {
      return handleServiceError(error, res);
    }
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deactivating user'
    });
  }
});

// @route   PUT /api/users/:id/status
// @desc    Enable or disable a user account
// @access  Private/Admin
router.put('/:id/status',
  isAuthenticated,
  requireAdmin,
  [
    body('isActive').isBoolean().withMessage('isActive must be a boolean')
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

      // Use UserService for business logic
      const user = await userService.updateStatus(
        req.params.id,
        req.body.isActive,
        req.user._id
      );

      res.json({
        success: true,
        message: `User account ${req.body.isActive ? 'enabled' : 'disabled'} successfully`,
        user
      });
    } catch (error) {
      if (error instanceof UserValidationError) {
        return handleServiceError(error, res);
      }
      console.error('Update user status error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating user status'
      });
    }
  }
);

module.exports = router;
