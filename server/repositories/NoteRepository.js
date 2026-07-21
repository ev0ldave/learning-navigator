const BaseRepository = require('./BaseRepository');
const Note = require('../models/Note');

/**
 * Note Repository - Handles all Note data access
 * Single Responsibility: Data access operations for notes
 */
class NoteRepository extends BaseRepository {
  constructor() {
    super(Note);
  }

  /**
   * Find note by ID with full details
   */
  async findByIdWithDetails(id) {
    return this.findById(id, {
      populate: [
        { path: 'student', select: 'firstName lastName email' },
        { path: 'navigator', select: 'firstName lastName email' },
        { path: 'meeting', select: 'title startTime' },
        { path: 'createdBy', select: 'firstName lastName' }
      ]
    });
  }

  /**
   * Find notes for a user based on role with pagination
   */
  async findForUser(userId, role, filters = {}, pagination = {}) {
    const query = this._buildUserQuery(userId, role, filters);
    const skip = ((pagination.page || 1) - 1) * (pagination.limit || 20);

    const [notes, total] = await Promise.all([
      this.find(query, {
        sort: { createdAt: -1 },
        skip,
        limit: pagination.limit || 20,
        populate: [
          { path: 'student', select: 'firstName lastName email' },
          { path: 'navigator', select: 'firstName lastName email' },
          { path: 'meeting', select: 'title startTime' }
        ]
      }),
      this.count(query)
    ]);

    return { notes, total };
  }

  /**
   * Find notes for a specific student
   */
  async findForStudent(studentId, role, filters = {}) {
    const query = { student: studentId };

    if (role === 'student') {
      query.type = 'shared';
    } else if (filters.type) {
      query.type = filters.type;
    }

    return this.find(query, {
      sort: { createdAt: -1 },
      populate: [
        { path: 'navigator', select: 'firstName lastName' },
        { path: 'meeting', select: 'title startTime' }
      ]
    });
  }

  /**
   * Find notes for a specific meeting
   */
  async findForMeeting(meetingId, role) {
    const query = { meeting: meetingId };

    // Students can only see shared notes
    if (role === 'student') {
      query.type = 'shared';
    }

    return this.find(query, {
      sort: { createdAt: -1 },
      populate: [
        { path: 'navigator', select: 'firstName lastName' },
        { path: 'createdBy', select: 'firstName lastName' }
      ]
    });
  }

  /**
   * Build query based on user role
   */
  _buildUserQuery(userId, role, filters) {
    const query = {};

    if (role === 'student') {
      query.student = userId;
      query.type = 'shared';
    } else if (role === 'learning_navigator') {
      if (filters.studentId) {
        query.student = filters.studentId;
      }
      query.navigator = userId;
      if (filters.type) query.type = filters.type;
    } else {
      // Admin sees all
      if (filters.studentId) query.student = filters.studentId;
      if (filters.type) query.type = filters.type;
    }

    return query;
  }
}

// Export singleton instance and class for DI
const noteRepository = new NoteRepository();
module.exports = noteRepository;
module.exports.NoteRepository = NoteRepository;
