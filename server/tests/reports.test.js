const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../index');
const User = require('../models/User');
const Report = require('../models/Report');
const Meeting = require('../models/Meeting');
const Note = require('../models/Note');

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
  await Report.deleteMany({});
  await Meeting.deleteMany({});
  await Note.deleteMany({});

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

  // Create some meetings for reports
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  await Meeting.create([
    {
      student: student._id,
      navigator: navigator._id,
      title: 'Session 1',
      startTime: new Date(lastMonth.getTime() + 7 * 24 * 60 * 60 * 1000),
      endTime: new Date(lastMonth.getTime() + 7 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
      status: 'completed',
      duration: 30,
      createdBy: student._id
    },
    {
      student: student._id,
      navigator: navigator._id,
      title: 'Session 2',
      startTime: new Date(lastMonth.getTime() + 14 * 24 * 60 * 60 * 1000),
      endTime: new Date(lastMonth.getTime() + 14 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
      status: 'completed',
      duration: 30,
      createdBy: student._id
    },
    {
      student: student._id,
      navigator: navigator._id,
      title: 'Cancelled Session',
      startTime: new Date(lastMonth.getTime() + 21 * 24 * 60 * 60 * 1000),
      endTime: new Date(lastMonth.getTime() + 21 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
      status: 'cancelled',
      createdBy: student._id
    }
  ]);
});

describe('Reports Routes', () => {
  describe('GET /api/reports', () => {
    beforeEach(async () => {
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      const endDate = new Date();

      await Report.create([
        {
          generatedBy: navigator._id,
          type: 'individual_progress',
          title: 'Progress Report 1',
          scope: {
            student: student._id,
            startDate,
            endDate
          },
          data: {
            summary: {
              totalSessions: 3,
              completedSessions: 2,
              cancelledSessions: 1,
              noShowSessions: 0,
              totalDuration: 60
            }
          }
        },
        {
          generatedBy: navigator._id,
          type: 'session_history',
          title: 'Session History',
          scope: {
            student: student._id,
            startDate,
            endDate
          },
          data: {
            summary: {
              totalSessions: 5,
              completedSessions: 5,
              cancelledSessions: 0,
              noShowSessions: 0,
              totalDuration: 150
            }
          }
        }
      ]);
    });

    it('should get reports for navigator', async () => {
      const res = await request(app)
        .get('/api/reports')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.reports.length).toBe(2);
    });

    it('should filter reports by type', async () => {
      const res = await request(app)
        .get('/api/reports?type=individual_progress')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.reports.every(r => r.type === 'individual_progress')).toBe(true);
    });

    it('should paginate reports', async () => {
      const res = await request(app)
        .get('/api/reports?page=1&limit=1')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.reports.length).toBe(1);
      expect(res.body.pagination.total).toBe(2);
    });

    it('should reject student access', async () => {
      const res = await request(app)
        .get('/api/reports')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('should allow admin to see all reports', async () => {
      const res = await request(app)
        .get('/api/reports')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.reports.length).toBe(2);
    });
  });

  describe('GET /api/reports/:id', () => {
    let report;

    beforeEach(async () => {
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);

      report = await Report.create({
        generatedBy: navigator._id,
        type: 'individual_progress',
        title: 'Test Report',
        scope: {
          student: student._id,
          startDate,
          endDate: new Date()
        },
        data: {
          summary: {
            totalSessions: 3,
            completedSessions: 2,
            cancelledSessions: 1,
            noShowSessions: 0,
            totalDuration: 60
          }
        }
      });
    });

    it('should get report by ID for creator', async () => {
      const res = await request(app)
        .get(`/api/reports/${report._id}`)
        .set('Authorization', `Bearer ${navigatorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.report.title).toBe('Test Report');
    });

    it('should get report by ID for admin', async () => {
      const res = await request(app)
        .get(`/api/reports/${report._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should return 404 for non-existent report', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/reports/${fakeId}`)
        .set('Authorization', `Bearer ${navigatorToken}`)
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/reports/individual', () => {
    it('should generate individual progress report', async () => {
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 2);
      const endDate = new Date();

      const res = await request(app)
        .post('/api/reports/individual')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .send({
          studentId: student._id.toString(),
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          title: 'Custom Report Title'
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.report.type).toBe('individual_progress');
      expect(res.body.report.title).toBe('Custom Report Title');
      expect(res.body.report.data.summary).toBeDefined();
    });

    it('should generate report with default title', async () => {
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);

      const res = await request(app)
        .post('/api/reports/individual')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .send({
          studentId: student._id.toString(),
          startDate: startDate.toISOString(),
          endDate: new Date().toISOString()
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.report.title).toContain('Progress Report');
      expect(res.body.report.title).toContain('Test Student');
    });

    it('should reject without studentId', async () => {
      const res = await request(app)
        .post('/api/reports/individual')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .send({
          startDate: new Date().toISOString(),
          endDate: new Date().toISOString()
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject without date range', async () => {
      const res = await request(app)
        .post('/api/reports/individual')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .send({
          studentId: student._id.toString()
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject invalid studentId', async () => {
      const res = await request(app)
        .post('/api/reports/individual')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .send({
          studentId: 'invalid-id',
          startDate: new Date().toISOString(),
          endDate: new Date().toISOString()
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject student creating reports', async () => {
      const res = await request(app)
        .post('/api/reports/individual')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          studentId: student._id.toString(),
          startDate: new Date().toISOString(),
          endDate: new Date().toISOString()
        })
        .expect(403);

      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/reports/group', () => {
    let student2;

    beforeEach(async () => {
      student2 = await User.create({
        email: 'student2@test.com',
        firstName: 'Another',
        lastName: 'Student',
        role: 'student',
        isActive: true
      });

      // Create meetings for second student
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      await Meeting.create({
        student: student2._id,
        navigator: navigator._id,
        title: 'Student 2 Session',
        startTime: new Date(lastMonth.getTime() + 7 * 24 * 60 * 60 * 1000),
        endTime: new Date(lastMonth.getTime() + 7 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
        status: 'completed',
        duration: 30,
        createdBy: student2._id
      });
    });

    it('should generate group progress report', async () => {
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 2);

      const res = await request(app)
        .post('/api/reports/group')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .send({
          studentIds: [student._id.toString(), student2._id.toString()],
          startDate: startDate.toISOString(),
          endDate: new Date().toISOString(),
          title: 'Group Progress Report'
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.report.type).toBe('group_progress');
      expect(res.body.report.data.summary.totalSessions).toBeGreaterThan(0);
      
      // Verify sessions include student names for group reports
      if (res.body.report.data.sessions.length > 0) {
        const session = res.body.report.data.sessions[0];
        expect(session.studentName).toBeDefined();
        expect(session.studentId).toBeDefined();
      }
    });

    it('should reject without students', async () => {
      const res = await request(app)
        .post('/api/reports/group')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .send({
          studentIds: [],
          startDate: new Date().toISOString(),
          endDate: new Date().toISOString()
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject invalid student IDs in array', async () => {
      const res = await request(app)
        .post('/api/reports/group')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .send({
          studentIds: ['invalid-id'],
          startDate: new Date().toISOString(),
          endDate: new Date().toISOString()
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/reports/:id', () => {
    let report;

    beforeEach(async () => {
      report = await Report.create({
        generatedBy: navigator._id,
        type: 'individual_progress',
        title: 'Report to Delete',
        scope: {
          student: student._id,
          startDate: new Date(),
          endDate: new Date()
        },
        data: {
          summary: {
            totalSessions: 0,
            completedSessions: 0,
            cancelledSessions: 0,
            noShowSessions: 0,
            totalDuration: 0
          }
        }
      });
    });

    it('should delete report as creator', async () => {
      const res = await request(app)
        .delete(`/api/reports/${report._id}`)
        .set('Authorization', `Bearer ${navigatorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      const deleted = await Report.findById(report._id);
      expect(deleted).toBeNull();
    });

    it('should delete report as admin', async () => {
      const res = await request(app)
        .delete(`/api/reports/${report._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should reject deletion by student', async () => {
      const res = await request(app)
        .delete(`/api/reports/${report._id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);

      expect(res.body.success).toBe(false);
    });
  });

  describe('Report Model Methods', () => {
    it('should generate individual report statistics', async () => {
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 2);
      const endDate = new Date();

      const reportData = await Report.generateIndividualReport(
        navigator._id,
        student._id,
        startDate,
        endDate
      );

      expect(reportData.summary).toBeDefined();
      expect(reportData.summary.totalSessions).toBeDefined();
      expect(reportData.summary.completedSessions).toBeDefined();
      expect(reportData.summary.cancelledSessions).toBeDefined();
    });

    it('should share report with another user', async () => {
      const report = await Report.create({
        generatedBy: navigator._id,
        type: 'individual_progress',
        title: 'Shareable Report',
        scope: {
          student: student._id,
          startDate: new Date(),
          endDate: new Date()
        },
        data: { summary: {} }
      });

      await report.shareWith(admin._id, 'view');

      const updated = await Report.findById(report._id);
      expect(updated.sharedWith.length).toBe(1);
      expect(updated.status).toBe('shared');
    });

    it('should add export record', async () => {
      const report = await Report.create({
        generatedBy: navigator._id,
        type: 'individual_progress',
        title: 'Export Test',
        scope: {
          student: student._id,
          startDate: new Date(),
          endDate: new Date()
        },
        data: { summary: {} }
      });

      await report.addExport('pdf', 'https://example.com/report.pdf', 'report.pdf');

      const updated = await Report.findById(report._id);
      expect(updated.exports.length).toBe(1);
      expect(updated.exports[0].format).toBe('pdf');
    });
  });
});
