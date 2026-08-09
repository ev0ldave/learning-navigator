const mongoose = require('mongoose');

// Tracks which one-time migrations have already been applied so each runs
// exactly once, on the first deployment that includes it.
const migrationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  appliedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Migration', migrationSchema);
