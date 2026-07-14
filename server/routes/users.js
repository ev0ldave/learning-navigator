const express = require('express');
const router = express.Router();
const { body, validationResult, param } = require('express-validator');
const User = require('../models/User');
const Meeting = require('../models/Meeting');
const { updateCalendarEvent } = require('../services/calendarService');
const { 
  isAuthenticated, 
  requireAdmin, 
  requireNavigator,
  requireOwnershipOrAdmin,
  validateObjectId
} = require('../middleware/auth');

// Validate ObjectId params
router.param('id', validateObjectId('id'));

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
      User.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('assignedNavigator', 'firstName lastName email'),
      User.countDocuments(query)
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
    const navigators = await User.find({ 
      role: { $in: ['learning_navigator', 'administrator'] },
      isActive: true
    }).select('firstName lastName email profilePicture availability zoomLink');
    
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
      User.find(query)
        .sort({ lastName: 1, firstName: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('assignedNavigator', 'firstName lastName email'),
      User.countDocuments(query)
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
    
    const query = {
      role: 'student',
      isActive: true
    };
    
    // Both admins and navigators can see all students
    // This allows creating notes for any student
    
    const students = await User.find(query)
      .select('firstName lastName email profilePicture phone')
      .sort({ lastName: 1, firstName: 1 });
    
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
    const user = await User.findById(req.params.id)
      .populate('assignedNavigator', 'firstName lastName email profilePicture')
      .populate('students', 'firstName lastName email profilePicture');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check access permissions
    // Note: assignedNavigator is populated, so we need to check _id
    const assignedNavigatorId = user.assignedNavigator?._id || user.assignedNavigator;
    const canAccess = 
      req.user.role === 'administrator' ||
      req.user._id.toString() === user._id.toString() ||
      (req.user.role === 'learning_navigator' && assignedNavigatorId?.toString() === req.user._id.toString());
    
    if (!canAccess) {
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
      
      // Check permissions
      const canUpdate = 
        req.user.role === 'administrator' ||
        req.user._id.toString() === req.params.id;
      
      if (!canUpdate) {
        return res.status(403).json({
          success: false,
          message: 'You can only update your own profile'
        });
      }
      
      const { firstName, lastName, phone, bio, profilePicture, notificationPreferences, zoomLink } = req.body;
      
      const updateData = {};
      if (firstName) updateData.firstName = firstName;
      if (lastName) updateData.lastName = lastName;
      if (phone !== undefined) {
        updateData.phone = phone;
        // Mark phone prompt as shown when user provides a phone number
        if (phone && phone.trim()) {
          updateData.phonePromptShown = true;
        }
      }
      if (bio !== undefined) updateData.bio = bio;
      if (profilePicture !== undefined) updateData.profilePicture = profilePicture;
      
      // Only allow navigators/admins to set zoom link
      let zoomLinkChanged = false;
      let oldZoomLink = null;
      if (zoomLink !== undefined) {
        const targetUser = await User.findById(req.params.id);
        if (targetUser && (targetUser.role === 'learning_navigator' || targetUser.role === 'administrator')) {
          const newZoomLink = zoomLink || null;
          if (targetUser.zoomLink !== newZoomLink) {
            zoomLinkChanged = true;
            oldZoomLink = targetUser.zoomLink;
          }
          updateData.zoomLink = newZoomLink;
        }
      }
      
      if (notificationPreferences) {
        // Automatically disable smsReminders if no phone number
        if (notificationPreferences.smsReminders && !phone) {
          // Check if phone is being cleared or if user already has no phone
          const existingUser = await User.findById(req.params.id);
          const hasPhone = phone !== '' && (phone || existingUser?.phone);
          if (!hasPhone) {
            notificationPreferences.smsReminders = false;
          }
        }
        updateData.notificationPreferences = notificationPreferences;
      }
      
      // If phone is being cleared, also disable smsReminders
      if (phone === '' || phone === null) {
        updateData['notificationPreferences.smsReminders'] = false;
      }
      
      const user = await User.findByIdAndUpdate(
        req.params.id,
        updateData,
        { new: true, runValidators: true }
      );
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // If zoom link changed, update all future virtual meetings for this navigator
      let meetingsUpdated = 0;
      if (zoomLinkChanged && user.zoomLink) {
        try {
          const now = new Date();
          const futureMeetings = await Meeting.find({
            navigator: user._id,
            startTime: { $gt: now },
            status: { $in: ['scheduled', 'confirmed'] },
            location: 'virtual'
          }).populate('student navigator');
          
          for (const meeting of futureMeetings) {
            meeting.meetingLink = user.zoomLink;
            await meeting.save();
            
            // Update Google Calendar event
            try {
              await updateCalendarEvent(meeting);
            } catch (calError) {
              console.warn(`Failed to update calendar for meeting ${meeting._id}:`, calError.message);
            }
            
            meetingsUpdated++;
          }
          
          if (meetingsUpdated > 0) {
            console.log(`Updated ${meetingsUpdated} meetings with new zoom link for ${user.email}`);
          }
        } catch (meetingError) {
          console.error('Error updating meetings with new zoom link:', meetingError);
          // Don't fail the profile update if meeting sync fails
        }
      }
      
      res.json({
        success: true,
        message: meetingsUpdated > 0 
          ? `Profile updated successfully. ${meetingsUpdated} future meeting(s) updated with new Zoom link.`
          : 'Profile updated successfully',
        user,
        meetingsUpdated
      });
    } catch (error) {
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
      
      const user = await User.findByIdAndUpdate(
        req.params.id,
        { role: req.body.role },
        { new: true }
      );
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      res.json({
        success: true,
        message: 'User role updated successfully',
        user
      });
    } catch (error) {
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
      
      const { navigatorId } = req.body;
      
      // Verify navigator exists and is a navigator
      const navigator = await User.findOne({
        _id: navigatorId,
        role: { $in: ['learning_navigator', 'administrator'] }
      });
      
      if (!navigator) {
        return res.status(400).json({
          success: false,
          message: 'Invalid navigator'
        });
      }
      
      // Update student
      const student = await User.findByIdAndUpdate(
        req.params.id,
        { assignedNavigator: navigatorId },
        { new: true }
      ).populate('assignedNavigator', 'firstName lastName email');
      
      if (!student) {
        return res.status(404).json({
          success: false,
          message: 'Student not found'
        });
      }
      
      // Add student to navigator's list
      await User.findByIdAndUpdate(navigatorId, {
        $addToSet: { students: student._id }
      });
      
      res.json({
        success: true,
        message: 'Navigator assigned successfully',
        student
      });
    } catch (error) {
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
      
      const user = await User.findByIdAndUpdate(
        req.params.id,
        { availability },
        { new: true }
      );
      
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
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: 'User deactivated successfully'
    });
  } catch (error) {
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

      const { isActive } = req.body;
      
      // Prevent admin from disabling their own account
      if (req.params.id === req.user._id.toString() && !isActive) {
        return res.status(400).json({
          success: false,
          message: 'You cannot disable your own account'
        });
      }

      const user = await User.findByIdAndUpdate(
        req.params.id,
        { isActive },
        { new: true }
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        message: `User account ${isActive ? 'enabled' : 'disabled'} successfully`,
        user
      });
    } catch (error) {
      console.error('Update user status error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating user status'
      });
    }
  }
);

module.exports = router;
