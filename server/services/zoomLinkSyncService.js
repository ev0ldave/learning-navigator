/**
 * Zoom Link Sync Service
 * 
 * On startup, updates all scheduled/confirmed future meetings with the current
 * ZOOM_LINK from environment, and syncs changes to Google Calendar.
 * If calendar update fails, sends email notification with the new link.
 */

const Meeting = require('../models/Meeting');
const User = require('../models/User');
const { updateCalendarEvent } = require('./calendarService');
const { sendEmail } = require('./notificationService');

/**
 * Send email notification about updated zoom link
 */
const sendZoomLinkUpdateEmail = async (user, meeting, zoomLink) => {
  const formatDateTime = (date) => {
    return new Date(date).toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const subject = `Updated Meeting Link - ${meeting.title}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1976d2;">Meeting Link Updated</h2>
      <p>Hi ${user.firstName},</p>
      <p>The meeting link for your upcoming appointment has been updated:</p>
      
      <div style="background-color: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 0 0 10px 0;"><strong>Meeting:</strong> ${meeting.title}</p>
        <p style="margin: 0 0 10px 0;"><strong>Date & Time:</strong> ${formatDateTime(meeting.startTime)} (Pacific)</p>
        <p style="margin: 0;"><strong>New Meeting Link:</strong> <a href="${zoomLink}">${zoomLink}</a></p>
      </div>
      
      <p>Please update your calendar with this new link.</p>
      <p>Best regards,<br>Learning Navigator Team</p>
    </div>
  `;
  const text = `Meeting Link Updated\n\nHi ${user.firstName},\n\nThe meeting link for "${meeting.title}" on ${formatDateTime(meeting.startTime)} has been updated.\n\nNew Meeting Link: ${zoomLink}\n\nPlease update your calendar with this new link.\n\nBest regards,\nLearning Navigator Team`;

  try {
    await sendEmail(user.email, subject, html, text);
    return { success: true };
  } catch (error) {
    console.error(`Failed to send zoom link email to ${user.email}:`, error.message);
    return { error: error.message };
  }
};

/**
 * Sync zoom links for all future meetings
 * @returns {Promise<{updated: number, errors: number, emailsSent: number}>}
 */
const syncZoomLinks = async () => {
  const zoomLink = process.env.ZOOM_LINK;
  
  if (!zoomLink) {
    console.log('No ZOOM_LINK configured, skipping zoom link sync');
    return { skipped: true };
  }
  
  try {
    const now = new Date();
    
    // Find all future virtual meetings that don't have the current zoom link
    const meetingsToUpdate = await Meeting.find({
      startTime: { $gt: now },
      status: { $in: ['scheduled', 'confirmed'] },
      location: 'virtual',
      meetingLink: { $ne: zoomLink }
    }).populate('student navigator');
    
    if (meetingsToUpdate.length === 0) {
      console.log('✅ All virtual meetings already have current Zoom link');
      return { updated: 0, errors: 0, emailsSent: 0 };
    }
    
    console.log(`📅 Found ${meetingsToUpdate.length} meetings to update with new Zoom link`);
    
    let updated = 0;
    let errors = 0;
    let emailsSent = 0;
    
    // Track users who need email notification (calendar update failed)
    const usersToNotify = new Map(); // email -> { user, meetings: [] }
    
    for (const meeting of meetingsToUpdate) {
      try {
        // Update the meeting link
        meeting.meetingLink = zoomLink;
        await meeting.save();
        
        // Update Google Calendar events (if configured)
        const calResult = await updateCalendarEvent(meeting);
        
        if (calResult.error || calResult.skipped) {
          // Calendar update failed - queue email notifications
          const student = meeting.student;
          const navigator = meeting.navigator;
          
          if (student) {
            if (!usersToNotify.has(student.email)) {
              usersToNotify.set(student.email, { user: student, meetings: [] });
            }
            usersToNotify.get(student.email).meetings.push(meeting);
          }
          
          if (navigator) {
            if (!usersToNotify.has(navigator.email)) {
              usersToNotify.set(navigator.email, { user: navigator, meetings: [] });
            }
            usersToNotify.get(navigator.email).meetings.push(meeting);
          }
          
          if (calResult.error) {
            console.warn(`Calendar update failed for meeting ${meeting._id}: ${calResult.error}`);
          }
        }
        
        updated++;
      } catch (err) {
        console.error(`Failed to update meeting ${meeting._id}:`, err.message);
        errors++;
      }
    }
    
    // Send email notifications to users whose calendars couldn't be updated
    if (usersToNotify.size > 0) {
      console.log(`📧 Sending zoom link update emails to ${usersToNotify.size} users...`);
      
      for (const [email, data] of usersToNotify) {
        // Send one email per meeting (or could consolidate - keeping simple for now)
        for (const meeting of data.meetings) {
          const result = await sendZoomLinkUpdateEmail(data.user, meeting, zoomLink);
          if (result.success) {
            emailsSent++;
          }
        }
      }
    }
    
    console.log(`✅ Zoom link sync complete: ${updated} updated, ${errors} errors, ${emailsSent} emails sent`);
    return { updated, errors, emailsSent };
  } catch (error) {
    console.error('Zoom link sync failed:', error);
    return { error: error.message };
  }
};

module.exports = {
  syncZoomLinks
};
