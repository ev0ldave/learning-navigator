const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { isAuthenticated } = require('../middleware/auth');

// @route   GET /api/notifications
// @desc    Get notifications for current user
// @access  Private
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly } = req.query;
    
    const query = { recipient: req.user._id };
    
    if (unreadOnly === 'true') {
      query['channels.inApp.read'] = false;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('sender', 'firstName lastName profilePicture')
        .populate('meeting', 'title startTime'),
      Notification.countDocuments(query),
      Notification.countDocuments({ 
        recipient: req.user._id, 
        'channels.inApp.read': false 
      })
    ]);
    
    res.json({
      success: true,
      notifications,
      unreadCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications'
    });
  }
});

// @route   GET /api/notifications/unread-count
// @desc    Get unread notification count
// @access  Private
router.get('/unread-count', isAuthenticated, async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      recipient: req.user._id,
      'channels.inApp.read': false
    });
    
    res.json({
      success: true,
      count
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching unread count'
    });
  }
});

// @route   PUT /api/notifications/:id/read
// @desc    Mark notification as read
// @access  Private
router.put('/:id/read', isAuthenticated, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { 
        _id: req.params.id, 
        recipient: req.user._id 
      },
      { 
        'channels.inApp.read': true,
        'channels.inApp.readAt': new Date()
      },
      { new: true }
    );
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
    
    res.json({
      success: true,
      notification
    });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking notification as read'
    });
  }
});

// @route   PUT /api/notifications/read-all
// @desc    Mark all notifications as read
// @access  Private
router.put('/read-all', isAuthenticated, async (req, res) => {
  try {
    await Notification.updateMany(
      { 
        recipient: req.user._id,
        'channels.inApp.read': false
      },
      { 
        'channels.inApp.read': true,
        'channels.inApp.readAt': new Date()
      }
    );
    
    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking notifications as read'
    });
  }
});

// @route   DELETE /api/notifications/:id
// @desc    Delete a notification
// @access  Private
router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      recipient: req.user._id
    });
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Notification deleted'
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting notification'
    });
  }
});

// @route   DELETE /api/notifications
// @desc    Delete all notifications
// @access  Private
router.delete('/', isAuthenticated, async (req, res) => {
  try {
    await Notification.deleteMany({ recipient: req.user._id });
    
    res.json({
      success: true,
      message: 'All notifications deleted'
    });
  } catch (error) {
    console.error('Delete all notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting notifications'
    });
  }
});

module.exports = router;
