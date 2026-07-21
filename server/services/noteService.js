/**
 * Note Service - Single Responsibility: Note business logic
 * Extracts validation and business rules from routes
 */
const { noteRepository } = require('../repositories');
const { userRepository } = require('../repositories');
const { meetingRepository } = require('../repositories');
const { sendNoteSharedNotification } = require('./notificationService');

/**
 * Validation error class for business rule violations
 */
class NoteValidationError extends Error {
  constructor(message, statusCode = 400, details = null) {
    super(message);
    this.name = 'NoteValidationError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Note Service class - encapsulates all note-related business logic
 */
class NoteService {
  constructor(
    noteRepo = noteRepository,
    userRepo = userRepository,
    meetingRepo = meetingRepository
  ) {
    // Dependency injection for testability
    this.noteRepo = noteRepo;
    this.userRepo = userRepo;
    this.meetingRepo = meetingRepo;
  }

  /**
   * Check if user has access to view a note
   */
  hasViewAccess(note, user) {
    if (user.role === 'administrator') return true;
    
    const navigatorId = note.navigator._id || note.navigator;
    if (navigatorId.toString() === user._id.toString()) return true;
    
    if (note.type === 'shared') {
      const studentId = note.student._id || note.student;
      if (studentId.toString() === user._id.toString()) return true;
    }
    
    return false;
  }

  /**
   * Check if user has access to edit a note
   */
  hasEditAccess(note, user) {
    if (user.role === 'administrator') return true;
    
    const navigatorId = note.navigator._id || note.navigator;
    return navigatorId.toString() === user._id.toString();
  }

  /**
   * Check if user has access to a meeting's notes
   */
  hasMeetingAccess(meeting, user) {
    if (user.role === 'administrator') return true;
    return (
      meeting.student.toString() === user._id.toString() ||
      meeting.navigator.toString() === user._id.toString()
    );
  }

  /**
   * Validate student exists
   */
  async validateStudent(studentId) {
    const student = await this.userRepo.findStudent(studentId);
    if (!student) {
      throw new NoteValidationError('Invalid student');
    }
    return student;
  }

  /**
   * Validate meeting exists
   */
  async validateMeeting(meetingId) {
    if (!meetingId) return null;
    
    const meeting = await this.meetingRepo.findById(meetingId);
    if (!meeting) {
      throw new NoteValidationError('Invalid meeting');
    }
    return meeting;
  }

  /**
   * Validate note content exists
   */
  validateContent({ sharedContent, privateContent, content }) {
    if (!sharedContent && !privateContent && !content) {
      throw new NoteValidationError(
        'At least shared notes or private notes content is required'
      );
    }
  }

  /**
   * Strip private content from notes for students
   */
  sanitizeNotesForStudent(notes) {
    return notes.map(note => {
      const noteObj = note.toObject ? note.toObject() : { ...note };
      delete noteObj.privateContent;
      return noteObj;
    });
  }

  /**
   * Create a new note
   */
  async createNote(noteData, user) {
    // Validate
    this.validateContent(noteData);
    const student = await this.validateStudent(noteData.studentId);
    await this.validateMeeting(noteData.meetingId);

    // Determine type based on content
    const noteType = noteData.sharedContent ? 'shared' : (noteData.type || 'private');

    // Create note
    const note = await this.noteRepo.create({
      student: noteData.studentId,
      navigator: user._id,
      meeting: noteData.meetingId || undefined,
      title: noteData.title,
      sharedContent: noteData.sharedContent || '',
      privateContent: noteData.privateContent || '',
      content: noteData.content || noteData.sharedContent || '',
      type: noteType,
      tags: noteData.tags || [],
      createdBy: user._id,
      sharedAt: noteType === 'shared' ? new Date() : undefined
    });

    // If attached to meeting, link it
    if (noteData.meetingId) {
      await this.meetingRepo.updateById(noteData.meetingId, {
        $push: { notes: note._id }
      });
    }

    // Send notification if shared
    if (noteType === 'shared') {
      try {
        await sendNoteSharedNotification(note, student);
      } catch (notifError) {
        console.error('Note notification failed:', notifError);
      }
    }

    return note;
  }

  /**
   * Update an existing note
   */
  async updateNote(noteId, updates, user) {
    const note = await this.noteRepo.findById(noteId);
    
    if (!note) {
      throw new NoteValidationError('Note not found', 404);
    }

    if (!this.hasEditAccess(note, user)) {
      throw new NoteValidationError('You can only edit your own notes', 403);
    }

    const { title, sharedContent, privateContent, content, tags } = updates;

    // Track edit if content changed
    const contentChanged = 
      (sharedContent !== undefined && sharedContent !== note.sharedContent) ||
      (privateContent !== undefined && privateContent !== note.privateContent) ||
      (content !== undefined && content !== note.content);

    if (contentChanged) {
      note.editHistory.push({
        editedAt: new Date(),
        editedBy: user._id,
        previousContent: JSON.stringify({
          shared: note.sharedContent,
          private: note.privateContent,
          content: note.content
        })
      });
    }

    // Apply updates
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
    return note;
  }

  /**
   * Share a private note with student
   */
  async shareNote(noteId, user) {
    const note = await this.noteRepo.findByIdWithDetails(noteId);

    if (!note) {
      throw new NoteValidationError('Note not found', 404);
    }

    if (!this.hasEditAccess(note, user)) {
      throw new NoteValidationError('You can only share your own notes', 403);
    }

    if (note.type === 'shared') {
      throw new NoteValidationError('Note is already shared');
    }

    note.type = 'shared';
    note.sharedAt = new Date();
    await note.save();

    // Send notification
    try {
      await sendNoteSharedNotification(note, note.student);
    } catch (notifError) {
      console.error('Share notification failed:', notifError);
    }

    return note;
  }

  /**
   * Delete a note
   */
  async deleteNote(noteId, user) {
    const note = await this.noteRepo.findById(noteId);

    if (!note) {
      throw new NoteValidationError('Note not found', 404);
    }

    if (!this.hasEditAccess(note, user)) {
      throw new NoteValidationError('You can only delete your own notes', 403);
    }

    // Remove from meeting if attached
    if (note.meeting) {
      await this.meetingRepo.updateById(note.meeting, {
        $pull: { notes: note._id }
      });
    }

    await this.noteRepo.deleteById(noteId);
    return { deleted: true };
  }
}

// Export singleton instance and class for DI
const noteService = new NoteService();
module.exports = noteService;
module.exports.NoteService = NoteService;
module.exports.NoteValidationError = NoteValidationError;
