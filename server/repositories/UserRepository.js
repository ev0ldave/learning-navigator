const BaseRepository = require('./BaseRepository');
const User = require('../models/User');

/**
 * User Repository - Handles all User data access
 */
class UserRepository extends BaseRepository {
  constructor() {
    super(User);
  }

  async findNavigator(id) {
    return this.findOne({
      _id: id,
      role: { $in: ['learning_navigator', 'administrator'] },
      isActive: true
    });
  }

  async findStudent(id) {
    return this.findOne({
      _id: id,
      role: 'student'
    });
  }

  async findByEmail(email) {
    return this.findOne({ email: email.toLowerCase() });
  }

  async findStudentsByNavigator(navigatorId, options = {}) {
    return this.find(
      { assignedNavigator: navigatorId, role: 'student' },
      options
    );
  }

  async findAllNavigators(includeAdmins = true) {
    const roles = includeAdmins 
      ? ['learning_navigator', 'administrator']
      : ['learning_navigator'];
    
    return this.find(
      { role: { $in: roles }, isActive: true },
      { sort: { lastName: 1, firstName: 1 } }
    );
  }

  async findAllStudents(options = {}) {
    return this.find(
      { role: 'student', isActive: true },
      { ...options, sort: options.sort || { lastName: 1, firstName: 1 } }
    );
  }

  async findWithCredentials(email) {
    return this.model.findOne({ email: email.toLowerCase() }).select('+password');
  }

  async findWithGoogleTokens(id) {
    return this.model.findById(id).select('+googleAccessToken +googleRefreshToken');
  }
}

// Export singleton instance for convenience
module.exports = new UserRepository();
// Also export class for dependency injection in tests
module.exports.UserRepository = UserRepository;
