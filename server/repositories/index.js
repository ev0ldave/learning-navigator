/**
 * Repository Layer Index
 * Exports all repositories for centralized access
 */
const BaseRepository = require('./BaseRepository');
const meetingRepository = require('./MeetingRepository');
const userRepository = require('./UserRepository');
const availabilityRepository = require('./AvailabilityRepository');
const noteRepository = require('./NoteRepository');
const quarterRepository = require('./QuarterRepository');
const reportRepository = require('./ReportRepository');

module.exports = {
  BaseRepository,
  meetingRepository,
  userRepository,
  availabilityRepository,
  noteRepository,
  quarterRepository,
  reportRepository,
  // Export classes for dependency injection
  MeetingRepository: require('./MeetingRepository').MeetingRepository,
  UserRepository: require('./UserRepository').UserRepository,
  AvailabilityRepository: require('./AvailabilityRepository').AvailabilityRepository,
  NoteRepository: require('./NoteRepository').NoteRepository,
  QuarterRepository: require('./QuarterRepository').QuarterRepository,
  ReportRepository: require('./ReportRepository').ReportRepository
};
