const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Note = require('../models/Note');
const Meeting = require('../models/Meeting');
const User = require('../models/User');
const { 
  isAuthenticated, 
  requireNavigator,
  requireStudentAccess 
} = require('../middleware/auth');
const { sendNoteSharedNotification } = require('../services/notificationService');

// @route   GET /api/notes
// @desc    Get notes (filtered by user role)
// @access  Private
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const { studentId, type, page = 1, limit = 20 } = req.query;
    
    const query = {};
    
    // Students can only see shared notes about themselves
    if (req.user.role === 'student') {
      query.student = req.user._id;
      query.type = 'shared';
    } 
    // Navigators see notes they created
    else if (req.user.role === 'learning_navigator') {
      if (studentId) {
        query.student = studentId;
      }
      query.navigator = req.user._id;
      if (type) query.type = type;
    }
    // Admin sees all
    else {
      if (studentId) query.student = studentId;
      if (type) query.type = type;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    let [notes, total] = await Promise.all([
      Note.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('student', 'firstName lastName email')
        .populate('navigator', 'firstName lastName email')
        .populate('meeting', 'title startTime'),
      Note.countDocuments(query)
    ]);
    
    // Strip private content from notes for students
    if (req.user.role === 'student') {
      notes = notes.map(note => {
        const noteObj = note.toObject();
        delete noteObj.privateContent;
        return noteObj;
      });
    }
    
    res.json({
      success: true,
      notes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get notes error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notes'
    });
  }
});

// @route   GET /api/notes/student/:studentId
// @desc    Get notes for a specific student
// @access  Private
router.get('/student/:studentId', isAuthenticated, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { type } = req.query;
    
    const query = { student: studentId };
    
    // Admin can see all notes for the student
    if (req.user.role === 'administrator') {
      if (type) query.type = type;
    }
    // Students can only see shared notes
    else if (req.user.role === 'student') {
      if (req.user._id.toString() !== studentId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
      query.type = 'shared';
    }
    // Navigators can see all notes they or other navigators created for this student
    else if (req.user.role === 'learning_navigator') {
      // Show all notes for the student (not just navigator's own notes)
      // This allows seeing session notes from all navigators
      if (type) query.type = type;
    }
    
    const notes = await Note.find(query)
      .sort({ createdAt: -1 })
      .populate('navigator', 'firstName lastName')
      .populate('meeting', 'title startTime');
    
    res.json({
      success: true,
      notes
    });
  } catch (error) {
    console.error('Get student notes error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching notes'
    });
  }
});

// @route   GET /api/notes/meeting/:meetingId
// @desc    Get notes for a specific meeting
// @access  Private
router.get('/meeting/:meetingId', isAuthenticated, async (req, res) => {
  try {
    const { meetingId } = req.params;
    
    // Verify meeting exists and user has access
    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }
    
    // Check access
    const hasAccess = 
      req.user.role === 'administrator' ||
      meeting.student.toString() === req.user._id.toString() ||
      meeting.navigator.toString() === req.user._id.toString();
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const query = { meeting: meetingId };
    
    // Students can only see shared notes
    if (req.user.role === 'student') {
      query.type = 'shared';
    }
    
    const notes = await Note.find(query)
      .sort({ createdAt: -1 })
      .populate('navigator', 'firstName lastName')
      .populate('createdBy', 'firstName lastName');
    
    res.json({
      success: true,
      notes
    });
  } catch (error) {
    console.error('Get meeting notes error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching meeting notes'
    });
  }
});

// @route   GET /api/notes/:id
// @desc    Get note by ID
// @access  Private
router.get('/:id', isAuthenticated, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id)
      .populate('student', 'firstName lastName email')
      .populate('navigator', 'firstName lastName email')
      .populate('meeting', 'title startTime')
      .populate('createdBy', 'firstName lastName');
    
    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }
    
    // Check access
    const hasAccess = 
      req.user.role === 'administrator' ||
      note.navigator._id.toString() === req.user._id.toString() ||
      (note.type === 'shared' && note.student._id.toString() === req.user._id.toString());
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    res.json({
      success: true,
      note
    });
  } catch (error) {
    console.error('Get note error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching note'
    });
  }
});

// @route   POST /api/notes
// @desc    Create a new note
// @access  Private/Navigator
router.post('/',
  isAuthenticated,
  requireNavigator,
  [
    body('studentId').isMongoId().withMessage('Valid student ID required'),
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('sharedContent').optional().trim(),
    body('privateContent').optional().trim(),
    body('content').optional().trim(), // Legacy field
    body('type').optional().isIn(['private', 'shared']),
    body('meetingId').optional().isMongoId()
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
      
      const { studentId, title, sharedContent, privateContent, content, type, meetingId, tags } = req.body;
      
      // Require at least some content
      if (!sharedContent && !privateContent && !content) {
        return res.status(400).json({
          success: false,
          message: 'At least shared notes or private notes content is required'
        });
      }
      
      // Verify student exists
      const student = await User.findOne({ _id: studentId, role: 'student' });
      if (!student) {
        return res.status(400).json({
          success: false,
          message: 'Invalid student'
        });
      }
      
      // Verify meeting if provided
      if (meetingId) {
        const meeting = await Meeting.findById(meetingId);
        if (!meeting) {
          return res.status(400).json({
            success: false,
            message: 'Invalid meeting'
          });
        }
      }
      
      // Determine type based on content
      // If there's shared content, mark as shared so student can see it
      const noteType = sharedContent ? 'shared' : (type || 'private');
      
      const note = new Note({
        student: studentId,
        navigator: req.user._id,
        meeting: meetingId || undefined,
        title,
        sharedContent: sharedContent || '',
        privateContent: privateContent || '',
        content: content || sharedContent || '', // Legacy field fallback
        type: noteType,
        tags: tags || [],
        createdBy: req.user._id
      });
      
      await note.save();
      
      // If note is shared and attached to meeting, add to meeting notes
      if (meetingId) {
        await Meeting.findByIdAndUpdate(meetingId, {
          $push: { notes: note._id }
        });
      }
      
      // If shared, send notification and email
      if (noteType === 'shared') {
        note.sharedAt = new Date();
        await note.save();
        
        try {
          await sendNoteSharedNotification(note, student);
        } catch (notifError) {
          console.error('Note notification failed:', notifError);
        }
      }
      
      await note.populate([
        { path: 'student', select: 'firstName lastName email' },
        { path: 'navigator', select: 'firstName lastName email' }
      ]);
      
      res.status(201).json({
        success: true,
        message: 'Note created successfully',
        note
      });
    } catch (error) {
      console.error('Create note error:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating note'
      });
    }
  }
);

// @route   PUT /api/notes/:id
// @desc    Update a note
// @access  Private/Navigator
router.put('/:id',
  isAuthenticated,
  requireNavigator,
  [
    body('title').optional().trim().notEmpty(),
    body('sharedContent').optional().trim(),
    body('privateContent').optional().trim(),
    body('content').optional().trim(), // Legacy field
    body('tags').optional().isArray()
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
      
      const note = await Note.findById(req.params.id);
      
      if (!note) {
        return res.status(404).json({
          success: false,
          message: 'Note not found'
        });
      }
      
      // Only the creator or admin can edit
      if (req.user.role !== 'administrator' && 
          note.navigator.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'You can only edit your own notes'
        });
      }
      
      const { title, sharedContent, privateContent, content, tags } = req.body;
      
      // Track edit if content changed
      const contentChanged = 
        (sharedContent !== undefined && sharedContent !== note.sharedContent) ||
        (privateContent !== undefined && privateContent !== note.privateContent) ||
        (content !== undefined && content !== note.content);
      
      if (contentChanged) {
        note.editHistory.push({
          editedAt: new Date(),
          editedBy: req.user._id,
          previousContent: JSON.stringify({ 
            shared: note.sharedContent, 
            private: note.privateContent,
            content: note.content 
          })
        });
      }
      
      if (sharedContent !== undefined) note.sharedContent = sharedContent;
      if (privateContent !== undefined) note.privateContent = privateContent;
      if (content !== undefined) note.content = content;
      if (title) note.title = title;
      if (tags) note.tags = tags;
      
      // Update type based on shared content
      if (sharedContent) {
        note.type = 'shared';
        if (!note.sharedAt) note.sharedAt = new Date();
      }
      
      await note.save();
      
      await note.populate([
        { path: 'student', select: 'firstName lastName email' },
        { path: 'navigator', select: 'firstName lastName email' }
      ]);
      
      res.json({
        success: true,
        message: 'Note updated successfully',
        note
      });
    } catch (error) {
      console.error('Update note error:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating note'
      });
    }
  }
);

// @route   PUT /api/notes/:id/share
// @desc    Share a private note with student
// @access  Private/Navigator
router.put('/:id/share', isAuthenticated, requireNavigator, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    
    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }
    
    if (req.user.role !== 'administrator' && 
        note.navigator.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only share your own notes'
      });
    }
    
    if (note.type === 'shared') {
      return res.status(400).json({
        success: false,
        message: 'Note is already shared'
      });
    }
    
    note.type = 'shared';
    note.sharedAt = new Date();
    await note.save();
    
    // Get student for notification
    const student = await User.findById(note.student);
    
    // Send notification
    try {
      await sendNoteSharedNotification(note, student);
    } catch (notifError) {
      console.error('Note notification failed:', notifError);
    }
    
    await note.populate([
      { path: 'student', select: 'firstName lastName email' },
      { path: 'navigator', select: 'firstName lastName email' }
    ]);
    
    res.json({
      success: true,
      message: 'Note shared successfully',
      note
    });
  } catch (error) {
    console.error('Share note error:', error);
    res.status(500).json({
      success: false,
      message: 'Error sharing note'
    });
  }
});

// @route   DELETE /api/notes/:id
// @desc    Delete a note
// @access  Private/Navigator
router.delete('/:id', isAuthenticated, requireNavigator, async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    
    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }
    
    if (req.user.role !== 'administrator' && 
        note.navigator.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own notes'
      });
    }
    
    // Remove from meeting if attached
    if (note.meeting) {
      await Meeting.findByIdAndUpdate(note.meeting, {
        $pull: { notes: note._id }
      });
    }
    
    await Note.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Note deleted successfully'
    });
  } catch (error) {
    console.error('Delete note error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting note'
    });
  }
});

module.exports = router;
