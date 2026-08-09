const Meeting = require('../models/Meeting');
const SchoolQuarter = require('../models/SchoolQuarter');

/**
 * One-time migration: delete every future meeting whose start time falls
 * outside the currently active school quarter. If no active quarter is set,
 * nothing is deleted.
 */
module.exports = {
  name: '20260809-remove-future-meetings-outside-active-quarter',

  async up() {
    const activeQuarter = await SchoolQuarter.getActiveQuarter();

    if (!activeQuarter) {
      console.log('   ↳ No active quarter set — skipping.');
      return;
    }

    const now = new Date();

    const start = new Date(activeQuarter.startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(activeQuarter.endDate);
    end.setHours(23, 59, 59, 999);

    const result = await Meeting.deleteMany({
      startTime: { $gte: now },
      $or: [
        { startTime: { $lt: start } },
        { startTime: { $gt: end } }
      ]
    });

    console.log(
      `   ↳ Deleted ${result.deletedCount} future meeting(s) outside active quarter "${activeQuarter.name}".`
    );
  }
};
