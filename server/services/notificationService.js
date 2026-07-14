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
 * Dependency can be injected for testing
 */
class EmailSender {
  constructor(transporterFactory = null) {
    this.createTransporter = transporterFactory || this._defaultTransporterFactory;
  }

  _defaultTransporterFactory() {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  }

  async send(to, subject, html, text) {
    // Skip if no email configuration
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.log('Email configuration not set, skipping email send');
      return { skipped: true };
    }

    const transporter = this.createTransporter();

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

// Send email (backward compatible)
const sendEmail = async (to, subject, html, text) => {
  try {
    return await emailSender.send(to, subject, html, text);
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

// Create in-app notification
const createNotification = async ({
  recipientId,
  senderId,
  type,
  title,
  message,
  meetingId,
  noteId,
  metadata
}) => {
  try {
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
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

/**
 * Send meeting notification using strategy pattern
 * Template is selected based on type, allowing extension without modification
 */
const sendMeetingNotification = async (meeting, type) => {
  try {
    const student = await User.findById(meeting.student);
    const navigator = await User.findById(meeting.navigator);

    if (!student || !navigator) {
      console.error('Could not find student or navigator for notification');
      return;
    }

    // Get template using strategy pattern (Open/Closed Principle)
    const template = getTemplate(type);
    const context = { meeting, student, navigator };

    // Generate content from template
    const emailSubject = template.getEmailSubject(context);
    const emailBody = template.getEmailBody(context);
    const notificationTitle = template.getNotificationTitle(context);
    const notificationMessage = template.getNotificationMessage(context);

    // Determine notification type for database
    const notificationType = `meeting_${type}`;

    // Send to student
    if (student.notificationPreferences?.email !== false) {
      try {
        await sendEmail(student.email, emailSubject, emailBody);
      } catch (emailError) {
        console.error('Failed to send email to student:', emailError);
      }
    }

    // Create in-app notification for student
    await createNotification({
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
          await sendEmail(navigator.email, emailSubject, emailBody);
        } catch (emailError) {
          console.error('Failed to send email to navigator:', emailError);
        }
      }

      await createNotification({
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
};

/**
 * Send note shared notification using strategy pattern
 */
const sendNoteSharedNotification = async (note, student) => {
  try {
    const navigator = await User.findById(note.navigator);

    if (!navigator) {
      console.error('Could not find navigator for notification');
      return;
    }

    // Get template using strategy pattern
    const template = getTemplate('note_shared');
    const context = { note, student, navigator };

    const emailSubject = template.getEmailSubject(context);
    const emailBody = template.getEmailBody(context);
    const notificationTitle = template.getNotificationTitle(context);
    const notificationMessage = template.getNotificationMessage(context);

    // Send email if preferences allow
    if (student.notificationPreferences?.email !== false) {
      try {
        await sendEmail(student.email, emailSubject, emailBody);
        note.emailSent = true;
        note.emailSentAt = new Date();
        await note.save();
      } catch (emailError) {
        console.error('Failed to send note email:', emailError);
      }
    }

    // Create in-app notification
    await createNotification({
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
};

module.exports = {
  sendEmail,
  createNotification,
  sendMeetingNotification,
  sendNoteSharedNotification,
  // Direct versions for job queue (throw errors instead of catching)
  sendEmailDirect,
  sendMeetingNotificationDirect,
  sendNoteSharedNotificationDirect,
  // Export EmailSender class for testing/DI
  EmailSender
};

// Direct email send that throws errors for job queue retry
async function sendEmailDirect(to, subject, html, text) {
  return emailSender.send(to, subject, html, text);
}

/**
 * Direct meeting notification using strategy pattern (throws errors for job queue retry)
 */
async function sendMeetingNotificationDirect(meeting, type) {
  const student = await User.findById(meeting.student);
  const navigator = await User.findById(meeting.navigator);

  if (!student || !navigator) {
    throw new Error('Could not find student or navigator for notification');
  }

  // Get template using strategy pattern
  const template = getTemplate(type);
  const context = { meeting, student, navigator };

  const emailSubject = template.getEmailSubject(context);
  const emailBody = template.getEmailBody(context);
  const notificationTitle = template.getNotificationTitle(context);
  const notificationMessage = template.getNotificationMessage(context);

  const notificationType = `meeting_${type}`;
  const emailErrors = [];

  // Send to student - collect errors but continue
  if (student.notificationPreferences?.email !== false) {
    try {
      await sendEmailDirect(student.email, emailSubject, emailBody);
    } catch (emailError) {
      emailErrors.push(`Student email: ${emailError.message}`);
    }
  }

  // Create in-app notification for student
  await createNotification({
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
        await sendEmailDirect(navigator.email, emailSubject, emailBody);
      } catch (emailError) {
        emailErrors.push(`Navigator email: ${emailError.message}`);
      }
    }

    await createNotification({
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

  // If all emails failed, throw for retry
  const expectedEmails = template.shouldNotifyNavigator(context) ? 2 : 1;
  if (emailErrors.length >= expectedEmails && process.env.EMAIL_USER) {
    throw new Error(`All email sends failed: ${emailErrors.join('; ')}`);
  }

  return { success: true, emailErrors: emailErrors.length > 0 ? emailErrors : undefined };
}

/**
 * Direct note notification using strategy pattern (throws errors for job queue retry)
 */
async function sendNoteSharedNotificationDirect(note, student) {
  const navigator = await User.findById(note.navigator);

  if (!navigator) {
    throw new Error('Could not find navigator for notification');
  }

  // Get template using strategy pattern
  const template = getTemplate('note_shared');
  const context = { note, student, navigator };

  const emailSubject = template.getEmailSubject(context);
  const emailBody = template.getEmailBody(context);
  const notificationTitle = template.getNotificationTitle(context);
  const notificationMessage = template.getNotificationMessage(context);

  // Send email - throw if fails
  if (student.notificationPreferences?.email !== false) {
    await sendEmailDirect(student.email, emailSubject, emailBody);
    note.emailSent = true;
    note.emailSentAt = new Date();
    await note.save();
  }

  // Create in-app notification
  await createNotification({
    recipientId: student._id,
    senderId: navigator._id,
    type: 'note_shared',
    title: notificationTitle,
    message: notificationMessage,
    noteId: note._id
  });

  return { success: true };
}
