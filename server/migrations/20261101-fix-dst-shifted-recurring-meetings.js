const Meeting = require('../models/Meeting');
const { getPacificComponents } = require('../utils/timezone');
const meetingAuditService = require('../services/meetingAuditService');
const { queueCalendarUpdate } = require('../services/jobQueue');

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_STATUSES = ['scheduled', 'confirmed'];

// Pacific UTC offset in ms at the given instant (e.g. -7h during PDT, -8h during PST).
const pacificOffset = (date) => {
  const c = getPacificComponents(date);
  const wholeSeconds = Math.floor(date.getTime() / 1000) * 1000;
  return Date.UTC(c.year, c.month, c.day, c.hours, c.minutes, c.seconds) - wholeSeconds;
};

/**
 * One-time migration: recurring meetings generated before the DST-safe
 * generator were spaced in fixed 24-hour days, so occurrences on the other
 * side of a daylight saving change landed an hour off the series' time.
 * Move future, untouched occurrences back to the parent meeting's Pacific time.
 */
module.exports = {
  name: '20261101-fix-dst-shifted-recurring-meetings',

  async up() {
    const children = await Meeting.find({
      'recurrence.parentMeetingId': { $ne: null },
      startTime: { $gte: new Date() },
      status: { $in: ACTIVE_STATUSES },
      rescheduledFrom: null
    });

    const parentIds = [...new Set(children.map(c => c.recurrence.parentMeetingId.toString()))];
    const parents = await Meeting.find({ _id: { $in: parentIds } }).select('startTime');
    const parentsById = new Map(parents.map(p => [p._id.toString(), p]));

    const candidates = [];
    for (const child of children) {
      const parent = parentsById.get(child.recurrence.parentMeetingId.toString());
      if (!parent) continue;
      // The old generator added whole days, keeping the parent's UTC time of day.
      if ((child.startTime - parent.startTime) % DAY_MS !== 0) continue;
      const shift = pacificOffset(parent.startTime) - pacificOffset(child.startTime);
      if (shift !== 0) candidates.push({ child, shift });
    }

    // Move in the direction of the shift so back-to-back series don't block each other.
    candidates.sort((a, b) => {
      if ((a.shift > 0) !== (b.shift > 0)) return a.shift > 0 ? -1 : 1;
      return a.shift > 0 ? b.child.startTime - a.child.startTime : a.child.startTime - b.child.startTime;
    });

    let moved = 0;
    const skipped = [];
    for (const { child, shift } of candidates) {
      const newStart = new Date(child.startTime.getTime() + shift);
      const newEnd = new Date(child.endTime.getTime() + shift);

      const conflict = await Meeting.exists({
        _id: { $ne: child._id },
        status: { $in: ACTIVE_STATUSES },
        $or: [{ navigator: child.navigator }, { student: child.student }],
        startTime: { $lt: newEnd },
        endTime: { $gt: newStart }
      });
      if (conflict) {
        skipped.push(child._id.toString());
        continue;
      }

      const changes = [
        { field: 'startTime', from: child.startTime, to: newStart },
        { field: 'endTime', from: child.endTime, to: newEnd }
      ];
      child.startTime = newStart;
      child.endTime = newEnd;
      await child.save();
      await meetingAuditService.logChange(child, 'rescheduled', null, {
        changes,
        details: 'Daylight saving time correction: moved back to the recurring series time'
      });
      await queueCalendarUpdate(child._id);
      moved++;
    }

    console.log(`   ↳ Moved ${moved} recurring meeting(s) back to their series time.`);
    if (skipped.length) {
      console.log(`   ↳ Skipped ${skipped.length} meeting(s) because the corrected time conflicts with another meeting: ${skipped.join(', ')}`);
    }
  }
};
