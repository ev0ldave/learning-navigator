const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../index');
const User = require('../models/User');
const Meeting = require('../models/Meeting');
const WeeklyHours = require('../models/AvailableHours');

let mongoServer;
let studentToken;
let navigatorToken;
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
    isActive: true,
    zoomLink: 'https://zoom.us/j/testmeeting123',
    availability: [
      { dayOfWeek: 1, startTime: '09:00', endTime: '17:00' },
      { dayOfWeek: 2, startTime: '09:00', endTime: '17:00' },
      { dayOfWeek: 3, startTime: '09:00', endTime: '17:00' },
      { dayOfWeek: 4, startTime: '09:00', endTime: '17:00' },
      { dayOfWeek: 5, startTime: '09:00', endTime: '17:00' }
    ]
  });
  await navigator.save();

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

  // Assign navigator to student
  student.assignedNavigator = navigator._id;
  await student.save();
});

describe('Meeting Routes', () => {
  describe('POST /api/meetings', () => {
    it('should create a meeting as student', async () => {
      // Find next available weekday (Mon-Fri) at least 2 days out (24h rule)
      const startTime = new Date();
      startTime.setDate(startTime.getDate() + 2); // At least 2 days to satisfy 24h rule
      // Ensure it's a weekday
      while (startTime.getDay() === 0 || startTime.getDay() === 6) {
        startTime.setDate(startTime.getDate() + 1);
      }
      startTime.setHours(10, 0, 0, 0);
      
      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + 30);

      const res = await request(app)
        .post('/api/meetings')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          navigatorId: navigator._id.toString(),
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
          title: 'Test Meeting',
          location: 'virtual'
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.meeting.title).toBe('Test Meeting');
      expect(res.body.meeting.status).toBe('scheduled');
      // Virtual meetings should have navigator's Zoom link
      expect(res.body.meeting.meetingLink).toBe('https://zoom.us/j/testmeeting123');
    });

    it('should reject meeting without navigator', async () => {
      const startTime = new Date();
      startTime.setDate(startTime.getDate() + 1);

      const res = await request(app)
        .post('/api/meetings')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          startTime: startTime.toISOString(),
          endTime: new Date(startTime.getTime() + 30 * 60 * 1000).toISOString()
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject phone meeting without phone number', async () => {
      const startTime = new Date();
      startTime.setDate(startTime.getDate() + 2);
      while (startTime.getDay() === 0 || startTime.getDay() === 6) {
        startTime.setDate(startTime.getDate() + 1);
      }
      startTime.setHours(10, 0, 0, 0);

      const res = await request(app)
        .post('/api/meetings')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          navigatorId: navigator._id.toString(),
          startTime: startTime.toISOString(),
          endTime: new Date(startTime.getTime() + 30 * 60 * 1000).toISOString(),
          title: 'Phone Meeting',
          location: 'phone'
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.errors[0].msg).toContain('Phone number is required');
    });

    it('should create phone meeting with phone number', async () => {
      const startTime = new Date();
      startTime.setDate(startTime.getDate() + 2);
      while (startTime.getDay() === 0 || startTime.getDay() === 6) {
        startTime.setDate(startTime.getDate() + 1);
      }
      startTime.setHours(10, 0, 0, 0);

      const res = await request(app)
        .post('/api/meetings')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          navigatorId: navigator._id.toString(),
          startTime: startTime.toISOString(),
          endTime: new Date(startTime.getTime() + 30 * 60 * 1000).toISOString(),
          title: 'Phone Meeting',
          location: 'phone',
          phoneNumber: '555-123-4567'
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.meeting.location).toBe('phone');
      expect(res.body.meeting.phoneNumber).toBe('555-123-4567');
    });
  });

  describe('GET /api/meetings', () => {
    beforeEach(async () => {
      const startTime = new Date();
      startTime.setDate(startTime.getDate() + 1);
      startTime.setHours(10, 0, 0, 0);

      await Meeting.create({
        student: student._id,
        navigator: navigator._id,
        title: 'Test Meeting 1',
        startTime: startTime,
        endTime: new Date(startTime.getTime() + 30 * 60 * 1000),
        status: 'scheduled',
        createdBy: student._id
      });
    });

    it('should get meetings for authenticated user', async () => {
      const res = await request(app)
        .get('/api/meetings')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.meetings.length).toBe(1);
      expect(res.body.meetings[0].title).toBe('Test Meeting 1');
    });

    it('should reject without authentication', async () => {
      await request(app)
        .get('/api/meetings')
        .expect(401);
    });
  });

  describe('PUT /api/meetings/:id/cancel', () => {
    let meeting;

    beforeEach(async () => {
      const startTime = new Date();
      startTime.setDate(startTime.getDate() + 1);
      startTime.setHours(10, 0, 0, 0);

      meeting = await Meeting.create({
        student: student._id,
        navigator: navigator._id,
        title: 'Test Meeting',
        startTime: startTime,
        endTime: new Date(startTime.getTime() + 30 * 60 * 1000),
        status: 'scheduled',
        createdBy: student._id
      });
    });

    it('should cancel a meeting', async () => {
      const res = await request(app)
        .put(`/api/meetings/${meeting._id}/cancel`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ reason: 'Cannot attend' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.meeting.status).toBe('cancelled');
      expect(res.body.meeting.cancellationReason).toBe('Cannot attend');
    });
  });
});

describe('GET /api/meetings/upcoming', () => {
  it('should get upcoming meetings', async () => {
    const startTime = new Date();
    startTime.setDate(startTime.getDate() + 1);

    await Meeting.create({
      student: student._id,
      navigator: navigator._id,
      title: 'Upcoming Meeting',
      startTime: startTime,
      endTime: new Date(startTime.getTime() + 30 * 60 * 1000),
      status: 'scheduled',
      createdBy: student._id
    });

    const res = await request(app)
      .get('/api/meetings/upcoming')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.meetings.length).toBe(1);
  });

  it('should not include past meetings', async () => {
    const pastTime = new Date();
    pastTime.setDate(pastTime.getDate() - 1);

    await Meeting.create({
      student: student._id,
      navigator: navigator._id,
      title: 'Past Meeting',
      startTime: pastTime,
      endTime: new Date(pastTime.getTime() + 30 * 60 * 1000),
      status: 'completed',
      createdBy: student._id
    });

    const res = await request(app)
      .get('/api/meetings/upcoming')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.meetings.length).toBe(0);
  });

  it('should not include cancelled meetings', async () => {
    const startTime = new Date();
    startTime.setDate(startTime.getDate() + 1);

    await Meeting.create({
      student: student._id,
      navigator: navigator._id,
      title: 'Cancelled Meeting',
      startTime: startTime,
      endTime: new Date(startTime.getTime() + 30 * 60 * 1000),
      status: 'cancelled',
      createdBy: student._id
    });

    const res = await request(app)
      .get('/api/meetings/upcoming')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.meetings.length).toBe(0);
  });
});

describe('GET /api/meetings/:id', () => {
  let meeting;

  beforeEach(async () => {
    const startTime = new Date();
    startTime.setDate(startTime.getDate() + 1);

    meeting = await Meeting.create({
      student: student._id,
      navigator: navigator._id,
      title: 'Test Meeting',
      startTime: startTime,
      endTime: new Date(startTime.getTime() + 30 * 60 * 1000),
      status: 'scheduled',
      createdBy: student._id
    });
  });

  it('should get meeting by ID for student', async () => {
    const res = await request(app)
      .get(`/api/meetings/${meeting._id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.meeting.title).toBe('Test Meeting');
  });

  it('should return 404 for non-existent meeting', async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`/api/meetings/${fakeId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(404);

    expect(res.body.success).toBe(false);
  });

  it('should deny access to unrelated user meeting', async () => {
    // Create another student
    const otherStudent = await User.create({
      email: 'other@test.com',
      firstName: 'Other',
      lastName: 'Student',
      role: 'student',
      isActive: true
    });

    const jwt = require('jsonwebtoken');
    const otherToken = jwt.sign(
      { userId: otherStudent._id },
      process.env.JWT_SECRET || 'default-jwt-secret',
      { expiresIn: '7d' }
    );

    const res = await request(app)
      .get(`/api/meetings/${meeting._id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);

    expect(res.body.success).toBe(false);
  });
});

describe('PUT /api/meetings/:id (reschedule)', () => {
  let meeting;

  beforeEach(async () => {
    const startTime = new Date();
    startTime.setDate(startTime.getDate() + 2);
    startTime.setHours(10, 0, 0, 0);

    meeting = await Meeting.create({
      student: student._id,
      navigator: navigator._id,
      title: 'Meeting to Reschedule',
      startTime: startTime,
      endTime: new Date(startTime.getTime() + 30 * 60 * 1000),
      status: 'scheduled',
      createdBy: student._id
    });
  });

  it('should reschedule meeting', async () => {
    const newStartTime = new Date();
    newStartTime.setDate(newStartTime.getDate() + 3);
    newStartTime.setHours(14, 0, 0, 0);
    const newEndTime = new Date(newStartTime.getTime() + 30 * 60 * 1000);

    const res = await request(app)
      .put(`/api/meetings/${meeting._id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        startTime: newStartTime.toISOString(),
        endTime: newEndTime.toISOString()
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('rescheduled');
    expect(res.body.meeting.rescheduledFrom).toBeDefined();
  });

  it('should update meeting title', async () => {
    const res = await request(app)
      .put(`/api/meetings/${meeting._id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        title: 'Updated Title'
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.meeting.title).toBe('Updated Title');
  });

  it('should update meeting description', async () => {
    const res = await request(app)
      .put(`/api/meetings/${meeting._id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        description: 'New description'
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.meeting.description).toBe('New description');
  });

  it('should update meeting location', async () => {
    const res = await request(app)
      .put(`/api/meetings/${meeting._id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        location: 'in_person'
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.meeting.location).toBe('in_person');
  });

  it('should reject rescheduling to conflicting time', async () => {
    // Create another meeting at the target time
    const conflictTime = new Date();
    conflictTime.setDate(conflictTime.getDate() + 3);
    conflictTime.setHours(14, 0, 0, 0);

    await Meeting.create({
      student: student._id,
      navigator: navigator._id,
      title: 'Conflicting Meeting',
      startTime: conflictTime,
      endTime: new Date(conflictTime.getTime() + 30 * 60 * 1000),
      status: 'scheduled',
      createdBy: student._id
    });

    const res = await request(app)
      .put(`/api/meetings/${meeting._id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        startTime: conflictTime.toISOString(),
        endTime: new Date(conflictTime.getTime() + 30 * 60 * 1000).toISOString()
      })
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('already has a meeting scheduled');
  });
});

describe('Meeting Status', () => {
  let meeting;

  beforeEach(async () => {
    const startTime = new Date();
    startTime.setDate(startTime.getDate() + 1);

    meeting = await Meeting.create({
      student: student._id,
      navigator: navigator._id,
      title: 'Status Test Meeting',
      startTime: startTime,
      endTime: new Date(startTime.getTime() + 30 * 60 * 1000),
      status: 'scheduled',
      createdBy: student._id
    });
  });

  it('should mark meeting as completed', async () => {
    // Create navigator token
    const jwt = require('jsonwebtoken');
    const navToken = jwt.sign(
      { userId: navigator._id },
      process.env.JWT_SECRET || 'default-jwt-secret',
      { expiresIn: '7d' }
    );

    const res = await request(app)
      .put(`/api/meetings/${meeting._id}/complete`)
      .set('Authorization', `Bearer ${navToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.meeting.status).toBe('completed');
  });

  it('should mark meeting as no-show', async () => {
    const jwt = require('jsonwebtoken');
    const navToken = jwt.sign(
      { userId: navigator._id },
      process.env.JWT_SECRET || 'default-jwt-secret',
      { expiresIn: '7d' }
    );

    const res = await request(app)
      .put(`/api/meetings/${meeting._id}/no-show`)
      .set('Authorization', `Bearer ${navToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.meeting.status).toBe('no_show');
  });
});

describe('Meeting Filters', () => {
  beforeEach(async () => {
    const now = new Date();
    
    // Create meetings with different statuses and dates
    await Meeting.create([
      {
        student: student._id,
        navigator: navigator._id,
        title: 'Scheduled Meeting',
        startTime: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() + 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
        status: 'scheduled',
        createdBy: student._id
      },
      {
        student: student._id,
        navigator: navigator._id,
        title: 'Completed Meeting',
        startTime: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() - 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
        status: 'completed',
        createdBy: student._id
      },
      {
        student: student._id,
        navigator: navigator._id,
        title: 'Cancelled Meeting',
        startTime: new Date(now.getTime() + 48 * 60 * 60 * 1000),
        endTime: new Date(now.getTime() + 48 * 60 * 60 * 1000 + 30 * 60 * 1000),
        status: 'cancelled',
        createdBy: student._id
      }
    ]);
  });

  it('should filter meetings by status', async () => {
    const res = await request(app)
      .get('/api/meetings?status=scheduled')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.meetings.every(m => m.status === 'scheduled')).toBe(true);
  });

  it('should filter meetings by multiple statuses', async () => {
    const res = await request(app)
      .get('/api/meetings?status=scheduled,completed')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.meetings.every(m => 
      m.status === 'scheduled' || m.status === 'completed'
    )).toBe(true);
  });

  it('should filter meetings by date range', async () => {
    const now = new Date();
    const startDate = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const endDate = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString();

    const res = await request(app)
      .get(`/api/meetings?startDate=${startDate}&endDate=${endDate}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    // Should include scheduled and completed, not cancelled (which is 48h out)
    expect(res.body.meetings.length).toBe(2);
  });

  it('should paginate meetings', async () => {
    const res = await request(app)
      .get('/api/meetings?page=1&limit=2')
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.meetings.length).toBeLessThanOrEqual(2);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBe(3);
  });
});

describe('DELETE /api/meetings/series/:id', () => {
  let parentMeeting;
  let childMeeting1;
  let childMeeting2;

  beforeEach(async () => {
    const startTime = new Date();
    startTime.setDate(startTime.getDate() + 1);
    startTime.setHours(10, 0, 0, 0);

    // Create parent recurring meeting
    parentMeeting = await Meeting.create({
      student: student._id,
      navigator: navigator._id,
      title: 'Recurring Meeting',
      startTime: startTime,
      endTime: new Date(startTime.getTime() + 30 * 60 * 1000),
      status: 'scheduled',
      isRecurring: true,
      type: 'recurring',
      recurrence: {
        frequency: 'weekly',
        dayOfWeek: startTime.getDay()
      },
      createdBy: student._id
    });

    // Create child recurring meetings
    const child1Time = new Date(startTime.getTime() + 7 * 24 * 60 * 60 * 1000);
    childMeeting1 = await Meeting.create({
      student: student._id,
      navigator: navigator._id,
      title: 'Recurring Meeting',
      startTime: child1Time,
      endTime: new Date(child1Time.getTime() + 30 * 60 * 1000),
      status: 'scheduled',
      isRecurring: true,
      type: 'recurring',
      recurrence: {
        frequency: 'weekly',
        dayOfWeek: child1Time.getDay(),
        parentMeetingId: parentMeeting._id
      },
      createdBy: student._id
    });

    const child2Time = new Date(startTime.getTime() + 14 * 24 * 60 * 60 * 1000);
    childMeeting2 = await Meeting.create({
      student: student._id,
      navigator: navigator._id,
      title: 'Recurring Meeting',
      startTime: child2Time,
      endTime: new Date(child2Time.getTime() + 30 * 60 * 1000),
      status: 'scheduled',
      isRecurring: true,
      type: 'recurring',
      recurrence: {
        frequency: 'weekly',
        dayOfWeek: child2Time.getDay(),
        parentMeetingId: parentMeeting._id
      },
      createdBy: student._id
    });
  });

  it('should delete all meetings in a recurring series as student', async () => {
    const res = await request(app)
      .delete(`/api/meetings/series/${parentMeeting._id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.deletedCount).toBe(3);

    // Verify all meetings are cancelled
    const meetings = await Meeting.find({
      $or: [
        { _id: parentMeeting._id },
        { 'recurrence.parentMeetingId': parentMeeting._id }
      ]
    });
    expect(meetings.every(m => m.status === 'cancelled')).toBe(true);
  });

  it('should delete series when using child meeting ID', async () => {
    const res = await request(app)
      .delete(`/api/meetings/series/${childMeeting1._id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.deletedCount).toBe(3);
  });

  it('should delete only future meetings when scope=future', async () => {
    // Mark parent meeting as in the past by changing start time
    const pastTime = new Date();
    pastTime.setDate(pastTime.getDate() - 7);
    await Meeting.findByIdAndUpdate(parentMeeting._id, {
      startTime: pastTime,
      endTime: new Date(pastTime.getTime() + 30 * 60 * 1000)
    });

    const res = await request(app)
      .delete(`/api/meetings/series/${childMeeting1._id}?scope=future`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.scope).toBe('future');
    // Only future meetings should be cancelled (child1 and child2)
    expect(res.body.deletedCount).toBe(2);

    // Verify parent meeting is still scheduled
    const parent = await Meeting.findById(parentMeeting._id);
    expect(parent.status).toBe('scheduled');
  });

  it('should allow navigator to delete series', async () => {
    const jwt = require('jsonwebtoken');
    const navToken = jwt.sign(
      { userId: navigator._id },
      process.env.JWT_SECRET || 'default-jwt-secret',
      { expiresIn: '7d' }
    );

    const res = await request(app)
      .delete(`/api/meetings/series/${parentMeeting._id}`)
      .set('Authorization', `Bearer ${navToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.deletedCount).toBe(3);
  });

  it('should reject non-recurring meeting', async () => {
    const startTime = new Date();
    startTime.setDate(startTime.getDate() + 1);

    const singleMeeting = await Meeting.create({
      student: student._id,
      navigator: navigator._id,
      title: 'Single Meeting',
      startTime: startTime,
      endTime: new Date(startTime.getTime() + 30 * 60 * 1000),
      status: 'scheduled',
      isRecurring: false,
      createdBy: student._id
    });

    const res = await request(app)
      .delete(`/api/meetings/series/${singleMeeting._id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('not part of a recurring series');
  });

  it('should deny access to unrelated user', async () => {
    const otherStudent = await User.create({
      email: 'other@test.com',
      firstName: 'Other',
      lastName: 'Student',
      role: 'student',
      isActive: true
    });

    const jwt = require('jsonwebtoken');
    const otherToken = jwt.sign(
      { userId: otherStudent._id },
      process.env.JWT_SECRET || 'default-jwt-secret',
      { expiresIn: '7d' }
    );

    const res = await request(app)
      .delete(`/api/meetings/series/${parentMeeting._id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);

    expect(res.body.success).toBe(false);
  });

  it('should include cancellation reason', async () => {
    const res = await request(app)
      .delete(`/api/meetings/series/${parentMeeting._id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ reason: 'Schedule changed' })
      .expect(200);

    expect(res.body.success).toBe(true);

    // Verify cancellation reason is saved
    const meeting = await Meeting.findById(parentMeeting._id);
    expect(meeting.cancellationReason).toBe('Schedule changed');
  });
});
