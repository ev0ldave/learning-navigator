// Must be set before the app (and passport config) is loaded.
process.env.ADMIN_READER_EMAILS = ' reader1@example.edu , Reader2@Gmail.com ';
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'test-client-secret';

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../index');
const User = require('../models/User');
const { determineRole, isEmailAllowed, isAdminReaderEmail } = require('../config/passport');

const JWT_SECRET = process.env.JWT_SECRET || 'default-jwt-secret';
const tokenFor = (user) =>
  jwt.sign({ userId: user._id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '1h' });

const createUser = (overrides) =>
  User.create({ firstName: 'Test', lastName: 'User', isActive: true, ...overrides });

let mongoServer;
let reader;
let readerToken;
let student;
let studentToken;
let navigator;
let admin;
let adminToken;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await User.deleteMany({});

  reader = await createUser({ email: 'reader1@example.edu', firstName: 'Rita', lastName: 'Reader', role: 'admin_reader' });
  navigator = await createUser({ email: 'nav@students.example.edu', firstName: 'Nora', lastName: 'Navigator', role: 'learning_navigator' });
  student = await createUser({ email: 'stu@students.example.edu', firstName: 'Sam', lastName: 'Student', role: 'student', phone: '2065550100', assignedNavigator: navigator._id });
  admin = await createUser({ email: 'admin@students.example.edu', firstName: 'Ada', lastName: 'Admin', role: 'administrator' });

  readerToken = tokenFor(reader);
  studentToken = tokenFor(student);
  adminToken = tokenFor(admin);
});

describe('admin_reader role assignment (passport config)', () => {
  it('assigns admin_reader to allow-listed emails, ignoring case and whitespace', () => {
    expect(determineRole('reader1@example.edu')).toBe('admin_reader');
    expect(determineRole('READER2@gmail.com')).toBe('admin_reader');
    expect(isAdminReaderEmail('reader2@gmail.com')).toBe(true);
  });

  it('does not assign admin_reader to unlisted emails', () => {
    expect(determineRole('someone@students.example.edu')).toBe('student');
    expect(isAdminReaderEmail('someone@example.edu')).toBe(false);
    expect(isAdminReaderEmail(null)).toBe(false);
  });

  it('allows allow-listed emails outside the allowed domain', () => {
    expect(isEmailAllowed('reader1@example.edu')).toBe(true);
    expect(isEmailAllowed('reader2@gmail.com')).toBe(true);
  });

  it('still rejects unlisted emails outside the allowed domain', () => {
    expect(isEmailAllowed('other@example.edu')).toBe(false);
    expect(isEmailAllowed('other@gmail.com')).toBe(false);
  });
});

describe('Google login role sync', () => {
  const runGoogleVerify = (email) => {
    const verify = passport._strategy('google')._verify;
    const profile = {
      id: `google-${email}`,
      emails: [{ value: email }],
      name: { givenName: 'Google', familyName: 'User' },
      photos: []
    };
    return new Promise((resolve, reject) => {
      verify({}, 'access-token', 'refresh-token', { expires_in: 3600 }, profile, (err, user, info) =>
        err ? reject(err) : resolve({ user, info })
      );
    });
  };

  it('creates new allow-listed users as admin_reader', async () => {
    const { user } = await runGoogleVerify('reader2@gmail.com');
    expect(user.role).toBe('admin_reader');
  });

  it('promotes an existing user whose email is allow-listed', async () => {
    await createUser({ email: 'reader2@gmail.com', role: 'student' });

    const { user } = await runGoogleVerify('reader2@gmail.com');

    expect(user.role).toBe('admin_reader');
    expect((await User.findById(user._id)).role).toBe('admin_reader');
  });

  it('demotes an admin_reader who is no longer allow-listed', async () => {
    await createUser({ email: 'former@students.example.edu', role: 'admin_reader' });

    const { user } = await runGoogleVerify('former@students.example.edu');

    expect(user.role).toBe('student');
  });

  it('leaves other existing users unchanged', async () => {
    const { user } = await runGoogleVerify('nav@students.example.edu');
    expect(user.role).toBe('learning_navigator');
  });
});

describe('admin_reader read-only enforcement', () => {
  it('allows GET requests', async () => {
    const res = await request(app)
      .get('/api/meetings')
      .set('Authorization', `Bearer ${readerToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
  });

  it.each([
    ['post', '/api/meetings'],
    ['put', () => `/api/users/${student._id}`],
    ['delete', () => `/api/users/${student._id}`],
    ['post', '/api/notes'],
    ['put', '/api/availability']
  ])('blocks %s %s', async (method, pathOrFn) => {
    const path = typeof pathOrFn === 'function' ? pathOrFn() : pathOrFn;

    const res = await request(app)[method](path)
      .set('Authorization', `Bearer ${readerToken}`)
      .send({ firstName: 'Changed' })
      .expect(403);

    expect(res.body.message).toMatch(/read-only/i);
  });

  it('does not modify data when a write is blocked', async () => {
    await request(app)
      .put(`/api/users/${student._id}`)
      .set('Authorization', `Bearer ${readerToken}`)
      .send({ firstName: 'Changed' })
      .expect(403);

    expect((await User.findById(student._id)).firstName).toBe('Sam');
  });

  it('blocks writes while impersonating', async () => {
    const res = await request(app)
      .put(`/api/users/${student._id}`)
      .set('Authorization', `Bearer ${readerToken}`)
      .set('X-Impersonate-User-Id', student._id.toString())
      .send({ firstName: 'Changed' })
      .expect(403);

    expect(res.body.message).toMatch(/read-only/i);
  });

  it('still allows logging out', async () => {
    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${readerToken}`)
      .expect(200);
  });

  it('does not affect writes by other roles', async () => {
    await request(app)
      .put(`/api/users/${student._id}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ firstName: 'Samuel' })
      .expect(200);
  });
});

describe('admin_reader impersonation', () => {
  it('allows the impersonation header in CORS preflight requests', async () => {
    const res = await request(app)
      .options('/api/auth/me')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization,x-impersonate-user-id');

    expect(res.headers['access-control-allow-headers']).toMatch(/x-impersonate-user-id/i);
  });

  it('returns the reader as themselves when not impersonating', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${readerToken}`)
      .expect(200);

    expect(res.body.user._id).toBe(reader._id.toString());
    expect(res.body.isImpersonating).toBe(false);
    expect(res.body.realUser).toBeNull();
  });

  it('returns the target user and the real account when impersonating', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${readerToken}`)
      .set('X-Impersonate-User-Id', student._id.toString())
      .expect(200);

    expect(res.body.isImpersonating).toBe(true);
    expect(res.body.user._id).toBe(student._id.toString());
    expect(res.body.user.role).toBe('student');
    expect(res.body.realUser).toMatchObject({ _id: reader._id.toString(), role: 'admin_reader' });
  });

  it('applies the impersonated role to route permissions', async () => {
    await request(app)
      .get('/api/users/students')
      .set('Authorization', `Bearer ${readerToken}`)
      .set('X-Impersonate-User-Id', student._id.toString())
      .expect(403);

    await request(app)
      .get('/api/users/students')
      .set('Authorization', `Bearer ${readerToken}`)
      .set('X-Impersonate-User-Id', navigator._id.toString())
      .expect(200);
  });

  it('scopes data to the impersonated user', async () => {
    const res = await request(app)
      .get('/api/users/students?assigned=me')
      .set('Authorization', `Bearer ${readerToken}`)
      .set('X-Impersonate-User-Id', navigator._id.toString())
      .expect(200);

    const ids = res.body.students.map(s => s._id);
    expect(ids).toEqual([student._id.toString()]);
  });

  it('ignores the impersonation header for non-admin_reader users', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${studentToken}`)
      .set('X-Impersonate-User-Id', admin._id.toString())
      .expect(200);

    expect(res.body.user._id).toBe(student._id.toString());
    expect(res.body.isImpersonating).toBe(false);
  });

  it('ignores the impersonation header for administrators', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Impersonate-User-Id', student._id.toString())
      .expect(200);

    expect(res.body.user._id).toBe(admin._id.toString());
    expect(res.body.isImpersonating).toBe(false);
  });

  it('ignores invalid, unknown, inactive, and admin_reader targets', async () => {
    const inactive = await createUser({ email: 'gone@students.example.edu', role: 'student', isActive: false });
    const otherReader = await createUser({ email: 'reader2@gmail.com', role: 'admin_reader' });
    const targets = ['not-an-id', new mongoose.Types.ObjectId().toString(), inactive._id.toString(), otherReader._id.toString()];

    for (const target of targets) {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${readerToken}`)
        .set('X-Impersonate-User-Id', target)
        .expect(200);

      expect(res.body.user._id).toBe(reader._id.toString());
      expect(res.body.isImpersonating).toBe(false);
    }
  });
});

describe('GET /api/auth/impersonatable-users', () => {
  it('lists active non-admin_reader users', async () => {
    await createUser({ email: 'gone@students.example.edu', role: 'student', isActive: false });

    const res = await request(app)
      .get('/api/auth/impersonatable-users')
      .set('Authorization', `Bearer ${readerToken}`)
      .expect(200);

    const emails = res.body.users.map(u => u.email).sort();
    expect(emails).toEqual([
      'admin@students.example.edu',
      'nav@students.example.edu',
      'stu@students.example.edu'
    ]);
  });

  it('filters by role', async () => {
    const res = await request(app)
      .get('/api/auth/impersonatable-users?role=learning_navigator')
      .set('Authorization', `Bearer ${readerToken}`)
      .expect(200);

    expect(res.body.users.map(u => u.email)).toEqual(['nav@students.example.edu']);
  });

  it('does not allow listing admin_readers via the role filter', async () => {
    const res = await request(app)
      .get('/api/auth/impersonatable-users?role=admin_reader')
      .set('Authorization', `Bearer ${readerToken}`)
      .expect(200);

    expect(res.body.users.some(u => u.role === 'admin_reader')).toBe(false);
  });

  it('filters by search term', async () => {
    const res = await request(app)
      .get('/api/auth/impersonatable-users?search=sam')
      .set('Authorization', `Bearer ${readerToken}`)
      .expect(200);

    expect(res.body.users.map(u => u.email)).toEqual(['stu@students.example.edu']);
  });

  it('does not return sensitive fields', async () => {
    const res = await request(app)
      .get('/api/auth/impersonatable-users')
      .set('Authorization', `Bearer ${readerToken}`)
      .expect(200);

    for (const u of res.body.users) {
      for (const field of ['password', 'googleAccessToken', 'googleRefreshToken', 'phone', 'googleId']) {
        expect(u).not.toHaveProperty(field);
      }
    }
  });

  it('remains available while impersonating', async () => {
    await request(app)
      .get('/api/auth/impersonatable-users')
      .set('Authorization', `Bearer ${readerToken}`)
      .set('X-Impersonate-User-Id', student._id.toString())
      .expect(200);
  });

  it.each([
    ['student', () => studentToken],
    ['administrator', () => adminToken]
  ])('is forbidden for %s', async (_role, getToken) => {
    await request(app)
      .get('/api/auth/impersonatable-users')
      .set('Authorization', `Bearer ${getToken()}`)
      .expect(403);
  });

  it('requires authentication', async () => {
    await request(app).get('/api/auth/impersonatable-users').expect(401);
  });
});
