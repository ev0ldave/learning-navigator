// MongoDB initialization script
db = db.getSiblingDB('learning-navigator');

// Create collections with validators
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['email', 'firstName', 'lastName', 'role'],
      properties: {
        email: {
          bsonType: 'string',
          description: 'Email address - required'
        },
        firstName: {
          bsonType: 'string',
          description: 'First name - required'
        },
        lastName: {
          bsonType: 'string',
          description: 'Last name - required'
        },
        role: {
          enum: ['student', 'learning_navigator', 'administrator'],
          description: 'User role - required'
        }
      }
    }
  }
});

db.createCollection('meetings');
db.createCollection('notes');
db.createCollection('notifications');
db.createCollection('reports');

// Create indexes
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ role: 1 });
db.users.createIndex({ assignedNavigator: 1 });

db.meetings.createIndex({ student: 1, startTime: 1 });
db.meetings.createIndex({ navigator: 1, startTime: 1 });
db.meetings.createIndex({ status: 1 });

db.notes.createIndex({ student: 1, navigator: 1 });
db.notes.createIndex({ meeting: 1 });
db.notes.createIndex({ type: 1 });

db.notifications.createIndex({ recipient: 1, createdAt: -1 });
db.notifications.createIndex({ 'channels.inApp.read': 1 });

db.reports.createIndex({ generatedBy: 1, createdAt: -1 });
db.reports.createIndex({ type: 1 });

print('Learning Navigator database initialized successfully');
