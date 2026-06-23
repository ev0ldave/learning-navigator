const nodemailer = require('nodemailer');
const Notification = require('../models/Notification');
const User = require('../models/User');

// Create transporter
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });
};

// Send email
const sendEmail = async (to, subject, html, text) => {
  try {
    // Skip if no email configuration
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.log('Email configuration not set, skipping email send');
      return { skipped: true };
    }
    
    const transporter = createTransporter();
    
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

// Send meeting notification
const sendMeetingNotification = async (meeting, type) => {
  try {
    const student = await User.findById(meeting.student);
    const navigator = await User.findById(meeting.navigator);
    
    if (!student || !navigator) {
      console.error('Could not find student or navigator for notification');
      return;
    }
    
    const formatDate = (date) => {
      return new Date(date).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    };
    
    const formatTime = (date) => {
      return new Date(date).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    };
    
    let emailSubject, emailBody, notificationTitle, notificationMessage;
    
    switch (type) {
      case 'scheduled':
        emailSubject = 'New Meeting Scheduled - Learning Navigator';
        notificationTitle = 'Meeting Scheduled';
        notificationMessage = `A new meeting has been scheduled for ${formatDate(meeting.startTime)} at ${formatTime(meeting.startTime)}`;
        emailBody = `
          <h2>Meeting Scheduled</h2>
          <p>A new meeting has been scheduled:</p>
          <ul>
            <li><strong>Title:</strong> ${meeting.title}</li>
            <li><strong>Date:</strong> ${formatDate(meeting.startTime)}</li>
            <li><strong>Time:</strong> ${formatTime(meeting.startTime)} - ${formatTime(meeting.endTime)}</li>
            <li><strong>Location:</strong> ${meeting.location}</li>
            ${meeting.meetingLink ? `<li><strong>Meeting Link:</strong> <a href="${meeting.meetingLink}">${meeting.meetingLink}</a></li>` : ''}
          </ul>
        `;
        break;
        
      case 'cancelled':
        emailSubject = 'Meeting Cancelled - Learning Navigator';
        notificationTitle = 'Meeting Cancelled';
        notificationMessage = `Your meeting on ${formatDate(meeting.startTime)} has been cancelled`;
        emailBody = `
          <h2>Meeting Cancelled</h2>
          <p>The following meeting has been cancelled:</p>
          <ul>
            <li><strong>Title:</strong> ${meeting.title}</li>
            <li><strong>Original Date:</strong> ${formatDate(meeting.startTime)}</li>
            <li><strong>Original Time:</strong> ${formatTime(meeting.startTime)}</li>
            ${meeting.cancellationReason ? `<li><strong>Reason:</strong> ${meeting.cancellationReason}</li>` : ''}
          </ul>
        `;
        break;
        
      case 'rescheduled':
        emailSubject = 'Meeting Rescheduled - Learning Navigator';
        notificationTitle = 'Meeting Rescheduled';
        notificationMessage = `Your meeting has been rescheduled to ${formatDate(meeting.startTime)} at ${formatTime(meeting.startTime)}`;
        emailBody = `
          <h2>Meeting Rescheduled</h2>
          <p>Your meeting has been rescheduled:</p>
          <ul>
            <li><strong>Title:</strong> ${meeting.title}</li>
            ${meeting.rescheduledFrom ? `<li><strong>Previous Date:</strong> ${formatDate(meeting.rescheduledFrom)}</li>` : ''}
            <li><strong>New Date:</strong> ${formatDate(meeting.startTime)}</li>
            <li><strong>New Time:</strong> ${formatTime(meeting.startTime)} - ${formatTime(meeting.endTime)}</li>
            <li><strong>Location:</strong> ${meeting.location}</li>
            ${meeting.meetingLink ? `<li><strong>Meeting Link:</strong> <a href="${meeting.meetingLink}">${meeting.meetingLink}</a></li>` : ''}
          </ul>
        `;
        break;
        
      case 'reminder':
        emailSubject = 'Meeting Reminder - Learning Navigator';
        notificationTitle = 'Meeting Reminder';
        notificationMessage = `Reminder: You have a meeting on ${formatDate(meeting.startTime)} at ${formatTime(meeting.startTime)}`;
        emailBody = `
          <h2>Meeting Reminder</h2>
          <p>This is a reminder for your upcoming meeting:</p>
          <ul>
            <li><strong>Title:</strong> ${meeting.title}</li>
            <li><strong>Date:</strong> ${formatDate(meeting.startTime)}</li>
            <li><strong>Time:</strong> ${formatTime(meeting.startTime)} - ${formatTime(meeting.endTime)}</li>
            <li><strong>Location:</strong> ${meeting.location}</li>
            ${meeting.meetingLink ? `<li><strong>Meeting Link:</strong> <a href="${meeting.meetingLink}">${meeting.meetingLink}</a></li>` : ''}
          </ul>
        `;
        break;
        
      default:
        return;
    }
    
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
    
    // Send to navigator (except for reminders which are only for students)
    if (type !== 'reminder') {
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

// Send note shared notification
const sendNoteSharedNotification = async (note, student) => {
  try {
    const navigator = await User.findById(note.navigator);
    
    if (!navigator) {
      console.error('Could not find navigator for notification');
      return;
    }
    
    const emailSubject = 'New Session Notes Shared - Learning Navigator';
    const emailBody = `
      <h2>Session Notes Shared</h2>
      <p>Your learning navigator ${navigator.firstName} ${navigator.lastName} has shared notes from your session:</p>
      <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
        <h3>${note.title}</h3>
        <p>${note.content}</p>
      </div>
      <p>Log in to the Learning Navigator app to view the full notes.</p>
    `;
    
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
      title: 'Session Notes Shared',
      message: `${navigator.firstName} ${navigator.lastName} shared notes from your session: "${note.title}"`,
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
  sendNoteSharedNotification
};
