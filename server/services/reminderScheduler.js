/**
 * Meeting Reminder Scheduler
 * 
 * Periodically checks for upcoming meetings and sends SMS reminders
 * 15 minutes before the meeting starts.
 */

const Meeting = require('../models/Meeting');
const User = require('../models/User');
const { sendMeetingReminderSMS, isSMSEnabled } = require('./smsService');

// Track sent reminders to avoid duplicates (meetingId:userId)
const sentReminders = new Set();

// Clean up old entries from sentReminders periodically (older than 2 hours)
const REMINDER_CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
const REMINDER_EXPIRY = 2 * 60 * 60 * 1000; // 2 hours

// Store reminder timestamps for cleanup
const reminderTimestamps = new Map();

/**
 * Check for meetings starting in approximately 15 minutes and send SMS reminders
 */
const checkAndSendReminders = async () => {
  try {
    if (!isSMSEnabled()) {
      return; // SMS not configured, skip
    }
    
    const now = new Date();
    // Look for meetings starting between 14 and 16 minutes from now
    // This gives us a 2-minute window to catch meetings on each check
    const reminderWindowStart = new Date(now.getTime() + 14 * 60 * 1000);
    const reminderWindowEnd = new Date(now.getTime() + 16 * 60 * 1000);
    
    const upcomingMeetings = await Meeting.find({
      startTime: {
        $gte: reminderWindowStart,
        $lte: reminderWindowEnd
      },
      status: { $in: ['scheduled', 'confirmed'] }
    }).populate('student navigator');
    
    for (const meeting of upcomingMeetings) {
      // Send reminder to student
      await sendReminderToUser(meeting, meeting.student, 'student');
      
      // Send reminder to navigator
      await sendReminderToUser(meeting, meeting.navigator, 'navigator');
    }
  } catch (error) {
    console.error('Error in reminder scheduler:', error);
  }
};

/**
 * Send SMS reminder to a specific user for a meeting
 */
const sendReminderToUser = async (meeting, user, role) => {
  if (!user) return;
  
  const reminderKey = `${meeting._id}:${user._id}`;
  
  // Skip if already sent
  if (sentReminders.has(reminderKey)) {
    return;
  }
  
  const result = await sendMeetingReminderSMS(user, meeting);
  
  if (result.success || result.skipped) {
    // Mark as sent (even if skipped) to avoid retrying
    sentReminders.add(reminderKey);
    reminderTimestamps.set(reminderKey, Date.now());
    
    if (result.success) {
      console.log(`SMS reminder sent to ${role} (${user.email}) for meeting ${meeting._id}`);
      
      // Update meeting to track SMS notification
      if (!meeting.smsRemindersSent) {
        meeting.smsRemindersSent = [];
      }
      meeting.smsRemindersSent.push({
        userId: user._id,
        sentAt: new Date()
      });
      await meeting.save();
    }
  } else {
    console.error(`Failed to send SMS reminder to ${role} (${user.email}):`, result.error);
  }
};

/**
 * Clean up old reminder tracking entries
 */
const cleanupOldReminders = () => {
  const now = Date.now();
  for (const [key, timestamp] of reminderTimestamps.entries()) {
    if (now - timestamp > REMINDER_EXPIRY) {
      sentReminders.delete(key);
      reminderTimestamps.delete(key);
    }
  }
};

// Scheduler interval handle
let schedulerInterval = null;
let cleanupInterval = null;

/**
 * Start the reminder scheduler
 * Checks every minute for meetings that need reminders
 */
const startReminderScheduler = () => {
  if (schedulerInterval) {
    console.log('Reminder scheduler already running');
    return;
  }
  
  if (!isSMSEnabled()) {
    console.log('SMS not configured, reminder scheduler not started');
    return;
  }
  
  console.log('✅ Meeting reminder scheduler started (checking every minute)');
  
  // Run immediately on startup
  checkAndSendReminders();
  
  // Then run every minute
  schedulerInterval = setInterval(checkAndSendReminders, 60 * 1000);
  
  // Cleanup old reminders every hour
  cleanupInterval = setInterval(cleanupOldReminders, REMINDER_CLEANUP_INTERVAL);
};

/**
 * Stop the reminder scheduler
 */
const stopReminderScheduler = () => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  console.log('Reminder scheduler stopped');
};

module.exports = {
  startReminderScheduler,
  stopReminderScheduler,
  checkAndSendReminders // Exported for testing
};
