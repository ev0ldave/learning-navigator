/**
 * Meeting Audit Service - records who changed a meeting, what changed, and when.
 * Write failures are logged but never block the meeting operation itself.
 */
const MeetingAuditLog = require('../models/MeetingAuditLog');

const TRACKED_FIELDS = ['startTime', 'endTime', 'title', 'description', 'location', 'meetingLink', 'phoneNumber', 'status'];

const idOf = (value) => value?._id || value;

const actorFields = (actor) => {
  if (!actor) {
    return { performedBy: null, performedByName: 'System', performedByRole: 'system' };
  }
  const name = `${actor.firstName || ''} ${actor.lastName || ''}`.trim();
  return {
    performedBy: actor._id,
    performedByName: name || actor.email || 'Unknown user',
    performedByRole: actor.role
  };
};

const normalize = (value) => (value instanceof Date ? value.getTime() : value ?? null);

/**
 * Capture the tracked fields of a meeting so they can be diffed after a change.
 */
const captureState = (meeting) => {
  const state = {};
  for (const field of TRACKED_FIELDS) {
    const value = meeting[field];
    state[field] = value instanceof Date ? new Date(value) : value;
  }
  return state;
};

const diffState = (before, after) => TRACKED_FIELDS
  .filter(field => normalize(before[field]) !== normalize(after[field]))
  .map(field => ({ field, from: before[field] ?? null, to: after[field] ?? null }));

const buildEntry = (meeting, action, actor, { changes = [], details } = {}) => ({
  meeting: meeting._id,
  student: idOf(meeting.student),
  navigator: idOf(meeting.navigator),
  action,
  ...actorFields(actor),
  changes,
  details,
  snapshot: {
    title: meeting.title,
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    status: meeting.status,
    location: meeting.location
  }
});

/**
 * @param {Object} meeting - Meeting document after the change
 * @param {string} action - One of MeetingAuditLog action values
 * @param {Object|null} actor - User who made the change, or null for automated changes
 * @param {{changes?: Array, details?: string}} [options]
 */
const logChange = async (meeting, action, actor, options) => {
  try {
    await MeetingAuditLog.create(buildEntry(meeting, action, actor, options));
  } catch (error) {
    console.error('Failed to write meeting audit log:', error);
  }
};

const logChanges = async (meetings, action, actor, options) => {
  if (!meetings.length) return;
  try {
    await MeetingAuditLog.insertMany(meetings.map(m => buildEntry(m, action, actor, options)));
  } catch (error) {
    console.error('Failed to write meeting audit logs:', error);
  }
};

const getStudentHistory = async (studentId, { page = 1, limit = 50 } = {}) => {
  const query = { student: studentId };
  const [logs, total] = await Promise.all([
    MeetingAuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    MeetingAuditLog.countDocuments(query)
  ]);
  return { logs, total };
};

module.exports = {
  captureState,
  diffState,
  logChange,
  logChanges,
  getStudentHistory
};
