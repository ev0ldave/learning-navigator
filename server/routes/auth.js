const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { isAuthenticated, getJwtSecret } = require('../middleware/auth');
const { isEmailAllowed, determineRole, TEST_ACCOUNTS } = require('../config/passport');

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { userId: user._id, email: user.email, role: user.role },
    getJwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// @route   GET /api/auth/google
// @desc    Initiate Google OAuth
// @access  Public
router.get('/google', passport.authenticate('google', {
  scope: [
    'profile',
    'email',
    // Use app-created scope to avoid Google verification
    // This only allows access to calendars created by this app
    'https://www.googleapis.com/auth/calendar.app.created'
  ],
  accessType: 'offline',
  prompt: 'consent'
}));

// @route   GET /api/auth/google/callback
// @desc    Google OAuth callback
// @access  Public
router.get('/google/callback',
  passport.authenticate('google', { 
    failureRedirect: `${process.env.CLIENT_URL || 'http://localhost:3000'}/login?error=auth_failed`,
    session: true
  }),
  (req, res) => {
    // Generate JWT token
    const token = generateToken(req.user);
    
    // Redirect to frontend with token
    res.redirect(`${process.env.CLIENT_URL || 'http://localhost:3000'}/auth/callback?token=${token}`);
  }
);

// @route   POST /api/auth/local/register
// @desc    Register a local test account (development only)
// @access  Public (development only)
router.post('/local/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('firstName').trim().notEmpty(),
  body('lastName').trim().notEmpty()
], async (req, res) => {
  try {
    // Only allow in development/test
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        message: 'Local registration not allowed in production'
      });
    }
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    const { email, password, firstName, lastName } = req.body;
    const emailLower = email.toLowerCase();
    
    // Check if it's a test account
    if (!TEST_ACCOUNTS.map(e => e.toLowerCase()).includes(emailLower)) {
      return res.status(403).json({
        success: false,
        message: 'Only designated test accounts can be registered locally'
      });
    }
    
    // Check if user already exists
    let user = await User.findOne({ email: emailLower });
    if (user) {
      return res.status(400).json({
        success: false,
        message: 'User already exists'
      });
    }
    
    // Determine role
    const role = determineRole(emailLower);
    
    // Create user
    user = new User({
      email: emailLower,
      password,
      firstName,
      lastName,
      role,
      isActive: true
    });
    
    await user.save();
    
    // Generate token
    const token = generateToken(user);
    
    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      token,
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Local registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating account'
    });
  }
});

// @route   POST /api/auth/local/login
// @desc    Login with local test account (development only)
// @access  Public (development only)
router.post('/local/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  try {
    // Only allow in development/test
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        message: 'Local login not allowed in production'
      });
    }
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    const { email, password } = req.body;
    const emailLower = email.toLowerCase();
    
    // Find user with password
    const user = await User.findOne({ email: emailLower }).select('+password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    // Generate token
    const token = generateToken(user);
    
    res.json({
      success: true,
      token,
      user: {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Local login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error logging in'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('assignedNavigator', 'firstName lastName email profilePicture')
      .populate('students', 'firstName lastName email profilePicture');
    
    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', isAuthenticated, (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({
        success: false,
        message: 'Error logging out'
      });
    }
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  });
});

// @route   GET /api/auth/check
// @desc    Check if user is authenticated
// @access  Public
router.get('/check', async (req, res) => {
  try {
    // Check for Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.json({
        success: true,
        authenticated: false
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = jwt.verify(token, getJwtSecret());
    
    // Get user
    const user = await User.findById(decoded.userId);
    
    if (!user || !user.isActive) {
      return res.json({
        success: true,
        authenticated: false
      });
    }
    
    res.json({
      success: true,
      authenticated: true,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }
    });
  } catch (error) {
    res.json({
      success: true,
      authenticated: false
    });
  }
});

module.exports = router;
