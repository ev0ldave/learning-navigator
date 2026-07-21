const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { noteRepository, meetingRepository } = require('../repositories');
const noteService = require('../services/noteService');
const { NoteValidationError } = require('../services/noteService');
const { 
  isAuthenticated, 
  requireNavigator,
  requireStudentAccess,
  validateObjectId
} = require('../middleware/auth');

// Validate ObjectId params
router.param('id', validateObjectId('id'));

/**
 * Error handler helper for NoteValidationError
 */
const handleServiceError = (error, res) => {
  if (error instanceof NoteValidationError) {
    const response = { success: false, message: error.message };
    if (error.details) {
      Object.assign(response, error.details);
    }
    return res.status(error.statusCode).json(response);
  }
  console.error('Unexpected error:', error);
  return res.status(500).json({ success: false, message: 'An error occurred' });
};

// @route   GET /api/notes
// @desc    Get notes (filtered by user role)
// @access  Private
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const { studentId, type, page = 1, limit = 20 } = req.query;
    
    const { notes, total } = await noteRepository.findForUser(
      req.user._id,
      req.user.role,
      { studentId, type },
      { page: parseInt(page), limit: parseInt(limit) }
    );
    
    // Strip private content from notes for students
    const sanitizedNotes = req.user.role === 'student'
      ? noteService.sanitizeNotesForStudent(notes)
      : notes;
    
    res.json({
      success: true,
      notes: sanitizedNotes,
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
    
    // Students can only see their own shared notes
    if (req.user.role === 'student' && req.user._id.toString() !== studentId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const notes = await noteRepository.findForStudent(studentId, req.user.role, { type });
    
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
    const meeting = await meetingRepository.findById(meetingId);
    if (!meeting) {
      return res.status(404).json({
        success: false,
        message: 'Meeting not found'
      });
    }
    
    if (!noteService.hasMeetingAccess(meeting, req.user)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    const notes = await noteRepository.findForMeeting(meetingId, req.user.role);
    
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
    const note = await noteRepository.findByIdWithDetails(req.params.id);
    
    if (!note) {
      return res.status(404).json({
        success: false,
        message: 'Note not found'
      });
    }
    
    if (!noteService.hasViewAccess(note, req.user)) {
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
      
      // Use NoteService for business logic
      const note = await noteService.createNote(req.body, req.user);
      
      // Populate for response
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
      if (error instanceof NoteValidationError) {
        return handleServiceError(error, res);
      }
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
      
      // Use NoteService for business logic
      const note = await noteService.updateNote(req.params.id, req.body, req.user);
      
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
      if (error instanceof NoteValidationError) {
        return handleServiceError(error, res);
      }
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
    // Use NoteService for business logic
    const note = await noteService.shareNote(req.params.id, req.user);
    
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
    if (error instanceof NoteValidationError) {
      return handleServiceError(error, res);
    }
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
    // Use NoteService for business logic
    await noteService.deleteNote(req.params.id, req.user);
    
    res.json({
      success: true,
      message: 'Note deleted successfully'
    });
  } catch (error) {
    if (error instanceof NoteValidationError) {
      return handleServiceError(error, res);
    }
    console.error('Delete note error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting note'
    });
  }
});

module.exports = router;
