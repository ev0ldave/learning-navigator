/**
 * Notification Templates - Strategy + composition.
 *
 * Open/Closed: add a new notification type by registering a new template.
 * Interface Segregation: content is split into two channel interfaces so a
 *   consumer that only needs email doesn't depend on in-app methods (and vice
 *   versa): EmailContent (subject/body) and InAppContent (title/message).
 * Liskov: channel classes fail fast at construction if a required method is
 *   not implemented, so every constructed instance is a valid substitute.
 */

/**
 * Assert that a subclass overrides every required method of its base.
 */
function assertImplemented(instance, base, methods) {
  for (const method of methods) {
    if (instance[method] === base.prototype[method]) {
      throw new TypeError(`${instance.constructor.name} must implement ${method}()`);
    }
  }
}

/**
 * EmailContent - email channel interface (subject + body).
 */
class EmailContent {
  constructor() {
    assertImplemented(this, EmailContent, ['subject', 'body']);
  }
  subject(context) {}
  body(context) {}
}

/**
 * InAppContent - in-app channel interface (title + message).
 */
class InAppContent {
  constructor() {
    assertImplemented(this, InAppContent, ['title', 'message']);
  }
  title(context) {}
  message(context) {}
}

/**
 * NotificationTemplate - composes the channels a notification type supports
 * plus the navigator-notification policy. Consumers use `.email` / `.inApp`;
 * backward-compatible convenience accessors are provided.
 */
class NotificationTemplate {
  constructor({ email, inApp, notifyNavigator = true }) {
    if (!(email instanceof EmailContent)) {
      throw new TypeError('email must be an EmailContent instance');
    }
    if (!(inApp instanceof InAppContent)) {
      throw new TypeError('inApp must be an InAppContent instance');
    }
    this.email = email;
    this.inApp = inApp;
    this._notifyNavigator = notifyNavigator;
  }

  shouldNotifyNavigator(context) {
    return typeof this._notifyNavigator === 'function'
      ? this._notifyNavigator(context)
      : this._notifyNavigator;
  }

  // Backward-compatible convenience accessors (delegate to segregated channels)
  getEmailSubject(context) { return this.email.subject(context); }
  getEmailBody(context) { return this.email.body(context); }
  getNotificationTitle(context) { return this.inApp.title(context); }
  getNotificationMessage(context) { return this.inApp.message(context); }
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

/* ------------------------------------------------------------------ */
/* Scheduled                                                          */
/* ------------------------------------------------------------------ */
class ScheduledEmail extends EmailContent {
  subject() { return 'New Meeting Scheduled - Learning Navigator'; }
  body({ meeting, student, navigator }) {
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
class ScheduledInApp extends InAppContent {
  title() { return 'Meeting Scheduled'; }
  message({ meeting }) {
    return `A new meeting has been scheduled for ${formatDate(meeting.startTime)} at ${formatTime(meeting.startTime)}`;
  }
}
class ScheduledNotificationTemplate extends NotificationTemplate {
  constructor() {
    super({ email: new ScheduledEmail(), inApp: new ScheduledInApp(), notifyNavigator: true });
  }
}

/* ------------------------------------------------------------------ */
/* Cancelled                                                          */
/* ------------------------------------------------------------------ */
class CancelledEmail extends EmailContent {
  subject() { return 'Meeting Cancelled - Learning Navigator'; }
  body({ meeting }) {
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
class CancelledInApp extends InAppContent {
  title() { return 'Meeting Cancelled'; }
  message({ meeting }) {
    return `Your meeting on ${formatDate(meeting.startTime)} has been cancelled`;
  }
}
class CancelledNotificationTemplate extends NotificationTemplate {
  constructor() {
    super({ email: new CancelledEmail(), inApp: new CancelledInApp(), notifyNavigator: true });
  }
}

/* ------------------------------------------------------------------ */
/* Rescheduled                                                        */
/* ------------------------------------------------------------------ */
class RescheduledEmail extends EmailContent {
  subject() { return 'Meeting Rescheduled - Learning Navigator'; }
  body({ meeting, student, navigator }) {
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
class RescheduledInApp extends InAppContent {
  title() { return 'Meeting Rescheduled'; }
  message({ meeting }) {
    return `Your meeting has been rescheduled to ${formatDate(meeting.startTime)} at ${formatTime(meeting.startTime)}`;
  }
}
class RescheduledNotificationTemplate extends NotificationTemplate {
  constructor() {
    super({ email: new RescheduledEmail(), inApp: new RescheduledInApp(), notifyNavigator: true });
  }
}

/* ------------------------------------------------------------------ */
/* Reminder (students only)                                           */
/* ------------------------------------------------------------------ */
class ReminderEmail extends EmailContent {
  subject() { return 'Meeting Reminder - Learning Navigator'; }
  body({ meeting, student, navigator }) {
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
}
class ReminderInApp extends InAppContent {
  title() { return 'Meeting Reminder'; }
  message({ meeting, student }) {
    return `Reminder: You have a meeting with ${student.firstName} ${student.lastName} on ${formatDate(meeting.startTime)} at ${formatTime(meeting.startTime)}`;
  }
}
class ReminderNotificationTemplate extends NotificationTemplate {
  constructor() {
    super({ email: new ReminderEmail(), inApp: new ReminderInApp(), notifyNavigator: false });
  }
}

/* ------------------------------------------------------------------ */
/* Note Shared (students only)                                        */
/* ------------------------------------------------------------------ */
class NoteSharedEmail extends EmailContent {
  subject() { return 'New Session Notes Shared - Learning Navigator'; }
  body({ note, navigator }) {
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
}
class NoteSharedInApp extends InAppContent {
  title() { return 'Session Notes Shared'; }
  message({ note, navigator }) {
    return `${navigator.firstName} ${navigator.lastName} shared notes from your session: "${note.title}"`;
  }
}
class NoteSharedNotificationTemplate extends NotificationTemplate {
  constructor() {
    super({ email: new NoteSharedEmail(), inApp: new NoteSharedInApp(), notifyNavigator: false });
  }
}

/**
 * Template Registry - Register all templates here
 * To add a new notification type:
 * 1. Create EmailContent + InAppContent subclasses and a NotificationTemplate
 * 2. Register it in this object (or via registerTemplate)
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
 * @returns {NotificationTemplate}
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
 * @param {NotificationTemplate} template - Template instance
 */
const registerTemplate = (type, template) => {
  if (!(template instanceof NotificationTemplate)) {
    throw new Error('Template must be a NotificationTemplate');
  }
  notificationTemplates[type] = template;
};

module.exports = {
  // Channel interfaces + composition base
  EmailContent,
  InAppContent,
  NotificationTemplate,
  // Concrete templates
  ScheduledNotificationTemplate,
  CancelledNotificationTemplate,
  RescheduledNotificationTemplate,
  ReminderNotificationTemplate,
  NoteSharedNotificationTemplate,
  // Registry + helpers
  notificationTemplates,
  getTemplate,
  registerTemplate,
  // Utility functions
  formatDate,
  formatTime
};
