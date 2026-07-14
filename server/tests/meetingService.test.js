/**
 * Tests for MeetingService - SOLID Principle implementation
 * Tests Single Responsibility, Open/Closed, and Dependency Inversion
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { MeetingService, MeetingValidationError } = require('../services/meetingService');
const { MeetingRepository } = require('../repositories/MeetingRepository');
const { UserRepository } = require('../repositories/UserRepository');
const { AvailabilityRepository } = require('../repositories/AvailabilityRepository');
const User = require('../models/User');
const Meeting = require('../models/Meeting');
const WeeklyHours = require('../models/AvailableHours');
const SchoolQuarter = require('../models/SchoolQuarter');

let mongoServer;
let meetingService;
let student;
let navigator;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Meeting.deleteMany({});
  await WeeklyHours.deleteMany({});
  await SchoolQuarter.deleteMany({});

  // Create navigator
  navigator = await User.create({
    email: 'navigator@test.com',
    firstName: 'Test',
    lastName: 'Navigator',
    role: 'learning_navigator',
    isActive: true
  });

  // Create student
  student = await User.create({
    email: 'student@test.com',
    firstName: 'Test',
    lastName: 'Student',
    role: 'student',
    isActive: true,
    assignedNavigator: navigator._id
  });

  // Create weekly availability for navigator
  await WeeklyHours.create({
    user: navigator._id,
    monday: { enabled: true, slots: [{ startTime: '09:00', endTime: '17:00' }] },
    tuesday: { enabled: true, slots: [{ startTime: '09:00', endTime: '17:00' }] },
    wednesday: { enabled: true, slots: [{ startTime: '09:00', endTime: '17:00' }] },
    thursday: { enabled: true, slots: [{ startTime: '09:00', endTime: '17:00' }] },
    friday: { enabled: true, slots: [{ startTime: '09:00', endTime: '17:00' }] },
    saturday: { enabled: false, slots: [] },
    sunday: { enabled: false, slots: [] }
  });

  // Create a new MeetingService instance (demonstrating DI)
  meetingService = new MeetingService();
});

describe('MeetingService', () => {
  describe('Single Responsibility Principle', () => {
    it('should validate navigator exists', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      
      await expect(
        meetingService.validateNavigator(fakeId)
      ).rejects.toThrow(MeetingValidationError);
    });

    it('should validate navigator is active', async () => {
      const inactiveNav = await User.create({
        email: 'inactive@test.com',
        firstName: 'Inactive',
        lastName: 'Navigator',
        role: 'learning_navigator',
        isActive: false
      });

      await expect(
        meetingService.validateNavigator(inactiveNav._id)
      ).rejects.toThrow(MeetingValidationError);
    });

    it('should validate 24-hour rule for students', () => {
      const meetingStart = new Date();
      meetingStart.setHours(meetingStart.getHours() + 12); // 12 hours from now

      expect(() => {
        meetingService.validateStudentAdvanceBooking(meetingStart, 'student');
      }).toThrow(MeetingValidationError);
    });

    it('should allow navigators to book within 24 hours', () => {
      const meetingStart = new Date();
      meetingStart.setHours(meetingStart.getHours() + 12);

      expect(() => {
        meetingService.validateStudentAdvanceBooking(meetingStart, 'learning_navigator');
      }).not.toThrow();
    });

    it('should require phone number for phone meetings', () => {
      expect(() => {
        meetingService.validatePhoneMeeting('phone', null);
      }).toThrow(MeetingValidationError);

      expect(() => {
        meetingService.validatePhoneMeeting('phone', '');
      }).toThrow(MeetingValidationError);

      expect(() => {
        meetingService.validatePhoneMeeting('phone', undefined);
      }).toThrow(MeetingValidationError);
    });

    it('should not require phone number for non-phone meetings', () => {
      expect(() => {
        meetingService.validatePhoneMeeting('virtual', null);
      }).not.toThrow();

      expect(() => {
        meetingService.validatePhoneMeeting('in_person', undefined);
      }).not.toThrow();
    });

    it('should accept phone meeting with phone number', () => {
      expect(() => {
        meetingService.validatePhoneMeeting('phone', '555-123-4567');
      }).not.toThrow();
    });

    it('should require zoom link for virtual meetings', () => {
      const navigatorWithoutZoom = { _id: 'nav1', firstName: 'Test', lastName: 'Nav', zoomLink: null };
      const navigatorWithEmptyZoom = { _id: 'nav2', firstName: 'Test', lastName: 'Nav', zoomLink: '' };
      const navigatorWithUndefinedZoom = { _id: 'nav3', firstName: 'Test', lastName: 'Nav' };

      expect(() => {
        meetingService.validateVirtualMeeting('virtual', navigatorWithoutZoom);
      }).toThrow(MeetingValidationError);

      expect(() => {
        meetingService.validateVirtualMeeting('virtual', navigatorWithEmptyZoom);
      }).toThrow(MeetingValidationError);

      expect(() => {
        meetingService.validateVirtualMeeting('virtual', navigatorWithUndefinedZoom);
      }).toThrow(MeetingValidationError);
    });

    it('should not require zoom link for phone meetings', () => {
      const navigatorWithoutZoom = { _id: 'nav1', firstName: 'Test', lastName: 'Nav', zoomLink: null };

      expect(() => {
        meetingService.validateVirtualMeeting('phone', navigatorWithoutZoom);
      }).not.toThrow();
    });

    it('should accept virtual meeting when navigator has zoom link', () => {
      const navigatorWithZoom = { _id: 'nav1', firstName: 'Test', lastName: 'Nav', zoomLink: 'https://zoom.us/j/123456' };

      expect(() => {
        meetingService.validateVirtualMeeting('virtual', navigatorWithZoom);
      }).not.toThrow();
    });
  });

  describe('Dependency Inversion Principle', () => {
    it('should accept injected repositories', async () => {
      // Create mock repositories
      const mockMeetingRepo = {
        findConflicting: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ _id: 'mock-id', save: jest.fn() })
      };
      const mockUserRepo = {
        findNavigator: jest.fn().mockResolvedValue(navigator)
      };
      const mockAvailabilityRepo = {
        findByUser: jest.fn().mockResolvedValue({
          monday: { enabled: true, slots: [{ startTime: '09:00', endTime: '17:00' }] }
        })
      };

      // Inject mocks
      const serviceWithMocks = new MeetingService(
        mockMeetingRepo,
        mockUserRepo,
        mockAvailabilityRepo
      );

      // The service should use the injected mocks
      await serviceWithMocks.validateNavigator(navigator._id);
      expect(mockUserRepo.findNavigator).toHaveBeenCalledWith(navigator._id);
    });
  });

  describe('Business Logic', () => {
    it('should check for scheduling conflicts', async () => {
      // Create an existing meeting
      const existingStart = new Date();
      existingStart.setDate(existingStart.getDate() + 3);
      while (existingStart.getDay() === 0 || existingStart.getDay() === 6) {
        existingStart.setDate(existingStart.getDate() + 1);
      }
      existingStart.setHours(10, 0, 0, 0);

      await Meeting.create({
        student: student._id,
        navigator: navigator._id,
        title: 'Existing Meeting',
        startTime: existingStart,
        endTime: new Date(existingStart.getTime() + 30 * 60 * 1000),
        status: 'scheduled',
        createdBy: student._id
      });

      // Try to check conflicts at the same time
      await expect(
        meetingService.checkConflicts(
          navigator._id,
          existingStart,
          new Date(existingStart.getTime() + 30 * 60 * 1000)
        )
      ).rejects.toThrow(MeetingValidationError);
    });

    it('should calculate recurrence settings for students', async () => {
      const result = await meetingService.calculateRecurrenceSettings(true, 'student', {});
      
      expect(result.frequency).toBe('weekly');
      // endDate should be set to quarter end or fallback
    });

    it('should allow navigators to customize recurrence', async () => {
      const result = await meetingService.calculateRecurrenceSettings(
        true,
        'learning_navigator',
        { frequency: 'biweekly' }
      );
      
      expect(result.frequency).toBe('biweekly');
    });
  });

  describe('Meeting Operations', () => {
    let meeting;

    beforeEach(async () => {
      const startTime = new Date();
      startTime.setDate(startTime.getDate() + 3);
      while (startTime.getDay() === 0 || startTime.getDay() === 6) {
        startTime.setDate(startTime.getDate() + 1);
      }
      startTime.setHours(10, 0, 0, 0);

      meeting = await Meeting.create({
        student: student._id,
        navigator: navigator._id,
        title: 'Test Meeting',
        startTime,
        endTime: new Date(startTime.getTime() + 30 * 60 * 1000),
        status: 'scheduled',
        createdBy: student._id
      });
    });

    it('should cancel a meeting', async () => {
      const result = await meetingService.cancelMeeting(
        meeting._id,
        student,
        'Test cancellation'
      );

      expect(result.status).toBe('cancelled');
      expect(result.cancellationReason).toBe('Test cancellation');
    });

    it('should deny unauthorized cancellation', async () => {
      const otherUser = await User.create({
        email: 'other@test.com',
        firstName: 'Other',
        lastName: 'User',
        role: 'student',
        isActive: true
      });

      await expect(
        meetingService.cancelMeeting(meeting._id, otherUser, 'Reason')
      ).rejects.toThrow(MeetingValidationError);
    });

    it('should complete a meeting', async () => {
      const result = await meetingService.completeMeeting(meeting._id, navigator);
      
      expect(result.status).toBe('completed');
    });

    it('should only allow assigned navigator to complete', async () => {
      const otherNav = await User.create({
        email: 'other-nav@test.com',
        firstName: 'Other',
        lastName: 'Navigator',
        role: 'learning_navigator',
        isActive: true
      });

      await expect(
        meetingService.completeMeeting(meeting._id, otherNav)
      ).rejects.toThrow(MeetingValidationError);
    });

    it('should mark meeting as no-show', async () => {
      const result = await meetingService.markNoShow(meeting._id, navigator);
      
      expect(result.status).toBe('no_show');
    });
  });

  describe('Access Control', () => {
    it('should correctly determine access for student', async () => {
      const meeting = {
        student: { _id: student._id },
        navigator: { _id: navigator._id }
      };

      expect(meetingService.hasAccess(meeting, student)).toBe(true);
    });

    it('should correctly determine access for navigator', async () => {
      const meeting = {
        student: { _id: student._id },
        navigator: { _id: navigator._id }
      };

      expect(meetingService.hasAccess(meeting, navigator)).toBe(true);
    });

    it('should correctly determine access for admin', async () => {
      const admin = { _id: new mongoose.Types.ObjectId(), role: 'administrator' };
      const meeting = {
        student: { _id: student._id },
        navigator: { _id: navigator._id }
      };

      expect(meetingService.hasAccess(meeting, admin)).toBe(true);
    });

    it('should deny access to unrelated users', async () => {
      const otherUser = { _id: new mongoose.Types.ObjectId(), role: 'student' };
      const meeting = {
        student: { _id: student._id },
        navigator: { _id: navigator._id }
      };

      expect(meetingService.hasAccess(meeting, otherUser)).toBe(false);
    });
  });
});

describe('MeetingValidationError', () => {
  it('should have correct properties', () => {
    const error = new MeetingValidationError('Test message', 404, { extra: 'data' });
    
    expect(error.message).toBe('Test message');
    expect(error.statusCode).toBe(404);
    expect(error.details).toEqual({ extra: 'data' });
    expect(error.name).toBe('MeetingValidationError');
  });

  it('should default to 400 status code', () => {
    const error = new MeetingValidationError('Bad request');
    
    expect(error.statusCode).toBe(400);
  });
});
