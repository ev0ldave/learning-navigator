/**
 * Repository Layer Index
 * Exports all repositories for centralized access
 */
const BaseRepository = require('./BaseRepository');
const meetingRepository = require('./MeetingRepository');
const userRepository = require('./UserRepository');
const availabilityRepository = require('./AvailabilityRepository');

module.exports = {
  BaseRepository,
  meetingRepository,
  userRepository,
  availabilityRepository,
  // Export classes for dependency injection
  MeetingRepository: require('./MeetingRepository').MeetingRepository,
  UserRepository: require('./UserRepository').UserRepository,
  AvailabilityRepository: require('./AvailabilityRepository').AvailabilityRepository
};
