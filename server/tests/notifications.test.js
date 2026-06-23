const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../index');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Meeting = require('../models/Meeting');

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
  await Notification.deleteMany({});
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
});

describe('Notification Routes', () => {
  describe('GET /api/notifications', () => {
    beforeEach(async () => {
      // Create test notifications
      await Notification.create([
        {
          recipient: student._id,
          sender: navigator._id,
          type: 'meeting_scheduled',
          title: 'Meeting Scheduled',
          message: 'A new meeting has been scheduled',
          channels: {
            inApp: { enabled: true, read: false }
          }
        },
        {
          recipient: student._id,
          sender: navigator._id,
          type: 'note_shared',
          title: 'Note Shared',
          message: 'A note has been shared with you',
          channels: {
            inApp: { enabled: true, read: true, readAt: new Date() }
          }
        }
      ]);

      // Create notification for another user (should not be returned)
      await Notification.create({
        recipient: navigator._id,
        sender: student._id,
        type: 'meeting_scheduled',
        title: 'Other User Notification',
        message: 'This should not appear',
        channels: {
          inApp: { enabled: true, read: false }
        }
      });
    });

    it('should get notifications for current user', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.notifications.length).toBe(2);
      expect(res.body.unreadCount).toBe(1);
    });

    it('should filter unread notifications', async () => {
      const res = await request(app)
        .get('/api/notifications?unreadOnly=true')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.notifications.length).toBe(1);
      expect(res.body.notifications[0].title).toBe('Meeting Scheduled');
    });

    it('should paginate notifications', async () => {
      const res = await request(app)
        .get('/api/notifications?page=1&limit=1')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.notifications.length).toBe(1);
      expect(res.body.pagination.total).toBe(2);
      expect(res.body.pagination.pages).toBe(2);
    });

    it('should reject without authentication', async () => {
      await request(app)
        .get('/api/notifications')
        .expect(401);
    });
  });

  describe('GET /api/notifications/unread-count', () => {
    beforeEach(async () => {
      await Notification.create([
        {
          recipient: student._id,
          type: 'meeting_scheduled',
          title: 'Unread 1',
          message: 'Message 1',
          channels: { inApp: { enabled: true, read: false } }
        },
        {
          recipient: student._id,
          type: 'meeting_scheduled',
          title: 'Unread 2',
          message: 'Message 2',
          channels: { inApp: { enabled: true, read: false } }
        },
        {
          recipient: student._id,
          type: 'note_shared',
          title: 'Read',
          message: 'Already read',
          channels: { inApp: { enabled: true, read: true } }
        }
      ]);
    });

    it('should return correct unread count', async () => {
      const res = await request(app)
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(2);
    });
  });

  describe('PUT /api/notifications/:id/read', () => {
    let notification;

    beforeEach(async () => {
      notification = await Notification.create({
        recipient: student._id,
        type: 'meeting_scheduled',
        title: 'Unread Notification',
        message: 'This is unread',
        channels: { inApp: { enabled: true, read: false } }
      });
    });

    it('should mark notification as read', async () => {
      const res = await request(app)
        .put(`/api/notifications/${notification._id}/read`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.notification.channels.inApp.read).toBe(true);
      expect(res.body.notification.channels.inApp.readAt).toBeDefined();
    });

    it('should not mark another user notification as read', async () => {
      const res = await request(app)
        .put(`/api/notifications/${notification._id}/read`)
        .set('Authorization', `Bearer ${navigatorToken}`)
        .expect(404);

      expect(res.body.success).toBe(false);
    });

    it('should return 404 for non-existent notification', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .put(`/api/notifications/${fakeId}/read`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/notifications/read-all', () => {
    beforeEach(async () => {
      await Notification.create([
        {
          recipient: student._id,
          type: 'meeting_scheduled',
          title: 'Notification 1',
          message: 'Message 1',
          channels: { inApp: { enabled: true, read: false } }
        },
        {
          recipient: student._id,
          type: 'meeting_scheduled',
          title: 'Notification 2',
          message: 'Message 2',
          channels: { inApp: { enabled: true, read: false } }
        },
        {
          recipient: student._id,
          type: 'note_shared',
          title: 'Already Read',
          message: 'Already read message',
          channels: { inApp: { enabled: true, read: true } }
        }
      ]);
    });

    it('should mark all notifications as read', async () => {
      const res = await request(app)
        .put('/api/notifications/read-all')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      // Verify all are marked as read
      const unreadCount = await Notification.countDocuments({
        recipient: student._id,
        'channels.inApp.read': false
      });
      expect(unreadCount).toBe(0);
    });
  });

  describe('DELETE /api/notifications/:id', () => {
    let notification;

    beforeEach(async () => {
      notification = await Notification.create({
        recipient: student._id,
        type: 'meeting_scheduled',
        title: 'To Delete',
        message: 'Will be deleted',
        channels: { inApp: { enabled: true, read: false } }
      });
    });

    it('should delete own notification', async () => {
      const res = await request(app)
        .delete(`/api/notifications/${notification._id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      const deleted = await Notification.findById(notification._id);
      expect(deleted).toBeNull();
    });

    it('should not delete another user notification', async () => {
      const res = await request(app)
        .delete(`/api/notifications/${notification._id}`)
        .set('Authorization', `Bearer ${navigatorToken}`)
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/notifications', () => {
    beforeEach(async () => {
      await Notification.create([
        {
          recipient: student._id,
          type: 'meeting_scheduled',
          title: 'Notification 1',
          message: 'Message 1',
          channels: { inApp: { enabled: true, read: false } }
        },
        {
          recipient: student._id,
          type: 'meeting_scheduled',
          title: 'Notification 2',
          message: 'Message 2',
          channels: { inApp: { enabled: true, read: true } }
        },
        {
          recipient: navigator._id,
          type: 'meeting_scheduled',
          title: 'Navigator Notification',
          message: 'Should not be deleted',
          channels: { inApp: { enabled: true, read: false } }
        }
      ]);
    });

    it('should delete all notifications for current user', async () => {
      const res = await request(app)
        .delete('/api/notifications')
        .set('Authorization', `Bearer ${studentToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      // Verify student notifications are deleted
      const studentNotifications = await Notification.countDocuments({
        recipient: student._id
      });
      expect(studentNotifications).toBe(0);

      // Verify navigator notifications remain
      const navigatorNotifications = await Notification.countDocuments({
        recipient: navigator._id
      });
      expect(navigatorNotifications).toBe(1);
    });
  });

  describe('Notification Types', () => {
    it('should create meeting_scheduled notification', async () => {
      const notification = await Notification.create({
        recipient: student._id,
        sender: navigator._id,
        type: 'meeting_scheduled',
        title: 'Meeting Scheduled',
        message: 'Your meeting has been scheduled for tomorrow',
        channels: { inApp: { enabled: true } }
      });

      expect(notification.type).toBe('meeting_scheduled');
    });

    it('should create meeting_cancelled notification', async () => {
      const notification = await Notification.create({
        recipient: student._id,
        sender: navigator._id,
        type: 'meeting_cancelled',
        title: 'Meeting Cancelled',
        message: 'Your meeting has been cancelled',
        channels: { inApp: { enabled: true } }
      });

      expect(notification.type).toBe('meeting_cancelled');
    });

    it('should create meeting_rescheduled notification', async () => {
      const notification = await Notification.create({
        recipient: student._id,
        sender: navigator._id,
        type: 'meeting_rescheduled',
        title: 'Meeting Rescheduled',
        message: 'Your meeting has been moved to a new time',
        channels: { inApp: { enabled: true } }
      });

      expect(notification.type).toBe('meeting_rescheduled');
    });

    it('should create note_shared notification', async () => {
      const notification = await Notification.create({
        recipient: student._id,
        sender: navigator._id,
        type: 'note_shared',
        title: 'Note Shared',
        message: 'A session note has been shared with you',
        channels: { inApp: { enabled: true } }
      });

      expect(notification.type).toBe('note_shared');
    });

    it('should create navigator_assigned notification', async () => {
      const notification = await Notification.create({
        recipient: student._id,
        sender: navigator._id,
        type: 'navigator_assigned',
        title: 'Navigator Assigned',
        message: 'You have been assigned a learning navigator',
        channels: { inApp: { enabled: true } }
      });

      expect(notification.type).toBe('navigator_assigned');
    });
  });
});
