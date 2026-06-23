const { google } = require('googleapis');
const User = require('../models/User');

const APP_CALENDAR_NAME = 'Case Management Cohort';

// Initialize OAuth2 client
const createOAuth2Client = () => {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_CALLBACK_URL
  );
};

// Get authenticated calendar client for a user
const getCalendarClient = async (userId) => {
  try {
    const user = await User.findById(userId).select('+googleAccessToken +googleRefreshToken');
    
    if (!user || !user.googleAccessToken) {
      throw new Error('User has no Google Calendar access');
    }
    
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({
      access_token: user.googleAccessToken,
      refresh_token: user.googleRefreshToken
    });
    
    // Handle token refresh
    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        user.googleAccessToken = tokens.access_token;
        await user.save();
      }
    });
    
    return google.calendar({ version: 'v3', auth: oauth2Client });
  } catch (error) {
    console.error('Error getting calendar client:', error);
    throw error;
  }
};

// Get or create the app-specific calendar for a user
// With calendar.app.created scope, we can only access calendars we create
const getOrCreateAppCalendar = async (userId) => {
  const user = await User.findById(userId);
  
  // Return existing calendar ID if we have one
  if (user.googleCalendarId) {
    return user.googleCalendarId;
  }
  
  const calendar = await getCalendarClient(userId);
  
  // Try to find existing app calendar in the list
  try {
    const calendarList = await calendar.calendarList.list();
    const existingCal = calendarList.data.items?.find(
      cal => cal.summary === APP_CALENDAR_NAME && cal.accessRole === 'owner'
    );
    
    if (existingCal) {
      // Save the calendar ID for future use
      user.googleCalendarId = existingCal.id;
      await user.save();
      return existingCal.id;
    }
  } catch (listError) {
    // If we can't list calendars, proceed to create one
    console.log('Could not list calendars, will create new one:', listError.message);
  }
  
  // Create a new calendar for this app
  const newCalendar = await calendar.calendars.insert({
    requestBody: {
      summary: APP_CALENDAR_NAME,
      description: 'Calendar for Learning Navigator meetings and appointments',
      timeZone: 'America/Los_Angeles'
    }
  });
  
  // Save the calendar ID
  user.googleCalendarId = newCalendar.data.id;
  await user.save();
  
  console.log(`Created app calendar for user ${user.email}: ${newCalendar.data.id}`);
  return newCalendar.data.id;
};

// Create a calendar event
const createCalendarEvent = async (meeting) => {
  try {
    // Skip if no Google Calendar configuration
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.log('Google Calendar not configured, skipping event creation');
      return { skipped: true };
    }
    
    const student = await User.findById(meeting.student);
    const navigator = await User.findById(meeting.navigator);
    
    if (!student || !navigator) {
      throw new Error('Could not find meeting participants');
    }
    
    const event = {
      summary: meeting.title,
      description: meeting.description || `Learning Navigator session with ${navigator.firstName} ${navigator.lastName}`,
      start: {
        dateTime: meeting.startTime.toISOString(),
        timeZone: 'America/Los_Angeles'
      },
      end: {
        dateTime: meeting.endTime.toISOString(),
        timeZone: 'America/Los_Angeles'
      },
      attendees: [
        { email: student.email },
        { email: navigator.email }
      ],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 1 day before
          { method: 'popup', minutes: 30 }       // 30 minutes before
        ]
      }
    };
    
    // Add location/conference
    if (meeting.location === 'virtual' && meeting.meetingLink) {
      event.conferenceData = {
        conferenceSolution: {
          key: { type: 'hangoutsMeet' }
        }
      };
    } else if (meeting.location === 'in_person') {
      event.location = 'In-person meeting';
    }
    
    // Try to create event on navigator's app calendar
    try {
      const navigatorCalendarId = await getOrCreateAppCalendar(navigator._id);
      const navigatorCalendar = await getCalendarClient(navigator._id);
      const navigatorEvent = await navigatorCalendar.events.insert({
        calendarId: navigatorCalendarId,
        resource: event,
        sendUpdates: 'all'
      });
      
      meeting.navigatorCalendarEventId = navigatorEvent.data.id;
      meeting.googleEventId = navigatorEvent.data.id;
    } catch (navError) {
      console.error('Could not create event on navigator calendar:', navError.message);
    }
    
    // Try to create event on student's app calendar
    try {
      const studentCalendarId = await getOrCreateAppCalendar(student._id);
      const studentCalendar = await getCalendarClient(student._id);
      const studentEvent = await studentCalendar.events.insert({
        calendarId: studentCalendarId,
        resource: event,
        sendUpdates: 'none'
      });
      
      meeting.studentCalendarEventId = studentEvent.data.id;
    } catch (studError) {
      console.error('Could not create event on student calendar:', studError.message);
    }
    
    await meeting.save();
    
    return { success: true };
  } catch (error) {
    console.error('Error creating calendar event:', error);
    // Don't throw - calendar integration should not break meeting creation
    return { error: error.message };
  }
};

// Update a calendar event
const updateCalendarEvent = async (meeting) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.log('Google Calendar not configured, skipping event update');
      return { skipped: true };
    }
    
    const student = await User.findById(meeting.student);
    const navigator = await User.findById(meeting.navigator);
    
    const event = {
      summary: meeting.title,
      description: meeting.description,
      start: {
        dateTime: meeting.startTime.toISOString(),
        timeZone: 'America/Los_Angeles'
      },
      end: {
        dateTime: meeting.endTime.toISOString(),
        timeZone: 'America/Los_Angeles'
      }
    };
    
    // Update on navigator's app calendar
    if (meeting.navigatorCalendarEventId) {
      try {
        const navigatorCalendarId = await getOrCreateAppCalendar(navigator._id);
        const navigatorCalendar = await getCalendarClient(navigator._id);
        await navigatorCalendar.events.update({
          calendarId: navigatorCalendarId,
          eventId: meeting.navigatorCalendarEventId,
          resource: event,
          sendUpdates: 'all'
        });
      } catch (navError) {
        console.error('Could not update navigator calendar event:', navError.message);
      }
    }
    
    // Update on student's app calendar
    if (meeting.studentCalendarEventId) {
      try {
        const studentCalendarId = await getOrCreateAppCalendar(student._id);
        const studentCalendar = await getCalendarClient(student._id);
        await studentCalendar.events.update({
          calendarId: studentCalendarId,
          eventId: meeting.studentCalendarEventId,
          resource: event,
          sendUpdates: 'none'
        });
      } catch (studError) {
        console.error('Could not update student calendar event:', studError.message);
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error updating calendar event:', error);
    return { error: error.message };
  }
};

// Delete a calendar event
const deleteCalendarEvent = async (meeting) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.log('Google Calendar not configured, skipping event deletion');
      return { skipped: true };
    }
    
    const navigator = await User.findById(meeting.navigator);
    const student = await User.findById(meeting.student);
    
    // Delete from navigator's app calendar
    if (meeting.navigatorCalendarEventId) {
      try {
        const navigatorCalendarId = await getOrCreateAppCalendar(navigator._id);
        const navigatorCalendar = await getCalendarClient(navigator._id);
        await navigatorCalendar.events.delete({
          calendarId: navigatorCalendarId,
          eventId: meeting.navigatorCalendarEventId,
          sendUpdates: 'all'
        });
      } catch (navError) {
        console.error('Could not delete navigator calendar event:', navError.message);
      }
    }
    
    // Delete from student's app calendar
    if (meeting.studentCalendarEventId) {
      try {
        const studentCalendarId = await getOrCreateAppCalendar(student._id);
        const studentCalendar = await getCalendarClient(student._id);
        await studentCalendar.events.delete({
          calendarId: studentCalendarId,
          eventId: meeting.studentCalendarEventId,
          sendUpdates: 'none'
        });
      } catch (studError) {
        console.error('Could not delete student calendar event:', studError.message);
      }
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error deleting calendar event:', error);
    return { error: error.message };
  }
};

// Get user's calendar events from app calendar
const getCalendarEvents = async (userId, startDate, endDate) => {
  try {
    const calendarId = await getOrCreateAppCalendar(userId);
    const calendar = await getCalendarClient(userId);
    
    const response = await calendar.events.list({
      calendarId: calendarId,
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    });
    
    return response.data.items;
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    throw error;
  }
};

module.exports = {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvents,
  getOrCreateAppCalendar
};
