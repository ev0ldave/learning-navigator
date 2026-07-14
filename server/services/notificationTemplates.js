/**
 * Notification Templates - Strategy Pattern Implementation
 * Open/Closed Principle: Add new notification types without modifying existing code
 */

/**
 * Base Notification Template - Interface for all notification templates
 */
class BaseNotificationTemplate {
  /**
   * Get email subject
   * @param {Object} context - Meeting, student, navigator data
   * @returns {string}
   */
  getEmailSubject(context) {
    throw new Error('getEmailSubject must be implemented');
  }

  /**
   * Get notification title for in-app notification
   * @param {Object} context
   * @returns {string}
   */
  getNotificationTitle(context) {
    throw new Error('getNotificationTitle must be implemented');
  }

  /**
   * Get notification message
   * @param {Object} context
   * @returns {string}
   */
  getNotificationMessage(context) {
    throw new Error('getNotificationMessage must be implemented');
  }

  /**
   * Get email HTML body
   * @param {Object} context
   * @returns {string}
   */
  getEmailBody(context) {
    throw new Error('getEmailBody must be implemented');
  }

  /**
   * Should navigator receive this notification?
   * @param {Object} context
   * @returns {boolean}
   */
  shouldNotifyNavigator(context) {
    return true;
  }
}

/**
 * Date/time formatting utilities
 */
const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const formatTime = (date) => {
  return new Date(date).toLocaleTimeString('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

/**
 * Generate location info HTML
 */
const getLocationHtml = (meeting) => {
  let locationHtml = `<li><strong>Location:</strong> ${meeting.location}</li>`;
  
  if (meeting.location === 'phone' && meeting.phoneNumber) {
    locationHtml += `<li><strong>Phone Number:</strong> ${meeting.phoneNumber}</li>`;
  }
  if (meeting.meetingLink) {
    locationHtml += `<li><strong>Meeting Link:</strong> <a href="${meeting.meetingLink}">${meeting.meetingLink}</a></li>`;
  }
  
  return locationHtml;
};

/**
 * Scheduled Meeting Template
 */
class ScheduledNotificationTemplate extends BaseNotificationTemplate {
  getEmailSubject() {
    return 'New Meeting Scheduled - Learning Navigator';
  }

  getNotificationTitle() {
    return 'Meeting Scheduled';
  }

  getNotificationMessage({ meeting }) {
    return `A new meeting has been scheduled for ${formatDate(meeting.startTime)} at ${formatTime(meeting.startTime)}`;
  }

  getEmailBody({ meeting, student, navigator }) {
    return `
      <h2>Meeting Scheduled</h2>
      <p>A new meeting has been scheduled:</p>
      <ul>
        <li><strong>Title:</strong> ${meeting.title}</li>
        <li><strong>Student:</strong> ${student.firstName} ${student.lastName}</li>
        <li><strong>Navigator:</strong> ${navigator.firstName} ${navigator.lastName}</li>
        <li><strong>Date:</strong> ${formatDate(meeting.startTime)}</li>
        <li><strong>Time:</strong> ${formatTime(meeting.startTime)} - ${formatTime(meeting.endTime)}</li>
        ${getLocationHtml(meeting)}
      </ul>
    `;
  }
}

/**
 * Cancelled Meeting Template
 */
class CancelledNotificationTemplate extends BaseNotificationTemplate {
  getEmailSubject() {
    return 'Meeting Cancelled - Learning Navigator';
  }

  getNotificationTitle() {
    return 'Meeting Cancelled';
  }

  getNotificationMessage({ meeting }) {
    return `Your meeting on ${formatDate(meeting.startTime)} has been cancelled`;
  }

  getEmailBody({ meeting }) {
    return `
      <h2>Meeting Cancelled</h2>
      <p>The following meeting has been cancelled:</p>
      <ul>
        <li><strong>Title:</strong> ${meeting.title}</li>
        <li><strong>Original Date:</strong> ${formatDate(meeting.startTime)}</li>
        <li><strong>Original Time:</strong> ${formatTime(meeting.startTime)}</li>
        ${meeting.cancellationReason ? `<li><strong>Reason:</strong> ${meeting.cancellationReason}</li>` : ''}
      </ul>
    `;
  }
}

/**
 * Rescheduled Meeting Template
 */
class RescheduledNotificationTemplate extends BaseNotificationTemplate {
  getEmailSubject() {
    return 'Meeting Rescheduled - Learning Navigator';
  }

  getNotificationTitle() {
    return 'Meeting Rescheduled';
  }

  getNotificationMessage({ meeting }) {
    return `Your meeting has been rescheduled to ${formatDate(meeting.startTime)} at ${formatTime(meeting.startTime)}`;
  }

  getEmailBody({ meeting, student, navigator }) {
    return `
      <h2>Meeting Rescheduled</h2>
      <p>Your meeting has been rescheduled:</p>
      <ul>
        <li><strong>Title:</strong> ${meeting.title}</li>
        <li><strong>Student:</strong> ${student.firstName} ${student.lastName}</li>
        <li><strong>Navigator:</strong> ${navigator.firstName} ${navigator.lastName}</li>
        ${meeting.rescheduledFrom ? `<li><strong>Previous Date:</strong> ${formatDate(meeting.rescheduledFrom)}</li>` : ''}
        <li><strong>New Date:</strong> ${formatDate(meeting.startTime)}</li>
        <li><strong>New Time:</strong> ${formatTime(meeting.startTime)} - ${formatTime(meeting.endTime)}</li>
        ${getLocationHtml(meeting)}
      </ul>
    `;
  }
}

/**
 * Reminder Meeting Template
 */
class ReminderNotificationTemplate extends BaseNotificationTemplate {
  getEmailSubject() {
    return 'Meeting Reminder - Learning Navigator';
  }

  getNotificationTitle() {
    return 'Meeting Reminder';
  }

  getNotificationMessage({ meeting, student }) {
    return `Reminder: You have a meeting with ${student.firstName} ${student.lastName} on ${formatDate(meeting.startTime)} at ${formatTime(meeting.startTime)}`;
  }

  getEmailBody({ meeting, student, navigator }) {
    return `
      <h2>Meeting Reminder</h2>
      <p>This is a reminder for your upcoming meeting:</p>
      <ul>
        <li><strong>Title:</strong> ${meeting.title}</li>
        <li><strong>Student:</strong> ${student.firstName} ${student.lastName}</li>
        <li><strong>Navigator:</strong> ${navigator.firstName} ${navigator.lastName}</li>
        <li><strong>Date:</strong> ${formatDate(meeting.startTime)}</li>
        <li><strong>Time:</strong> ${formatTime(meeting.startTime)} - ${formatTime(meeting.endTime)}</li>
        ${getLocationHtml(meeting)}
      </ul>
    `;
  }

  // Reminders only go to students
  shouldNotifyNavigator() {
    return false;
  }
}

/**
 * Note Shared Template
 */
class NoteSharedNotificationTemplate extends BaseNotificationTemplate {
  getEmailSubject() {
    return 'New Session Notes Shared - Learning Navigator';
  }

  getNotificationTitle() {
    return 'Session Notes Shared';
  }

  getNotificationMessage({ note, navigator }) {
    return `${navigator.firstName} ${navigator.lastName} shared notes from your session: "${note.title}"`;
  }

  getEmailBody({ note, navigator }) {
    return `
      <h2>Session Notes Shared</h2>
      <p>Your learning navigator ${navigator.firstName} ${navigator.lastName} has shared notes from your session:</p>
      <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <h3>${note.title}</h3>
        <p>${note.content}</p>
      </div>
      <p>Log in to the Learning Navigator app to view the full notes.</p>
    `;
  }

  // Note shared notifications only go to students
  shouldNotifyNavigator() {
    return false;
  }
}

/**
 * Template Registry - Register all templates here
 * To add a new notification type:
 * 1. Create a new template class extending BaseNotificationTemplate
 * 2. Register it in this object
 */
const notificationTemplates = {
  scheduled: new ScheduledNotificationTemplate(),
  cancelled: new CancelledNotificationTemplate(),
  rescheduled: new RescheduledNotificationTemplate(),
  reminder: new ReminderNotificationTemplate(),
  note_shared: new NoteSharedNotificationTemplate()
};

/**
 * Get template for a notification type
 * @param {string} type - Notification type
 * @returns {BaseNotificationTemplate}
 */
const getTemplate = (type) => {
  const template = notificationTemplates[type];
  if (!template) {
    throw new Error(`Unknown notification type: ${type}. Register it in notificationTemplates.`);
  }
  return template;
};

/**
 * Register a new template (for extensibility)
 * @param {string} type - Notification type key
 * @param {BaseNotificationTemplate} template - Template instance
 */
const registerTemplate = (type, template) => {
  if (!(template instanceof BaseNotificationTemplate)) {
    throw new Error('Template must extend BaseNotificationTemplate');
  }
  notificationTemplates[type] = template;
};

module.exports = {
  BaseNotificationTemplate,
  ScheduledNotificationTemplate,
  CancelledNotificationTemplate,
  RescheduledNotificationTemplate,
  ReminderNotificationTemplate,
  NoteSharedNotificationTemplate,
  notificationTemplates,
  getTemplate,
  registerTemplate,
  // Utility functions
  formatDate,
  formatTime
};
