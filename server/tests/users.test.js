const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../index');
const User = require('../models/User');

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
    process.env.JWT_SECRET || 'default-jwt-secret',
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

describe('Users Routes', () => {
  describe('GET /api/users', () => {
    beforeEach(async () => {
      // Create additional users for testing
      await User.create([
        {
          email: 'student2@test.com',
          firstName: 'Second',
          lastName: 'Student',
          role: 'student',
          isActive: true
        },
        {
          email: 'student3@test.com',
          firstName: 'Third',
          lastName: 'Student',
          role: 'student',
          isActive: true
        }
      ]);
    });

    it('should get all users as admin', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.users.length).toBeGreaterThanOrEqual(4); // admin, navigator, 3 students
    });

    it('should filter users by role', async () => {
      const res = await request(app)
        .get('/api/users?role=student')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.users.every(u => u.role === 'student')).toBe(true);
    });

    it('should search users by name', async () => {
      const res = await request(app)
        .get('/api/users?search=Second')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.users.some(u => u.firstName === 'Second')).toBe(true);
    });

    it('should paginate users', async () => {
      const res = await request(app)
        .get('/api/users?page=1&limit=2')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.users.length).toBeLessThanOrEqual(2);
      expect(res.body.pagination).toBeDefined();
    });

    it('should reject non-admin access', async () => {
      await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);
    });

    it('should reject navigator access', async () => {
      await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .expect(403);
    });
  });

  describe('GET /api/users/navigators', () => {
    beforeEach(async () => {
      await User.create({
        email: 'navigator2@test.com',
        firstName: 'Another',
        lastName: 'Navigator',
        role: 'learning_navigator',
        isActive: true
      });
    });

    it('should get all navigators as student', async () => {
      const res = await request(app)
        .get('/api/users/navigators')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      // API returns navigator and admin users
      // Note: role is not returned by this endpoint, verify by count instead
      expect(res.body.navigators.length).toBeGreaterThanOrEqual(2);
      // Check that expected fields are present
      expect(res.body.navigators[0]).toHaveProperty('firstName');
      expect(res.body.navigators[0]).toHaveProperty('email');
    });

    it('should only return active navigators', async () => {
      // Create inactive navigator
      await User.create({
        email: 'inactive@test.com',
        firstName: 'Inactive',
        lastName: 'Navigator',
        role: 'learning_navigator',
        isActive: false
      });

      const res = await request(app)
        .get('/api/users/navigators')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.navigators.every(n => n.isActive !== false)).toBe(true);
    });
  });

  describe('GET /api/users/students', () => {
    beforeEach(async () => {
      // Assign student to navigator using findByIdAndUpdate
      await User.findByIdAndUpdate(student._id, { assignedNavigator: navigator._id });

      await User.create({
        email: 'unassigned@test.com',
        firstName: 'Unassigned',
        lastName: 'Student',
        role: 'student',
        isActive: true
      });
    });

    it('should get all students as navigator', async () => {
      const res = await request(app)
        .get('/api/users/students')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.students.every(s => s.role === 'student')).toBe(true);
    });

    it('should filter students assigned to me', async () => {
      const res = await request(app)
        .get('/api/users/students?assigned=me')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      // assignedNavigator is populated as an object with _id
      expect(res.body.students.every(s => 
        s.assignedNavigator?._id?.toString() === navigator._id.toString() ||
        s.assignedNavigator?.toString() === navigator._id.toString()
      )).toBe(true);
    });

    it('should filter unassigned students', async () => {
      const res = await request(app)
        .get('/api/users/students?assigned=unassigned')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.students.every(s => !s.assignedNavigator)).toBe(true);
    });

    it('should reject student access', async () => {
      await request(app)
        .get('/api/users/students')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);
    });
  });

  describe('GET /api/users/my-students', () => {
    it('should get students for navigator', async () => {
      const res = await request(app)
        .get('/api/users/my-students')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.students)).toBe(true);
    });

    it('should reject student access', async () => {
      await request(app)
        .get('/api/users/my-students')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);
    });
  });

  describe('GET /api/users/:id', () => {
    it('should get own profile', async () => {
      const res = await request(app)
        .get(`/api/users/${student._id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.user.email).toBe('1411andrew@gmail.com');
    });

    it('should get any user as admin', async () => {
      const res = await request(app)
        .get(`/api/users/${student._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should get assigned student as navigator', async () => {
      // Create a new student and assign to navigator
      const assignedStudent = await User.create({
        email: 'assigned-student@test.com',
        firstName: 'Assigned',
        lastName: 'Student',
        role: 'student',
        isActive: true,
        assignedNavigator: navigator._id
      });

      const res = await request(app)
        .get(`/api/users/${assignedStudent._id}`)
        .set('Authorization', `Bearer ${navigatorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should deny access to unassigned student for navigator', async () => {
      const res = await request(app)
        .get(`/api/users/${student._id}`)
        .set('Authorization', `Bearer ${navigatorToken}`)
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('should return 404 for non-existent user', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/users/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/users/:id', () => {
    it('should update own profile', async () => {
      const res = await request(app)
        .put(`/api/users/${student._id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          firstName: 'Updated',
          lastName: 'Name',
          phone: '555-1234',
          bio: 'This is my bio'
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.user.firstName).toBe('Updated');
      expect(res.body.user.lastName).toBe('Name');
      expect(res.body.user.phone).toBe('555-1234');
      expect(res.body.user.bio).toBe('This is my bio');
    });

    it('should update any profile as admin', async () => {
      const res = await request(app)
        .put(`/api/users/${student._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          firstName: 'Admin',
          lastName: 'Updated'
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.user.firstName).toBe('Admin');
    });

    it('should update notification preferences', async () => {
      const res = await request(app)
        .put(`/api/users/${student._id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          notificationPreferences: {
            email: true,
            inApp: true,
            meetingReminders: true,
            meetingChanges: false
          }
        })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should reject updating other user profile', async () => {
      const res = await request(app)
        .put(`/api/users/${navigator._id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          firstName: 'Hacker'
        })
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('should reject bio longer than 500 characters', async () => {
      const longBio = 'a'.repeat(501);
      const res = await request(app)
        .put(`/api/users/${student._id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          bio: longBio
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/users/:id/role', () => {
    it('should update user role as admin', async () => {
      const res = await request(app)
        .put(`/api/users/${student._id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          role: 'learning_navigator'
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.user.role).toBe('learning_navigator');
    });

    it('should reject invalid role', async () => {
      const res = await request(app)
        .put(`/api/users/${student._id}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          role: 'invalid_role'
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject role update by non-admin', async () => {
      await request(app)
        .put(`/api/users/${student._id}/role`)
        .set('Authorization', `Bearer ${navigatorToken}`)
        .send({
          role: 'administrator'
        })
        .expect(403);
    });

    it('should reject role update by student', async () => {
      await request(app)
        .put(`/api/users/${student._id}/role`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          role: 'administrator'
        })
        .expect(403);
    });
  });

  describe('PUT /api/users/:id/assign-navigator', () => {
    it('should assign navigator to student as admin', async () => {
      const res = await request(app)
        .put(`/api/users/${student._id}/assign-navigator`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          navigatorId: navigator._id.toString()
        })
        .expect(200);

      expect(res.body.success).toBe(true);

      const updatedStudent = await User.findById(student._id);
      expect(updatedStudent.assignedNavigator.toString()).toBe(navigator._id.toString());
    });

    it('should reject invalid navigatorId', async () => {
      const res = await request(app)
        .put(`/api/users/${student._id}/assign-navigator`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          navigatorId: 'invalid-id'
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject assignment by non-admin', async () => {
      await request(app)
        .put(`/api/users/${student._id}/assign-navigator`)
        .set('Authorization', `Bearer ${navigatorToken}`)
        .send({
          navigatorId: navigator._id.toString()
        })
        .expect(403);
    });
  });

  describe('PUT /api/users/:id/status', () => {
    it('should deactivate user as admin', async () => {
      const res = await request(app)
        .put(`/api/users/${student._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          isActive: false
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.user.isActive).toBe(false);
    });

    it('should activate user as admin', async () => {
      // First deactivate
      await User.findByIdAndUpdate(student._id, { isActive: false });

      const res = await request(app)
        .put(`/api/users/${student._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          isActive: true
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.user.isActive).toBe(true);
    });

    it('should reject self-deactivation', async () => {
      const res = await request(app)
        .put(`/api/users/${admin._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          isActive: false
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject status change by non-admin', async () => {
      await request(app)
        .put(`/api/users/${student._id}/status`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          isActive: false
        })
        .expect(403);
    });
  });

  describe('POST /api/users/register', () => {
    it('should register a new student as admin', async () => {
      const res = await request(app)
        .post('/api/users/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'newstudent@test.com',
          firstName: 'New',
          lastName: 'Student'
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.user.email).toBe('newstudent@test.com');
      expect(res.body.user.role).toBe('student');
      expect(res.body.user.googleId).toBeUndefined();

      // Verify user was created in database
      const createdUser = await User.findOne({ email: 'newstudent@test.com' });
      expect(createdUser).toBeTruthy();
      expect(createdUser.firstName).toBe('New');
      expect(createdUser.lastName).toBe('Student');
    });

    it('should register a new student as navigator', async () => {
      const res = await request(app)
        .post('/api/users/register')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .send({
          email: 'navstudent@test.com',
          firstName: 'Navigator',
          lastName: 'Student'
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.user.role).toBe('student');
    });

    it('should register student with assigned navigator', async () => {
      const res = await request(app)
        .post('/api/users/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'assigned@test.com',
          firstName: 'Assigned',
          lastName: 'Student',
          assignedNavigator: navigator._id.toString()
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.user.assignedNavigator).toBeTruthy();
      expect(res.body.user.assignedNavigator._id.toString()).toBe(navigator._id.toString());

      // Verify student was added to navigator's students list
      const updatedNavigator = await User.findById(navigator._id);
      expect(updatedNavigator.students.map(s => s.toString())).toContain(res.body.user._id.toString());
    });

    it('should allow admin to create learning_navigator role', async () => {
      const res = await request(app)
        .post('/api/users/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'newnavigator@test.com',
          firstName: 'New',
          lastName: 'Navigator',
          role: 'learning_navigator'
        })
        .expect(201);

      expect(res.body.user.role).toBe('learning_navigator');
    });

    it('should reject navigator creating non-student role', async () => {
      const res = await request(app)
        .post('/api/users/register')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .send({
          email: 'failnavigator@test.com',
          firstName: 'Fail',
          lastName: 'Navigator',
          role: 'learning_navigator'
        })
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('should reject registration by student', async () => {
      await request(app)
        .post('/api/users/register')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          email: 'shouldfail@test.com',
          firstName: 'Should',
          lastName: 'Fail'
        })
        .expect(403);
    });

    it('should reject duplicate email', async () => {
      const res = await request(app)
        .post('/api/users/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: student.email,
          firstName: 'Duplicate',
          lastName: 'Email'
        })
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('already exists');
    });

    it('should reject invalid email format', async () => {
      const res = await request(app)
        .post('/api/users/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'notanemail',
          firstName: 'Invalid',
          lastName: 'Email'
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject missing required fields', async () => {
      const res = await request(app)
        .post('/api/users/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'missing@test.com'
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/users/:id', () => {
    it('should soft delete (deactivate) user as admin', async () => {
      const userToDelete = await User.create({
        email: 'todelete@test.com',
        firstName: 'Delete',
        lastName: 'Me',
        role: 'student',
        isActive: true
      });

      const res = await request(app)
        .delete(`/api/users/${userToDelete._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      // Soft delete sets isActive to false
      const deactivated = await User.findById(userToDelete._id);
      expect(deactivated.isActive).toBe(false);
    });

    it('should reject deletion by non-admin', async () => {
      await request(app)
        .delete(`/api/users/${student._id}`)
        .set('Authorization', `Bearer ${navigatorToken}`)
        .expect(403);
    });
  });
});
