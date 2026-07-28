/**
 * Notification Service - Refactored with Strategy Pattern (Open/Closed Principle)
 * 
 * Uses NotificationTemplates for extensibility - new notification types
 * can be added without modifying this service.
 */
const nodemailer = require('nodemailer');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { getTemplate } = require('./notificationTemplates');

/**
 * Email Sender - Single Responsibility: Email transport
 * Uses cached transporter with connection pooling for efficiency
 * Dependency can be injected for testing
 */
class EmailSender {
  constructor(transporterFactory = null) {
    this._transporterFactory = transporterFactory || this._defaultTransporterFactory.bind(this);
    this._transporter = null; // Cached transporter
  }

  _defaultTransporterFactory() {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      },
      // Connection pooling - reuse connections
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      // Timeouts
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 30000
    });
  }

  /**
   * Get cached transporter or create new one
   * Reuses SMTP connection pool for efficiency
   */
  _getTransporter() {
    if (!this._transporter) {
      this._transporter = this._transporterFactory();
    }
    return this._transporter;
  }

  /**
   * Close transporter connection pool (for graceful shutdown)
   */
  close() {
    if (this._transporter) {
      this._transporter.close();
      this._transporter = null;
    }
  }

  async send(to, subject, html, text) {
    // Skip if no email configuration
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.log('Email configuration not set, skipping email send');
      return { skipped: true };
    }

    const transporter = this._getTransporter();

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'Learning Navigator <noreply@learningnavigator.com>',
      to,
      subject,
      html,
      text
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Email sent:', result.messageId);
    return result;
  }
}

// Default email sender instance
const emailSender = new EmailSender();

/**
 * Default collaborators (Dependency Inversion seams). The workflow depends on
 * these abstractions, not on the concrete User/Notification models directly.
 */
const defaultUserProvider = {
  findById: (id) => User.findById(id)
};

const defaultNotificationStore = {
  async create({ recipientId, senderId, type, title, message, meetingId, noteId, metadata }) {
    const notification = new Notification({
      recipient: recipientId,
      sender: senderId,
      type,
      title,
      message,
      meeting: meetingId,
      note: noteId,
      metadata,
      channels: {
        email: { enabled: true },
        inApp: { enabled: true, read: false }
      }
    });
    await notification.save();
    return notification;
  }
};

/**
 * NotificationService - orchestrates notification delivery with injected
 * dependencies (email sender, user provider, notification store, template
 * resolver), making the whole workflow testable and substitutable.
 */
class NotificationService {
  constructor({
    sender = emailSender,
    userProvider = defaultUserProvider,
    notificationStore = defaultNotificationStore,
    templateResolver = getTemplate
  } = {}) {
    this.sender = sender;
    this.users = userProvider;
    this.store = notificationStore;
    this.resolveTemplate = templateResolver;
  }

  async sendEmail(to, subject, html, text) {
    try {
      return await this.sender.send(to, subject, html, text);
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  async sendEmailDirect(to, subject, html, text) {
    return this.sender.send(to, subject, html, text);
  }

  async createNotification(data) {
    try {
      return await this.store.create(data);
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  /**
   * Resolve a participant: use populated doc if available, else fetch.
   */
  async _resolveUser(idOrDoc) {
    return idOrDoc?.email ? idOrDoc : this.users.findById(idOrDoc);
  }

  /**
   * Send a meeting notification using the strategy template (catches email
   * failures so a delivery hiccup does not abort the operation).
   */
  async sendMeetingNotification(meeting, type) {
    try {
      const student = await this._resolveUser(meeting.student);
      const navigator = await this._resolveUser(meeting.navigator);

      if (!student || !navigator) {
        console.error('Could not find student or navigator for notification');
        return;
      }

      const template = this.resolveTemplate(type);
      const context = { meeting, student, navigator };

      const emailSubject = template.email.subject(context);
      const emailBody = template.email.body(context);
      const notificationTitle = template.inApp.title(context);
      const notificationMessage = template.inApp.message(context);

      const notificationType = `meeting_${type}`;

      // Send to student
      if (student.notificationPreferences?.email !== false) {
        try {
          await this.sendEmail(student.email, emailSubject, emailBody);
        } catch (emailError) {
          console.error('Failed to send email to student:', emailError);
        }
      }

      await this.createNotification({
        recipientId: student._id,
        senderId: navigator._id,
        type: notificationType,
        title: notificationTitle,
        message: notificationMessage,
        meetingId: meeting._id
      });

      // Send to navigator if template allows
      if (template.shouldNotifyNavigator(context)) {
        if (navigator.notificationPreferences?.email !== false) {
          try {
            await this.sendEmail(navigator.email, emailSubject, emailBody);
          } catch (emailError) {
            console.error('Failed to send email to navigator:', emailError);
          }
        }

        await this.createNotification({
          recipientId: navigator._id,
          senderId: student._id,
          type: notificationType,
          title: notificationTitle,
          message: notificationMessage,
          meetingId: meeting._id
        });
      }

      // Update meeting notification history
      meeting.notificationsSent = meeting.notificationsSent || [];
      meeting.notificationsSent.push({
        type,
        sentAt: new Date(),
        sentTo: [student._id, navigator._id]
      });
      await meeting.save();
    } catch (error) {
      console.error('Error sending meeting notification:', error);
      throw error;
    }
  }

  /**
   * Send a note-shared notification (student only).
   */
  async sendNoteSharedNotification(note, student) {
    try {
      const navigator = await this._resolveUser(note.navigator);

      if (!navigator) {
        console.error('Could not find navigator for notification');
        return;
      }

      const template = this.resolveTemplate('note_shared');
      const context = { note, student, navigator };

      const emailSubject = template.email.subject(context);
      const emailBody = template.email.body(context);
      const notificationTitle = template.inApp.title(context);
      const notificationMessage = template.inApp.message(context);

      if (student.notificationPreferences?.email !== false) {
        try {
          await this.sendEmail(student.email, emailSubject, emailBody);
          note.emailSent = true;
          note.emailSentAt = new Date();
          await note.save();
        } catch (emailError) {
          console.error('Failed to send note email:', emailError);
        }
      }

      await this.createNotification({
        recipientId: student._id,
        senderId: navigator._id,
        type: 'note_shared',
        title: notificationTitle,
        message: notificationMessage,
        noteId: note._id
      });
    } catch (error) {
      console.error('Error sending note notification:', error);
      throw error;
    }
  }

  /**
   * Direct meeting notification - throws on total failure for job-queue retry.
   */
  async sendMeetingNotificationDirect(meeting, type) {
    const student = await this._resolveUser(meeting.student);
    const navigator = await this._resolveUser(meeting.navigator);

    if (!student || !navigator) {
      throw new Error('Could not find student or navigator for notification');
    }

    const template = this.resolveTemplate(type);
    const context = { meeting, student, navigator };

    const emailSubject = template.email.subject(context);
    const emailBody = template.email.body(context);
    const notificationTitle = template.inApp.title(context);
    const notificationMessage = template.inApp.message(context);

    const notificationType = `meeting_${type}`;
    const emailErrors = [];

    if (student.notificationPreferences?.email !== false) {
      try {
        await this.sendEmailDirect(student.email, emailSubject, emailBody);
      } catch (emailError) {
        emailErrors.push(`Student email: ${emailError.message}`);
      }
    }

    await this.createNotification({
      recipientId: student._id,
      senderId: navigator._id,
      type: notificationType,
      title: notificationTitle,
      message: notificationMessage,
      meetingId: meeting._id
    });

    if (template.shouldNotifyNavigator(context)) {
      if (navigator.notificationPreferences?.email !== false) {
        try {
          await this.sendEmailDirect(navigator.email, emailSubject, emailBody);
        } catch (emailError) {
          emailErrors.push(`Navigator email: ${emailError.message}`);
        }
      }

      await this.createNotification({
        recipientId: navigator._id,
        senderId: student._id,
        type: notificationType,
        title: notificationTitle,
        message: notificationMessage,
        meetingId: meeting._id
      });
    }

    meeting.notificationsSent = meeting.notificationsSent || [];
    meeting.notificationsSent.push({
      type,
      sentAt: new Date(),
      sentTo: [student._id, navigator._id]
    });
    await meeting.save();

    const expectedEmails = template.shouldNotifyNavigator(context) ? 2 : 1;
    if (emailErrors.length >= expectedEmails && process.env.EMAIL_USER) {
      throw new Error(`All email sends failed: ${emailErrors.join('; ')}`);
    }

    return { success: true, emailErrors: emailErrors.length > 0 ? emailErrors : undefined };
  }

  /**
   * Direct note notification - throws on failure for job-queue retry.
   */
  async sendNoteSharedNotificationDirect(note, student) {
    const navigator = await this._resolveUser(note.navigator);

    if (!navigator) {
      throw new Error('Could not find navigator for notification');
    }

    const template = this.resolveTemplate('note_shared');
    const context = { note, student, navigator };

    const emailSubject = template.email.subject(context);
    const emailBody = template.email.body(context);
    const notificationTitle = template.inApp.title(context);
    const notificationMessage = template.inApp.message(context);

    if (student.notificationPreferences?.email !== false) {
      await this.sendEmailDirect(student.email, emailSubject, emailBody);
      note.emailSent = true;
      note.emailSentAt = new Date();
      await note.save();
    }

    await this.createNotification({
      recipientId: student._id,
      senderId: navigator._id,
      type: 'note_shared',
      title: notificationTitle,
      message: notificationMessage,
      noteId: note._id
    });

    return { success: true };
  }
}

// Default singleton instance used by the backward-compatible function exports
const notificationService = new NotificationService();

// Backward-compatible function API (delegates to the default service instance)
const sendEmail = (to, subject, html, text) => notificationService.sendEmail(to, subject, html, text);
const createNotification = (data) => notificationService.createNotification(data);
const sendMeetingNotification = (meeting, type) => notificationService.sendMeetingNotification(meeting, type);
const sendNoteSharedNotification = (note, student) => notificationService.sendNoteSharedNotification(note, student);
const sendEmailDirect = (to, subject, html, text) => notificationService.sendEmailDirect(to, subject, html, text);
const sendMeetingNotificationDirect = (meeting, type) => notificationService.sendMeetingNotificationDirect(meeting, type);
const sendNoteSharedNotificationDirect = (note, student) => notificationService.sendNoteSharedNotificationDirect(note, student);

module.exports = {
  sendEmail,
  createNotification,
  sendMeetingNotification,
  sendNoteSharedNotification,
  // Direct versions for job queue (throw errors instead of catching)
  sendEmailDirect,
  sendMeetingNotificationDirect,
  sendNoteSharedNotificationDirect,
  // Class + default instance for dependency injection / testing
  NotificationService,
  notificationService,
  // Export EmailSender class for testing/DI
  EmailSender
};
