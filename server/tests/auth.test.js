const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../index');
const User = require('../models/User');

let mongoServer;

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
});

describe('Auth Routes', () => {
  describe('POST /api/auth/local/register', () => {
    it('should register a test account in development', async () => {
      const userData = {
        email: '1411andrew@gmail.com',
        password: 'testpassword123',
        firstName: 'Test',
        lastName: 'Student'
      };

      const res = await request(app)
        .post('/api/auth/local/register')
        .send(userData)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe(userData.email.toLowerCase());
      expect(res.body.user.role).toBe('student');
    });

    it('should register admin account with correct email', async () => {
      const userData = {
        email: 'trlandrew@students.highline.edu',
        password: 'adminpass123',
        firstName: 'Admin',
        lastName: 'User'
      };

      const res = await request(app)
        .post('/api/auth/local/register')
        .send(userData)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.user.role).toBe('administrator');
    });

    it('should reject non-test accounts', async () => {
      const userData = {
        email: 'random@gmail.com',
        password: 'testpassword123',
        firstName: 'Random',
        lastName: 'User'
      };

      const res = await request(app)
        .post('/api/auth/local/register')
        .send(userData)
        .expect(403);

      expect(res.body.success).toBe(false);
    });

    it('should reject duplicate registration', async () => {
      const userData = {
        email: '1411andrew@gmail.com',
        password: 'testpassword123',
        firstName: 'Test',
        lastName: 'Student'
      };

      await request(app).post('/api/auth/local/register').send(userData);

      const res = await request(app)
        .post('/api/auth/local/register')
        .send(userData)
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('already exists');
    });
  });

  describe('POST /api/auth/local/login', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/auth/local/register')
        .send({
          email: '1411andrew@gmail.com',
          password: 'testpassword123',
          firstName: 'Test',
          lastName: 'Student'
        });
    });

    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/local/login')
        .send({
          email: '1411andrew@gmail.com',
          password: 'testpassword123'
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
    });

    it('should reject invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/local/login')
        .send({
          email: '1411andrew@gmail.com',
          password: 'wrongpassword'
        })
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('should reject non-existent user', async () => {
      const res = await request(app)
        .post('/api/auth/local/login')
        .send({
          email: 'nonexistent@test.com',
          password: 'testpassword123'
        })
        .expect(401);

      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/auth/me', () => {
    let token;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/auth/local/register')
        .send({
          email: '1411andrew@gmail.com',
          password: 'testpassword123',
          firstName: 'Test',
          lastName: 'Student'
        });
      token = res.body.token;
    });

    it('should return current user with valid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.user.email).toBe('1411andrew@gmail.com');
    });

    it('should reject without token', async () => {
      await request(app)
        .get('/api/auth/me')
        .expect(401);
    });

    it('should reject invalid token', async () => {
      await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });
});

describe('Health Check', () => {
  it('should return ok status', async () => {
    const res = await request(app)
      .get('/api/health')
      .expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });
});

describe('POST /api/auth/logout', () => {
  let token;

  beforeEach(async () => {
    const res = await request(app)
      .post('/api/auth/local/register')
      .send({
        email: '1411andrew@gmail.com',
        password: 'testpassword123',
        firstName: 'Test',
        lastName: 'Student'
      });
    token = res.body.token;
  });

  it('should logout successfully', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('Logged out');
  });

  it('should reject logout without token', async () => {
    await request(app)
      .post('/api/auth/logout')
      .expect(401);
  });
});

describe('GET /api/auth/check', () => {
  let token;

  beforeEach(async () => {
    const res = await request(app)
      .post('/api/auth/local/register')
      .send({
        email: '1411andrew@gmail.com',
        password: 'testpassword123',
        firstName: 'Test',
        lastName: 'Student'
      });
    token = res.body.token;
  });

  it('should return authenticated true with valid token', async () => {
    const res = await request(app)
      .get('/api/auth/check')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.authenticated).toBe(true);
    expect(res.body.user).toBeDefined();
  });

  it('should return authenticated false without token', async () => {
    const res = await request(app)
      .get('/api/auth/check')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.authenticated).toBe(false);
  });

  it('should return authenticated false with invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/check')
      .set('Authorization', 'Bearer invalid-token-here')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.authenticated).toBe(false);
  });
});

describe('Password Hashing', () => {
  it('should hash password on registration', async () => {
    await request(app)
      .post('/api/auth/local/register')
      .send({
        email: '1411andrew@gmail.com',
        password: 'testpassword123',
        firstName: 'Test',
        lastName: 'Student'
      });

    const user = await User.findOne({ email: '1411andrew@gmail.com' }).select('+password');
    expect(user.password).not.toBe('testpassword123');
    expect(user.password.startsWith('$2')).toBe(true); // bcrypt hash
  });
});

describe('Validation', () => {
  it('should reject invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/local/register')
      .send({
        email: 'not-an-email',
        password: 'testpassword123',
        firstName: 'Test',
        lastName: 'Student'
      })
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  it('should reject password less than 6 characters', async () => {
    const res = await request(app)
      .post('/api/auth/local/register')
      .send({
        email: '1411andrew@gmail.com',
        password: '12345',
        firstName: 'Test',
        lastName: 'Student'
      })
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  it('should reject empty firstName', async () => {
    const res = await request(app)
      .post('/api/auth/local/register')
      .send({
        email: '1411andrew@gmail.com',
        password: 'testpassword123',
        firstName: '',
        lastName: 'Student'
      })
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  it('should reject empty lastName', async () => {
    const res = await request(app)
      .post('/api/auth/local/register')
      .send({
        email: '1411andrew@gmail.com',
        password: 'testpassword123',
        firstName: 'Test',
        lastName: ''
      })
      .expect(400);

    expect(res.body.success).toBe(false);
  });
});

describe('Second Test Account', () => {
  it('should register ev0ldave@gmail.com as student', async () => {
    const res = await request(app)
      .post('/api/auth/local/register')
      .send({
        email: 'ev0ldave@gmail.com',
        password: 'testpassword123',
        firstName: 'Test',
        lastName: 'Student2'
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.user.role).toBe('student');
  });
});

describe('Last Login Tracking', () => {
  it('should update lastLogin on login', async () => {
    // Register user
    await request(app)
      .post('/api/auth/local/register')
      .send({
        email: '1411andrew@gmail.com',
        password: 'testpassword123',
        firstName: 'Test',
        lastName: 'Student'
      });

    // Login
    await request(app)
      .post('/api/auth/local/login')
      .send({
        email: '1411andrew@gmail.com',
        password: 'testpassword123'
      });

    const user = await User.findOne({ email: '1411andrew@gmail.com' });
    expect(user.lastLogin).toBeDefined();
    expect(user.lastLogin instanceof Date).toBe(true);
  });
});
