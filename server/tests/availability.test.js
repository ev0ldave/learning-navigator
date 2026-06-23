const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../index');
const User = require('../models/User');
const WeeklyHours = require('../models/AvailableHours');
const Meeting = require('../models/Meeting');

let mongoServer;
let studentToken;
let navigatorToken;
let adminToken;
let student;
let navigator;
let admin;

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
  await WeeklyHours.deleteMany({});
  await Meeting.deleteMany({});

  // Create student
  const studentRes = await request(app)
    .post('/api/auth/local/register')
    .send({
      email: '1411andrew@gmail.com',
      password: 'testpassword123',
      firstName: 'Test',
      lastName: 'Student'
    });
  studentToken = studentRes.body.token;
  student = await User.findOne({ email: '1411andrew@gmail.com' });

  // Create navigator
  navigator = new User({
    email: 'navigator@test.com',
    firstName: 'Test',
    lastName: 'Navigator',
    role: 'learning_navigator',
    isActive: true
  });
  await navigator.save();
  
  // Generate navigator token
  const jwt = require('jsonwebtoken');
  navigatorToken = jwt.sign(
    { userId: navigator._id },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '7d' }
  );

  // Create admin
  const adminRes = await request(app)
    .post('/api/auth/local/register')
    .send({
      email: 'trlandrew@students.highline.edu',
      password: 'adminpass123',
      firstName: 'Admin',
      lastName: 'User'
    });
  adminToken = adminRes.body.token;
  admin = await User.findOne({ email: 'trlandrew@students.highline.edu' });
});

describe('Availability Routes', () => {
  describe('GET /api/availability', () => {
    it('should create default schedule if none exists for navigator', async () => {
      const res = await request(app)
        .get('/api/availability')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.weeklyHours).toBeDefined();
      expect(res.body.weeklyHours.monday.enabled).toBe(true);
      expect(res.body.weeklyHours.saturday.enabled).toBe(false);
    });

    it('should get existing schedule for navigator', async () => {
      // Create custom schedule
      await WeeklyHours.create({
        user: navigator._id,
        monday: { enabled: true, slots: [{ startTime: '10:00', endTime: '14:00' }] },
        tuesday: { enabled: false, slots: [] }
      });

      const res = await request(app)
        .get('/api/availability')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.weeklyHours.monday.slots[0].startTime).toBe('10:00');
      expect(res.body.weeklyHours.tuesday.enabled).toBe(false);
    });

    it('should reject student access', async () => {
      await request(app)
        .get('/api/availability')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);
    });

    it('should allow admin access', async () => {
      const res = await request(app)
        .get('/api/availability')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/availability/user/:userId', () => {
    beforeEach(async () => {
      await WeeklyHours.create({
        user: navigator._id,
        monday: { enabled: true, slots: [{ startTime: '09:00', endTime: '17:00' }] },
        tuesday: { enabled: true, slots: [{ startTime: '10:00', endTime: '16:00' }] },
        wednesday: { enabled: false, slots: [] }
      });
    });

    it('should get navigator availability as student', async () => {
      const res = await request(app)
        .get(`/api/availability/user/${navigator._id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.weeklyHours.monday.enabled).toBe(true);
      expect(res.body.weeklyHours.wednesday.enabled).toBe(false);
    });

    it('should return empty availability if not configured', async () => {
      const newNavigator = await User.create({
        email: 'new@test.com',
        firstName: 'New',
        lastName: 'Navigator',
        role: 'learning_navigator',
        isActive: true
      });

      const res = await request(app)
        .get(`/api/availability/user/${newNavigator._id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.weeklyHours._notConfigured).toBe(true);
      expect(res.body.weeklyHours.monday.enabled).toBe(false);
    });
  });

  describe('PUT /api/availability', () => {
    it('should update weekly hours as navigator', async () => {
      const res = await request(app)
        .put('/api/availability')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .send({
          monday: { enabled: true, slots: [{ startTime: '08:00', endTime: '12:00' }] },
          tuesday: { enabled: true, slots: [{ startTime: '13:00', endTime: '17:00' }] },
          wednesday: { enabled: false, slots: [] }
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.weeklyHours.monday.slots[0].startTime).toBe('08:00');
      expect(res.body.weeklyHours.tuesday.enabled).toBe(true);
      expect(res.body.weeklyHours.wednesday.enabled).toBe(false);
    });

    it('should update with multiple slots per day', async () => {
      const res = await request(app)
        .put('/api/availability')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .send({
          monday: {
            enabled: true,
            slots: [
              { startTime: '09:00', endTime: '12:00' },
              { startTime: '13:00', endTime: '17:00' }
            ]
          }
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.weeklyHours.monday.slots.length).toBe(2);
    });

    it('should update timezone', async () => {
      const res = await request(app)
        .put('/api/availability')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .send({
          timezone: 'America/New_York'
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.weeklyHours.timezone).toBe('America/New_York');
    });

    it('should reject invalid time format', async () => {
      const res = await request(app)
        .put('/api/availability')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .send({
          monday: {
            enabled: true,
            slots: [{ startTime: '9:00 AM', endTime: '5:00 PM' }] // Invalid format
          }
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject end time before start time', async () => {
      const res = await request(app)
        .put('/api/availability')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .send({
          monday: {
            enabled: true,
            slots: [{ startTime: '17:00', endTime: '09:00' }] // End before start
          }
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject student update', async () => {
      await request(app)
        .put('/api/availability')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          monday: { enabled: true, slots: [] }
        })
        .expect(403);
    });
  });

  describe('GET /api/availability/slots/:userId', () => {
    beforeEach(async () => {
      await WeeklyHours.create({
        user: navigator._id,
        sunday: { enabled: false, slots: [] },
        monday: { enabled: true, slots: [{ startTime: '09:00', endTime: '17:00' }] },
        tuesday: { enabled: true, slots: [{ startTime: '09:00', endTime: '17:00' }] },
        wednesday: { enabled: true, slots: [{ startTime: '09:00', endTime: '17:00' }] },
        thursday: { enabled: true, slots: [{ startTime: '09:00', endTime: '17:00' }] },
        friday: { enabled: true, slots: [{ startTime: '09:00', endTime: '17:00' }] },
        saturday: { enabled: false, slots: [] }
      });
    });

    it('should get available slots for a date', async () => {
      // Get a future Monday
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      while (futureDate.getDay() !== 1) { // Find Monday
        futureDate.setDate(futureDate.getDate() + 1);
      }
      const dateStr = futureDate.toISOString().split('T')[0];

      const res = await request(app)
        .get(`/api/availability/slots/${navigator._id}?date=${dateStr}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.slots)).toBe(true);
    });

    it('should return empty slots for disabled day', async () => {
      // Saturday is disabled in the test setup
      // Use a far future date and explicitly set the weekly hours for that day
      await WeeklyHours.findOneAndUpdate(
        { user: navigator._id },
        { 
          $set: {
            sunday: { enabled: false, slots: [] },
            saturday: { enabled: false, slots: [] }
          }
        }
      );

      // Get any future Saturday (day 6)
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 14);
      while (futureDate.getDay() !== 6) {
        futureDate.setDate(futureDate.getDate() + 1);
      }
      const dateStr = futureDate.toISOString().split('T')[0];

      const res = await request(app)
        .get(`/api/availability/slots/${navigator._id}?date=${dateStr}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      // Either no slots or message about no availability
      expect(res.body.slots.length === 0 || res.body.message).toBeTruthy();
    });

    it('should require date parameter', async () => {
      const res = await request(app)
        .get(`/api/availability/slots/${navigator._id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Date is required');
    });

    it('should exclude slots with existing meetings', async () => {
      // Get a future Monday
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      while (futureDate.getDay() !== 1) { // Find Monday
        futureDate.setDate(futureDate.getDate() + 1);
      }
      
      // Create a meeting at 10:00 Pacific time
      // Use ISO date format and set time in a way that's more timezone-independent
      const dateStr = futureDate.toISOString().split('T')[0];
      const meetingStart = new Date(`${dateStr}T17:00:00.000Z`); // 10:00 AM Pacific = 17:00 UTC (PDT)
      const meetingEnd = new Date(`${dateStr}T17:30:00.000Z`);

      await Meeting.create({
        student: student._id,
        navigator: navigator._id,
        title: 'Existing Meeting',
        startTime: meetingStart,
        endTime: meetingEnd,
        status: 'scheduled',
        createdBy: student._id
      });

      const res = await request(app)
        .get(`/api/availability/slots/${navigator._id}?date=${dateStr}&duration=30`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      // Check that the meeting time slot is excluded by verifying
      // the slot starting at the meeting time is not available
      const conflictingSlot = res.body.slots.find(s => {
        const slotStart = new Date(s.start);
        return slotStart.getTime() === meetingStart.getTime();
      });
      expect(conflictingSlot).toBeUndefined();
    });

    it('should return empty if navigator has no availability set', async () => {
      const newNavigator = await User.create({
        email: 'noavail@test.com',
        firstName: 'No',
        lastName: 'Availability',
        role: 'learning_navigator',
        isActive: true
      });

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      const dateStr = futureDate.toISOString().split('T')[0];

      const res = await request(app)
        .get(`/api/availability/slots/${newNavigator._id}?date=${dateStr}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.slots.length).toBe(0);
      expect(res.body.message).toContain('not set');
    });

    it('should respect duration parameter', async () => {
      // Get a future Monday
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7);
      while (futureDate.getDay() !== 1) {
        futureDate.setDate(futureDate.getDate() + 1);
      }
      const dateStr = futureDate.toISOString().split('T')[0];

      const res30 = await request(app)
        .get(`/api/availability/slots/${navigator._id}?date=${dateStr}&duration=30`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      const res60 = await request(app)
        .get(`/api/availability/slots/${navigator._id}?date=${dateStr}&duration=60`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      // 60-minute slots should be fewer than 30-minute slots
      expect(res60.body.slots.length).toBeLessThan(res30.body.slots.length);
    });
  });

  describe('WeeklyHours Model', () => {
    it('should have default weekday schedule', async () => {
      const schedule = new WeeklyHours({ user: navigator._id });
      await schedule.save();

      expect(schedule.monday.enabled).toBe(true);
      expect(schedule.monday.slots[0].startTime).toBe('09:00');
      expect(schedule.monday.slots[0].endTime).toBe('17:00');
      expect(schedule.sunday.enabled).toBe(false);
      expect(schedule.saturday.enabled).toBe(false);
    });

    it('should get availability for specific day number', async () => {
      const schedule = new WeeklyHours({
        user: navigator._id,
        wednesday: { enabled: true, slots: [{ startTime: '10:00', endTime: '15:00' }] }
      });
      await schedule.save();

      const wednesdayAvail = schedule.getAvailabilityForDay(3); // Wednesday = 3
      expect(wednesdayAvail.enabled).toBe(true);
      expect(wednesdayAvail.slots[0].startTime).toBe('10:00');
    });

    it('should enforce one schedule per user', async () => {
      await WeeklyHours.create({ user: navigator._id });

      await expect(
        WeeklyHours.create({ user: navigator._id })
      ).rejects.toThrow();
    });

    it('should default timezone to America/Los_Angeles', async () => {
      const schedule = new WeeklyHours({ user: navigator._id });
      await schedule.save();

      expect(schedule.timezone).toBe('America/Los_Angeles');
    });
  });
});
