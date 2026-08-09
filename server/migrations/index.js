const Migration = require('../models/Migration');

// Register one-time migrations here in the order they should run.
const migrations = [
  require('./20260809-remove-future-meetings-outside-active-quarter')
];

/**
 * Runs any migrations that have not yet been applied. Each migration is
 * recorded in the `migrations` collection after it succeeds, so it runs only
 * once (on the first deployment that includes it) and is skipped thereafter.
 */
async function runMigrations() {
  for (const migration of migrations) {
    const alreadyApplied = await Migration.findOne({ name: migration.name });
    if (alreadyApplied) {
      continue;
    }

    console.log(`migrations ▶ running: ${migration.name}`);
    try {
      await migration.up();
      await Migration.create({ name: migration.name });
      console.log(`✅ migrations ✔ applied: ${migration.name}`);
    } catch (error) {
      // Leave it unrecorded so it retries on the next deployment.
      console.error(`❌ migrations ✖ failed: ${migration.name}`, error);
    }
  }
}

module.exports = { runMigrations };
