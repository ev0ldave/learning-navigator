const BaseRepository = require('./BaseRepository');
const Meeting = require('../models/Meeting');

/**
 * Meeting Repository - Handles all Meeting data access
 * Encapsulates Mongoose-specific queries
 */
class MeetingRepository extends BaseRepository {
  constructor() {
    super(Meeting);
  }

  async findByIdWithDetails(id) {
    return this.findById(id, {
      populate: [
        { path: 'student', select: 'firstName lastName email profilePicture phone' },
        { path: 'navigator', select: 'firstName lastName email profilePicture phone' },
        { path: 'notes' },
        { path: 'cancelledBy', select: 'firstName lastName' },
        { path: 'rescheduledBy', select: 'firstName lastName' }
      ]
    });
  }

  async findByIdWithBasicDetails(id) {
    return this.findById(id, {
      populate: [
        { path: 'student', select: 'firstName lastName email profilePicture' },
        { path: 'navigator', select: 'firstName lastName email profilePicture' }
      ]
    });
  }

  async findForUser(userId, role, filters = {}, pagination = {}) {
    const query = {};

    // Filter by user role
    if (role === 'student') {
      query.student = userId;
    } else if (role === 'learning_navigator') {
      query.navigator = userId;
    }
    // Admin sees all meetings

    // Date filters
    if (filters.startDate || filters.endDate) {
      query.startTime = {};
      if (filters.startDate) query.startTime.$gte = new Date(filters.startDate);
      if (filters.endDate) query.startTime.$lte = new Date(filters.endDate);
    }

    // Status filter (handles comma-separated values)
    if (filters.status) {
      const statuses = filters.status.split(',').map(s => s.trim());
      if (statuses.length > 1) {
        query.status = { $in: statuses };
      } else {
        query.status = filters.status;
      }
    }

    const skip = ((pagination.page || 1) - 1) * (pagination.limit || 50);

    const [meetings, total] = await Promise.all([
      this.find(query, {
        sort: { startTime: 1 },
        skip,
        limit: pagination.limit || 50,
        populate: [
          { path: 'student', select: 'firstName lastName email profilePicture' },
          { path: 'navigator', select: 'firstName lastName email profilePicture' },
          { path: 'notes' }
        ]
      }),
      this.count(query)
    ]);

    return { meetings, total };
  }

  async findUpcoming(userId, role, limit = 10) {
    const query = {
      startTime: { $gte: new Date() },
      status: { $in: ['scheduled', 'confirmed'] }
    };

    if (role === 'student') {
      query.student = userId;
    } else if (role === 'learning_navigator') {
      query.navigator = userId;
    }

    return this.find(query, {
      sort: { startTime: 1 },
      limit,
      populate: [
        { path: 'student', select: 'firstName lastName email profilePicture' },
        { path: 'navigator', select: 'firstName lastName email profilePicture' }
      ]
    });
  }

  async findConflicting(navigatorId, startTime, endTime, excludeMeetingId = null) {
    const query = {
      navigator: navigatorId,
      status: { $in: ['scheduled', 'confirmed'] },
      $or: [{
        startTime: { $lt: endTime },
        endTime: { $gt: startTime }
      }]
    };

    if (excludeMeetingId) {
      query._id = { $ne: excludeMeetingId };
    }

    return this.findOne(query);
  }

  async findSeriesMeetings(parentId, scope = 'all') {
    const query = {
      $or: [
        { _id: parentId },
        { 'recurrence.parentMeetingId': parentId }
      ],
      status: { $in: ['scheduled', 'confirmed'] }
    };

    if (scope === 'future') {
      query.startTime = { $gte: new Date() };
    }

    return this.find(query, {
      populate: [
        { path: 'student', select: 'firstName lastName email' },
        { path: 'navigator', select: 'firstName lastName email' }
      ]
    });
  }

  async cancelMeetings(meetingIds, userId, reason) {
    return this.updateMany(
      { _id: { $in: meetingIds } },
      {
        $set: {
          status: 'cancelled',
          cancelledBy: userId,
          cancellationReason: reason || 'Cancelled',
          cancelledAt: new Date()
        }
      }
    );
  }
}

// Export singleton instance for convenience
module.exports = new MeetingRepository();
// Also export class for dependency injection in tests
module.exports.MeetingRepository = MeetingRepository;
