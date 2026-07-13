/**
 * SMS Service - Google Voice SMS via gsms
 * 
 * Sends SMS notifications through Google Voice.
 * Requires GOOGLE_VOICE_EMAIL and GOOGLE_VOICE_PASSWORD environment variables.
 */

const gsms = require('gsms');

// Singleton client instance
let gvoiceClient = null;
let isInitialized = false;
let initializationError = null;

/**
 * Initialize the Google Voice client
 * @returns {Promise<boolean>} Whether initialization succeeded
 */
const initGoogleVoice = async () => {
  if (isInitialized) return true;
  if (initializationError) return false;
  
  const email = process.env.GOOGLE_VOICE_EMAIL;
  const password = process.env.GOOGLE_VOICE_PASSWORD;
  
  if (!email || !password) {
    console.log('Google Voice credentials not configured, SMS disabled');
    initializationError = 'Missing credentials';
    return false;
  }
  
  try {
    gvoiceClient = new gsms({
      email,
      password
    });
    
    await gvoiceClient.login();
    isInitialized = true;
    console.log('✅ Google Voice SMS service initialized');
    return true;
  } catch (error) {
    console.error('Failed to initialize Google Voice:', error.message);
    initializationError = error.message;
    return false;
  }
};

/**
 * Send an SMS message
 * @param {string} phoneNumber - Recipient phone number (E.164 format preferred)
 * @param {string} message - Message to send
 * @returns {Promise<{success: boolean, error?: string}>}
 */
const sendSMS = async (phoneNumber, message) => {
  try {
    // Attempt to initialize if not already done
    if (!isInitialized && !initializationError) {
      await initGoogleVoice();
    }
    
    if (!isInitialized) {
      return { 
        success: false, 
        skipped: true,
        error: initializationError || 'SMS service not initialized' 
      };
    }
    
    if (!phoneNumber) {
      return { success: false, error: 'No phone number provided' };
    }
    
    // Normalize phone number (remove non-digits, ensure it starts with country code)
    let normalizedNumber = phoneNumber.replace(/\D/g, '');
    if (normalizedNumber.length === 10) {
      // Assume US number, add +1
      normalizedNumber = '1' + normalizedNumber;
    }
    if (!normalizedNumber.startsWith('+')) {
      normalizedNumber = '+' + normalizedNumber;
    }
    
    await gvoiceClient.send(normalizedNumber, message);
    console.log(`SMS sent to ${normalizedNumber}`);
    
    return { success: true };
  } catch (error) {
    console.error('Error sending SMS:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Send meeting reminder SMS
 * @param {Object} user - User object with phone and notificationPreferences
 * @param {Object} meeting - Meeting object
 * @returns {Promise<{success: boolean, skipped?: boolean, error?: string}>}
 */
const sendMeetingReminderSMS = async (user, meeting) => {
  // Check if SMS reminders are enabled and user has a phone number
  if (!user.phone) {
    return { success: false, skipped: true, reason: 'No phone number configured' };
  }
  
  if (!user.notificationPreferences?.smsReminders) {
    return { success: false, skipped: true, reason: 'SMS reminders disabled' };
  }
  
  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };
  
  const message = `Reminder: You have a meeting "${meeting.title}" in 15 minutes at ${formatTime(meeting.startTime)}. ${meeting.meetingLink ? `Join: ${meeting.meetingLink}` : ''}`.trim();
  
  return await sendSMS(user.phone, message);
};

/**
 * Check if SMS service is available
 * @returns {boolean}
 */
const isSMSEnabled = () => {
  return !!(process.env.GOOGLE_VOICE_EMAIL && process.env.GOOGLE_VOICE_PASSWORD);
};

module.exports = {
  initGoogleVoice,
  sendSMS,
  sendMeetingReminderSMS,
  isSMSEnabled
};
