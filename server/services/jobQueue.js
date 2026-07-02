/**
 * Job Queue Service - Synchronous Implementation
 * 
 * This module provides helper functions for 3rd party API operations.
 * Operations are executed synchronously with graceful error handling.
 * Failures are logged but don't break core functionality.
 */

const { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } = require('./calendarService');
const { sendMeetingNotification, sendNoteSharedNotification } = require('./notificationService');
const Meeting = require('../models/Meeting');
const Note = require('../models/Note');
const User = require('../models/User');

// No-op initialization (kept for backwards compatibility)
const initJobQueue = async (mongoUri) => {
  // Job queue disabled - using synchronous execution
  return null;
};

// Calendar operations - execute directly with error handling
const queueCalendarCreate = async (meetingId) => {
  try {
    const meeting = await Meeting.findById(meetingId)
      .populate('student')
      .populate('navigator');
    
    if (!meeting || meeting.status === 'cancelled') {
      return { skipped: true };
    }
    
    return await createCalendarEvent(meeting);
  } catch (error) {
    console.error('Calendar event creation failed:', error.message);
    return { error: error.message };
  }
};

const queueCalendarUpdate = async (meetingId) => {
  try {
    const meeting = await Meeting.findById(meetingId)
      .populate('student')
      .populate('navigator');
    
    if (!meeting) {
      return { skipped: true };
    }
    
    return await updateCalendarEvent(meeting);
  } catch (error) {
    console.error('Calendar event update failed:', error.message);
    return { error: error.message };
  }
};

const queueCalendarDelete = async (meeting) => {
  try {
    return await deleteCalendarEvent(meeting);
  } catch (error) {
    console.error('Calendar event deletion failed:', error.message);
    return { error: error.message };
  }
};

// Notification operations - execute directly with error handling
const queueMeetingNotification = async (meetingId, type) => {
  try {
    const meeting = await Meeting.findById(meetingId)
      .populate('student')
      .populate('navigator');
    
    if (!meeting) {
      return { skipped: true };
    }
    
    return await sendMeetingNotification(meeting, type);
  } catch (error) {
    console.error('Meeting notification failed:', error.message);
    return { error: error.message };
  }
};

const queueNoteNotification = async (noteId, studentId) => {
  try {
    const note = await Note.findById(noteId).populate('navigator');
    const student = await User.findById(studentId);
    
    if (!note || !student) {
      return { skipped: true };
    }
    
    return await sendNoteSharedNotification(note, student);
  } catch (error) {
    console.error('Note notification failed:', error.message);
    return { error: error.message };
  }
};

// Email queue (direct execution)
const queueEmail = async (to, subject, html, text) => {
  try {
    const { sendEmail } = require('./notificationService');
    return await sendEmail(to, subject, html, text);
  } catch (error) {
    console.error('Email send failed:', error.message);
    return { error: error.message };
  }
};

// Stats functions (no-op since no queue)
const getJobStats = async () => {
  return {
    status: 'synchronous',
    message: 'Job queue disabled - operations execute synchronously'
  };
};

const getFailedJobs = async (limit = 50) => {
  return [];
};

const retryJob = async (jobId) => {
  throw new Error('Job queue disabled - no jobs to retry');
};

const cleanupOldJobs = async (daysOld = 7) => {
  return { deleted: 0, message: 'Job queue disabled' };
};

module.exports = {
  initJobQueue,
  getJobStats,
  getFailedJobs,
  retryJob,
  cleanupOldJobs,
  queueCalendarCreate,
  queueCalendarUpdate,
  queueCalendarDelete,
  queueEmail,
  queueMeetingNotification,
  queueNoteNotification
};
