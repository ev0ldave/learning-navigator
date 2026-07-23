/**
 * User Service - Single Responsibility: User business logic
 * Extracts validation and business rules from routes
 */
const { userRepository } = require('../repositories');
const Meeting = require('../models/Meeting');
const { updateCalendarEvent } = require('./calendarService');

/**
 * Validation error class for business rule violations
 */
class UserValidationError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = 'UserValidationError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * User Service class - encapsulates all user-related business logic
 */
class UserService {
  constructor(userRepo = userRepository) {
    this.userRepo = userRepo;
  }

  /**
   * Check if user has access to view another user
   */
  hasViewAccess(targetUser, requestingUser) {
    if (requestingUser.role === 'administrator') return true;
    if (requestingUser._id.toString() === targetUser._id.toString()) return true;
    
    // Navigator can view assigned students
    if (requestingUser.role === 'learning_navigator') {
      const assignedNavigatorId = targetUser.assignedNavigator?._id || targetUser.assignedNavigator;
      if (assignedNavigatorId?.toString() === requestingUser._id.toString()) return true;
    }
    
    return false;
  }

  /**
   * Check if user can update another user
   */
  hasUpdateAccess(targetUserId, requestingUser) {
    if (requestingUser.role === 'administrator') return true;
    return requestingUser._id.toString() === targetUserId;
  }

  /**
   * Update user profile
   */
  async updateProfile(userId, updates, requestingUser) {
    if (!this.hasUpdateAccess(userId, requestingUser)) {
      throw new UserValidationError('You can only update your own profile', 403);
    }

    const { firstName, lastName, phone, bio, profilePicture, notificationPreferences, zoomLink } = updates;

    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (phone !== undefined) {
      updateData.phone = phone;
      if (phone && phone.trim()) {
        updateData.phonePromptShown = true;
      }
    }
    if (bio !== undefined) updateData.bio = bio;
    if (profilePicture !== undefined) updateData.profilePicture = profilePicture;

    // Handle zoom link for navigators/admins
    let zoomLinkChanged = false;
    let targetUser = null;
    if (zoomLink !== undefined) {
      targetUser = await this.userRepo.findById(userId);
      if (targetUser && (targetUser.role === 'learning_navigator' || targetUser.role === 'administrator')) {
        const newZoomLink = zoomLink || null;
        if (targetUser.zoomLink !== newZoomLink) {
          zoomLinkChanged = true;
        }
        updateData.zoomLink = newZoomLink;
      }
    }

    // Handle notification preferences
    if (notificationPreferences) {
      if (notificationPreferences.smsReminders && !phone) {
        const existingUser = await this.userRepo.findById(userId);
        const hasPhone = phone !== '' && (phone || existingUser?.phone);
        if (!hasPhone) {
          notificationPreferences.smsReminders = false;
        }
      }
      updateData.notificationPreferences = notificationPreferences;
    }

    // If phone is being cleared, disable smsReminders
    if (phone === '' || phone === null) {
      updateData['notificationPreferences.smsReminders'] = false;
    }

    const user = await this.userRepo.updateById(userId, updateData);

    if (!user) {
      throw new UserValidationError('User not found', 404);
    }

    // Update future meetings if zoom link changed
    let meetingsUpdated = 0;
    if (zoomLinkChanged && user.zoomLink) {
      meetingsUpdated = await this._updateMeetingsWithZoomLink(user);
    }

    return { user, meetingsUpdated };
  }

  /**
   * Update meetings with new zoom link
   */
  async _updateMeetingsWithZoomLink(user) {
    let meetingsUpdated = 0;
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
    } catch (error) {
      console.error('Error updating meetings with new zoom link:', error);
    }
    return meetingsUpdated;
  }

  /**
   * Update user role (admin only)
   */
  async updateRole(userId, newRole) {
    const user = await this.userRepo.updateById(userId, { role: newRole });

    if (!user) {
      throw new UserValidationError('User not found', 404);
    }

    return user;
  }

  /**
   * Assign navigator to student
   */
  async assignNavigator(studentId, navigatorId) {
    // Verify navigator exists and is valid
    const navigator = await this.userRepo.findNavigator(navigatorId);
    if (!navigator) {
      throw new UserValidationError('Invalid navigator');
    }

    // Update student
    const student = await this.userRepo.updateById(studentId, { assignedNavigator: navigatorId });

    if (!student) {
      throw new UserValidationError('Student not found', 404);
    }

    // Add student to navigator's list
    await this.userRepo.updateById(navigatorId, {
      $addToSet: { students: student._id }
    });

    return student;
  }

  /**
   * Update user status (enable/disable)
   */
  async updateStatus(userId, isActive, requestingUserId) {
    // Prevent admin from disabling their own account
    if (userId === requestingUserId.toString() && !isActive) {
      throw new UserValidationError('You cannot disable your own account');
    }

    const user = await this.userRepo.updateById(userId, { isActive });

    if (!user) {
      throw new UserValidationError('User not found', 404);
    }

    return user;
  }

  /**
   * Deactivate user (soft delete)
   */
  async deactivateUser(userId) {
    const user = await this.userRepo.updateById(userId, { isActive: false });

    if (!user) {
      throw new UserValidationError('User not found', 404);
    }

    return user;
  }

  /**
   * Manually register a new user (admin/navigator only)
   * When the user logs in with Google later, their account will be linked automatically
   */
  async registerUser(userData, requestingUser) {
    // Only admins and learning navigators can register users
    if (!['administrator', 'learning_navigator'].includes(requestingUser.role)) {
      throw new UserValidationError('Only administrators and learning navigators can register users', 403);
    }

    const { email, firstName, lastName, role = 'student', phone, assignedNavigator } = userData;

    // Validate required fields
    if (!email || !firstName || !lastName) {
      throw new UserValidationError('Email, first name, and last name are required');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new UserValidationError('Invalid email format');
    }

    // Check if user with this email already exists
    const existingUser = await this.userRepo.findByEmail(email);
    if (existingUser) {
      throw new UserValidationError('A user with this email already exists', 409);
    }

    // Only admins can create non-student roles
    if (role !== 'student' && requestingUser.role !== 'administrator') {
      throw new UserValidationError('Only administrators can create non-student accounts', 403);
    }

    // Validate role
    const validRoles = ['student', 'learning_navigator', 'administrator'];
    if (!validRoles.includes(role)) {
      throw new UserValidationError('Invalid role specified');
    }

    // Validate assigned navigator if provided
    if (assignedNavigator) {
      const navigator = await this.userRepo.findNavigator(assignedNavigator);
      if (!navigator) {
        throw new UserValidationError('Invalid navigator specified');
      }
    }

    // Create the user (without googleId - will be linked when they log in)
    const User = require('../models/User');
    const newUser = new User({
      email: email.toLowerCase(),
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role,
      phone: phone?.trim() || undefined,
      assignedNavigator: assignedNavigator || undefined,
      isActive: true
      // Note: googleId is NOT set - it will be set when user logs in with Google
    });

    await newUser.save();

    // If navigator was assigned, add student to navigator's students list
    if (assignedNavigator && role === 'student') {
      await this.userRepo.updateById(assignedNavigator, {
        $addToSet: { students: newUser._id }
      });
    }

    // Populate assigned navigator for response
    if (newUser.assignedNavigator) {
      await newUser.populate('assignedNavigator', 'firstName lastName email');
    }

    return newUser;
  }
}

// Export singleton instance and class for DI
const userService = new UserService();
module.exports = userService;
module.exports.UserService = UserService;
module.exports.UserValidationError = UserValidationError;
