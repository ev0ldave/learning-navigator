const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../index');
const User = require('../models/User');
const Note = require('../models/Note');
const Meeting = require('../models/Meeting');

let mongoServer;
let studentToken;
let navigatorToken;
let adminToken;
let student;
let navigator;
let admin;
let meeting;

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
  await Note.deleteMany({});
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

  // Create a meeting for note association
  const startTime = new Date();
  startTime.setDate(startTime.getDate() + 1);
  startTime.setHours(10, 0, 0, 0);

  meeting = await Meeting.create({
    student: student._id,
    navigator: navigator._id,
    title: 'Test Session',
    startTime: startTime,
    endTime: new Date(startTime.getTime() + 30 * 60 * 1000),
    status: 'completed',
    createdBy: student._id
  });
});

describe('Notes Routes', () => {
  describe('POST /api/notes', () => {
    it('should create a private note as navigator', async () => {
      const res = await request(app)
        .post('/api/notes')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .send({
          studentId: student._id.toString(),
          title: 'Session Notes',
          privateContent: 'Private observations',
          sharedContent: '',
          type: 'private'
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.note.title).toBe('Session Notes');
      expect(res.body.note.type).toBe('private');
      expect(res.body.note.privateContent).toBe('Private observations');
    });

    it('should create a shared note as navigator', async () => {
      const res = await request(app)
        .post('/api/notes')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .send({
          studentId: student._id.toString(),
          title: 'Session Summary',
          sharedContent: 'Great progress today!',
          privateContent: 'Some private thoughts',
          type: 'shared'
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.note.type).toBe('shared');
      expect(res.body.note.sharedContent).toBe('Great progress today!');
    });

    it('should create a note linked to a meeting', async () => {
      const res = await request(app)
        .post('/api/notes')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .send({
          studentId: student._id.toString(),
          title: 'Meeting Notes',
          sharedContent: 'Discussed goals',
          meetingId: meeting._id.toString(),
          type: 'shared'
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.note.meeting.toString()).toBe(meeting._id.toString());
    });

    it('should reject note creation by student', async () => {
      const res = await request(app)
        .post('/api/notes')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          studentId: student._id.toString(),
          title: 'Student Note',
          sharedContent: 'My note'
        })
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('should reject note without title', async () => {
      const res = await request(app)
        .post('/api/notes')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .send({
          studentId: student._id.toString(),
          sharedContent: 'Content without title'
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject note without studentId', async () => {
      const res = await request(app)
        .post('/api/notes')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .send({
          title: 'Note without student'
        })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/notes', () => {
    beforeEach(async () => {
      // Create test notes
      await Note.create({
        student: student._id,
        navigator: navigator._id,
        title: 'Shared Note',
        sharedContent: 'Visible to student',
        type: 'shared',
        createdBy: navigator._id
      });

      await Note.create({
        student: student._id,
        navigator: navigator._id,
        title: 'Private Note',
        privateContent: 'Not visible to student',
        type: 'private',
        createdBy: navigator._id
      });
    });

    it('should get only shared notes for student', async () => {
      const res = await request(app)
        .get('/api/notes')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.notes.length).toBe(1);
      expect(res.body.notes[0].type).toBe('shared');
      expect(res.body.notes[0].privateContent).toBeUndefined();
    });

    it('should get all notes for navigator', async () => {
      const res = await request(app)
        .get('/api/notes')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.notes.length).toBe(2);
    });

    it('should filter notes by type', async () => {
      const res = await request(app)
        .get('/api/notes?type=private')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.notes.every(n => n.type === 'private')).toBe(true);
    });

    it('should paginate notes', async () => {
      const res = await request(app)
        .get('/api/notes?page=1&limit=1')
        .set('Authorization', `Bearer ${navigatorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.notes.length).toBe(1);
      expect(res.body.pagination.total).toBe(2);
      expect(res.body.pagination.pages).toBe(2);
    });
  });

  describe('GET /api/notes/:id', () => {
    let sharedNote;
    let privateNote;

    beforeEach(async () => {
      sharedNote = await Note.create({
        student: student._id,
        navigator: navigator._id,
        title: 'Shared Note',
        sharedContent: 'Visible content',
        type: 'shared',
        createdBy: navigator._id
      });

      privateNote = await Note.create({
        student: student._id,
        navigator: navigator._id,
        title: 'Private Note',
        privateContent: 'Hidden content',
        type: 'private',
        createdBy: navigator._id
      });
    });

    it('should get shared note for student', async () => {
      const res = await request(app)
        .get(`/api/notes/${sharedNote._id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.note.title).toBe('Shared Note');
    });

    it('should deny private note access to student', async () => {
      const res = await request(app)
        .get(`/api/notes/${privateNote._id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('should get any note for navigator who created it', async () => {
      const res = await request(app)
        .get(`/api/notes/${privateNote._id}`)
        .set('Authorization', `Bearer ${navigatorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.note.privateContent).toBe('Hidden content');
    });

    it('should return 404 for non-existent note', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/notes/${fakeId}`)
        .set('Authorization', `Bearer ${navigatorToken}`)
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/notes/student/:studentId', () => {
    beforeEach(async () => {
      await Note.create([
        {
          student: student._id,
          navigator: navigator._id,
          title: 'Note 1',
          sharedContent: 'Content 1',
          type: 'shared',
          createdBy: navigator._id
        },
        {
          student: student._id,
          navigator: navigator._id,
          title: 'Note 2',
          privateContent: 'Private content',
          type: 'private',
          createdBy: navigator._id
        }
      ]);
    });

    it('should get notes for student by studentId', async () => {
      const res = await request(app)
        .get(`/api/notes/student/${student._id}`)
        .set('Authorization', `Bearer ${navigatorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.notes.length).toBe(2);
    });

    it('should deny student access to other student notes', async () => {
      // Create another student
      const otherStudent = await User.create({
        email: 'other@test.com',
        firstName: 'Other',
        lastName: 'Student',
        role: 'student',
        isActive: true
      });

      const res = await request(app)
        .get(`/api/notes/student/${otherStudent._id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);

      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/notes/meeting/:meetingId', () => {
    beforeEach(async () => {
      await Note.create({
        student: student._id,
        navigator: navigator._id,
        meeting: meeting._id,
        title: 'Meeting Note',
        sharedContent: 'Session summary',
        type: 'shared',
        createdBy: navigator._id
      });
    });

    it('should get notes for a meeting', async () => {
      const res = await request(app)
        .get(`/api/notes/meeting/${meeting._id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.notes.length).toBe(1);
      expect(res.body.notes[0].title).toBe('Meeting Note');
    });

    it('should return 404 for non-existent meeting', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/notes/meeting/${fakeId}`)
        .set('Authorization', `Bearer ${navigatorToken}`)
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/notes/:id', () => {
    let note;

    beforeEach(async () => {
      note = await Note.create({
        student: student._id,
        navigator: navigator._id,
        title: 'Original Title',
        sharedContent: 'Original content',
        type: 'shared',
        createdBy: navigator._id
      });
    });

    it('should update note as navigator', async () => {
      const res = await request(app)
        .put(`/api/notes/${note._id}`)
        .set('Authorization', `Bearer ${navigatorToken}`)
        .send({
          title: 'Updated Title',
          sharedContent: 'Updated content'
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.note.title).toBe('Updated Title');
      expect(res.body.note.sharedContent).toBe('Updated content');
    });

    it('should reject update by student', async () => {
      const res = await request(app)
        .put(`/api/notes/${note._id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'Student Update'
        })
        .expect(403);

      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/notes/:id', () => {
    let note;

    beforeEach(async () => {
      note = await Note.create({
        student: student._id,
        navigator: navigator._id,
        title: 'Note to Delete',
        sharedContent: 'Content',
        type: 'shared',
        createdBy: navigator._id
      });
    });

    it('should delete note as navigator who created it', async () => {
      const res = await request(app)
        .delete(`/api/notes/${note._id}`)
        .set('Authorization', `Bearer ${navigatorToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      const deletedNote = await Note.findById(note._id);
      expect(deletedNote).toBeNull();
    });

    it('should delete note as admin', async () => {
      const res = await request(app)
        .delete(`/api/notes/${note._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should reject deletion by student', async () => {
      const res = await request(app)
        .delete(`/api/notes/${note._id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(403);

      expect(res.body.success).toBe(false);
    });
  });
});
