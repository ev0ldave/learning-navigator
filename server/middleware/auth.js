const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

// Get JWT secret (fail fast if not configured in production)
const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be configured in production');
  }
  return secret || 'default-jwt-secret';
};

// Verify JWT token
const verifyToken = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = jwt.verify(token, getJwtSecret());
    
    // Get user from database
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }
    
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }
    
    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error'
    });
  }
};

// Check if user is authenticated (using session or JWT)
const isAuthenticated = async (req, res, next) => {
  // Check for session-based auth first
  if (req.isAuthenticated && req.isAuthenticated() && req.user) {
    return next();
  }
  
  // Fall back to JWT auth
  return verifyToken(req, res, next);
};

// Role-based access control
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated'
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to access this resource'
      });
    }
    
    next();
  };
};

// Require student role
const requireStudent = requireRole('student', 'administrator');

// Require learning navigator role
const requireNavigator = requireRole('learning_navigator', 'administrator');

// Require admin role
const requireAdmin = requireRole('administrator');

// Check if user owns the resource or is admin
const requireOwnershipOrAdmin = (userIdField = 'userId') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated'
      });
    }
    
    const resourceUserId = req.params[userIdField] || req.body[userIdField];
    
    // Admin can access anything
    if (req.user.role === 'administrator') {
      return next();
    }
    
    // Check if user owns the resource
    if (resourceUserId && req.user._id.toString() === resourceUserId.toString()) {
      return next();
    }
    
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to access this resource'
    });
  };
};

// Check if navigator has access to student
const requireStudentAccess = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Not authenticated'
    });
  }
  
  // Admin can access any student
  if (req.user.role === 'administrator') {
    return next();
  }
  
  const studentId = req.params.studentId || req.body.studentId;
  
  if (!studentId) {
    return res.status(400).json({
      success: false,
      message: 'Student ID required'
    });
  }
  
  // If user is the student themselves
  if (req.user._id.toString() === studentId) {
    return next();
  }
  
  // If user is a navigator, check if student is assigned to them
  if (req.user.role === 'learning_navigator') {
    const student = await User.findById(studentId);
    
    if (student && student.assignedNavigator && 
        student.assignedNavigator.toString() === req.user._id.toString()) {
      return next();
    }
  }
  
  return res.status(403).json({
    success: false,
    message: 'You do not have access to this student'
  });
};

// Validate MongoDB ObjectId in params (for router.param usage)
const validateObjectId = (paramName = 'id') => {
  return (req, res, next, value) => {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ${paramName} format`
      });
    }
    next();
  };
};

module.exports = {
  verifyToken,
  isAuthenticated,
  requireRole,
  requireStudent,
  requireNavigator,
  requireAdmin,
  requireOwnershipOrAdmin,
  requireStudentAccess,
  validateObjectId,
  getJwtSecret
};
