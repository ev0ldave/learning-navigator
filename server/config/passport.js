const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Allowed domain for registration
const ALLOWED_DOMAIN = process.env.ALLOWED_DOMAIN || 'students.highline.edu';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'trlandrew@students.highline.edu';

// Test accounts (only for development)
const TEST_ACCOUNTS = [
  process.env.TEST_STUDENT_EMAIL_1 || '1411andrew@gmail.com',
  process.env.TEST_STUDENT_EMAIL_2 || 'ev0ldave@gmail.com',
  process.env.TEST_ADMIN_EMAIL || 'trlandrew@students.highline.edu'
];

// Check if email is allowed
const isEmailAllowed = (email) => {
  if (!email) return false;
  
  const emailLower = email.toLowerCase();
  
  // Test accounts are always allowed (configured via environment variables)
  if (TEST_ACCOUNTS.map(e => e.toLowerCase()).includes(emailLower)) {
    return true;
  }
  
  // Check if email is from allowed domain
  return emailLower.endsWith(`@${ALLOWED_DOMAIN}`);
};

// Determine role based on email
const determineRole = (email) => {
  if (!email) return 'student';
  
  const emailLower = email.toLowerCase();
  
  // Administrator check
  if (emailLower === ADMIN_EMAIL.toLowerCase()) {
    return 'administrator';
  }
  
  // Test student accounts in development
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    const testStudentEmails = [
      (process.env.TEST_STUDENT_EMAIL_1 || '1411andrew@gmail.com').toLowerCase(),
      (process.env.TEST_STUDENT_EMAIL_2 || 'ev0ldave@gmail.com').toLowerCase()
    ];
    if (testStudentEmails.includes(emailLower)) {
      return 'student';
    }
  }
  
  // Default role is student
  return 'student';
};

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/auth/google/callback',
    passReqToCallback: true
  },
  async (req, accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
      
      if (!email) {
        return done(null, false, { message: 'No email associated with Google account' });
      }
      
      // Check if email is allowed
      if (!isEmailAllowed(email)) {
        return done(null, false, { 
          message: `Only accounts from ${ALLOWED_DOMAIN} are allowed to register` 
        });
      }
      
      // Check if user already exists
      let user = await User.findOne({ email: email.toLowerCase() });
      
      if (user) {
        // Update Google tokens
        user.googleId = profile.id;
        user.googleAccessToken = accessToken;
        user.googleRefreshToken = refreshToken || user.googleRefreshToken;
        user.lastLogin = new Date();
        await user.save();
        return done(null, user);
      }
      
      // Create new user
      const role = determineRole(email);
      
      user = new User({
        googleId: profile.id,
        email: email.toLowerCase(),
        firstName: profile.name?.givenName || profile.displayName?.split(' ')[0] || '',
        lastName: profile.name?.familyName || profile.displayName?.split(' ').slice(1).join(' ') || '',
        profilePicture: profile.photos && profile.photos[0] ? profile.photos[0].value : null,
        role: role,
        googleAccessToken: accessToken,
        googleRefreshToken: refreshToken,
        isActive: true
      });
      
      await user.save();
      return done(null, user);
    } catch (error) {
      return done(error, null);
    }
  }));
}

// Local Strategy (for test accounts in development)
passport.use(new LocalStrategy({
  usernameField: 'email',
  passwordField: 'password'
},
async (email, password, done) => {
  try {
    // Only allow local auth in development/test
    if (process.env.NODE_ENV === 'production') {
      return done(null, false, { message: 'Local authentication not allowed in production' });
    }
    
    const emailLower = email.toLowerCase();
    
    // Check if it's a test account
    if (!TEST_ACCOUNTS.map(e => e.toLowerCase()).includes(emailLower)) {
      return done(null, false, { message: 'Invalid test account' });
    }
    
    let user = await User.findOne({ email: emailLower });
    
    if (!user) {
      return done(null, false, { message: 'User not found' });
    }
    
    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return done(null, false, { message: 'Invalid credentials' });
    }
    
    // Update last login
    user.lastLogin = new Date();
    await user.save();
    
    return done(null, user);
  } catch (error) {
    return done(error);
  }
}));

module.exports = {
  isEmailAllowed,
  determineRole,
  TEST_ACCOUNTS
};
