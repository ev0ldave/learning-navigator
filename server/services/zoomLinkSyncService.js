/**
 * Zoom Link Sync Service
 * 
 * On startup, updates all scheduled/confirmed future meetings with each navigator's
 * configured zoom link, and syncs changes to Google Calendar.
 * If calendar update fails, sends email notification with the new link.
 * Falls back to ZOOM_LINK env variable for navigators without a configured link.
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
 * Updates meetings to use each navigator's configured zoom link
 * @returns {Promise<{updated: number, errors: number, emailsSent: number}>}
 */
const syncZoomLinks = async () => {
  try {
    const now = new Date();
    const fallbackZoomLink = process.env.ZOOM_LINK;
    
    // Find all navigators who have a zoom link configured
    const navigatorsWithLinks = await User.find({
      role: { $in: ['learning_navigator', 'administrator'] },
      zoomLink: { $exists: true, $ne: null, $ne: '' }
    }).select('_id zoomLink firstName lastName');
    
    if (navigatorsWithLinks.length === 0 && !fallbackZoomLink) {
      console.log('No navigator zoom links or fallback ZOOM_LINK configured, skipping zoom link sync');
      return { skipped: true };
    }
    
    console.log(`🔗 Found ${navigatorsWithLinks.length} navigators with configured zoom links`);
    
    let totalUpdated = 0;
    let totalErrors = 0;
    let totalEmailsSent = 0;
    const usersToNotify = new Map(); // email -> { user, meetings: [] }
    
    // Process each navigator's meetings
    for (const navigator of navigatorsWithLinks) {
      const meetingsToUpdate = await Meeting.find({
        navigator: navigator._id,
        startTime: { $gt: now },
        status: { $in: ['scheduled', 'confirmed'] },
        location: 'virtual',
        meetingLink: { $ne: navigator.zoomLink }
      }).populate('student navigator');
      
      if (meetingsToUpdate.length > 0) {
        console.log(`📅 Updating ${meetingsToUpdate.length} meetings for ${navigator.firstName} ${navigator.lastName}`);
        
        for (const meeting of meetingsToUpdate) {
          try {
            meeting.meetingLink = navigator.zoomLink;
            await meeting.save();
            
            const calResult = await updateCalendarEvent(meeting);
            
            if (calResult.error || calResult.skipped) {
              // Queue email notifications for failed calendar updates
              const student = meeting.student;
              if (student) {
                if (!usersToNotify.has(student.email)) {
                  usersToNotify.set(student.email, { user: student, meetings: [] });
                }
                usersToNotify.get(student.email).meetings.push({ meeting, zoomLink: navigator.zoomLink });
              }
              
              const nav = meeting.navigator;
              if (nav) {
                if (!usersToNotify.has(nav.email)) {
                  usersToNotify.set(nav.email, { user: nav, meetings: [] });
                }
                usersToNotify.get(nav.email).meetings.push({ meeting, zoomLink: navigator.zoomLink });
              }
            }
            
            totalUpdated++;
          } catch (err) {
            console.error(`Failed to update meeting ${meeting._id}:`, err.message);
            totalErrors++;
          }
        }
      }
    }
    
    // Handle meetings for navigators without configured links (use fallback)
    if (fallbackZoomLink) {
      const navigatorIds = navigatorsWithLinks.map(n => n._id);
      const meetingsWithoutLink = await Meeting.find({
        navigator: { $nin: navigatorIds },
        startTime: { $gt: now },
        status: { $in: ['scheduled', 'confirmed'] },
        location: 'virtual',
        $or: [
          { meetingLink: { $exists: false } },
          { meetingLink: null },
          { meetingLink: '' }
        ]
      }).populate('student navigator');
      
      if (meetingsWithoutLink.length > 0) {
        console.log(`📅 Updating ${meetingsWithoutLink.length} meetings with fallback zoom link`);
        
        for (const meeting of meetingsWithoutLink) {
          try {
            meeting.meetingLink = fallbackZoomLink;
            await meeting.save();
            
            const calResult = await updateCalendarEvent(meeting);
            
            if (calResult.error || calResult.skipped) {
              const student = meeting.student;
              if (student) {
                if (!usersToNotify.has(student.email)) {
                  usersToNotify.set(student.email, { user: student, meetings: [] });
                }
                usersToNotify.get(student.email).meetings.push({ meeting, zoomLink: fallbackZoomLink });
              }
              
              const nav = meeting.navigator;
              if (nav) {
                if (!usersToNotify.has(nav.email)) {
                  usersToNotify.set(nav.email, { user: nav, meetings: [] });
                }
                usersToNotify.get(nav.email).meetings.push({ meeting, zoomLink: fallbackZoomLink });
              }
            }
            
            totalUpdated++;
          } catch (err) {
            console.error(`Failed to update meeting ${meeting._id}:`, err.message);
            totalErrors++;
          }
        }
      }
    }
    
    // Send email notifications
    if (usersToNotify.size > 0) {
      console.log(`📧 Sending zoom link update emails to ${usersToNotify.size} users...`);
      
      for (const [email, data] of usersToNotify) {
        for (const { meeting, zoomLink } of data.meetings) {
          const result = await sendZoomLinkUpdateEmail(data.user, meeting, zoomLink);
          if (result.success) {
            totalEmailsSent++;
          }
        }
      }
    }
    
    console.log(`✅ Zoom link sync complete: ${totalUpdated} updated, ${totalErrors} errors, ${totalEmailsSent} emails sent`);
    return { updated: totalUpdated, errors: totalErrors, emailsSent: totalEmailsSent };
  } catch (error) {
    console.error('Zoom link sync failed:', error);
    return { error: error.message };
  }
};

module.exports = {
  syncZoomLinks
};
