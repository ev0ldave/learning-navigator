const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../models/User');
const Meeting = require('../models/Meeting');
const MeetingAuditLog = require('../models/MeetingAuditLog');
const migration = require('../migrations/20261101-fix-dst-shifted-recurring-meetings');
const { createPacificDate, getPacificComponents } = require('../utils/timezone');

const DAY_MS = 24 * 60 * 60 * 1000;
const HALF_HOUR = 30 * 60 * 1000;

let mongoServer;
let student;
let otherStudent;
let navigator;

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
  await Meeting.deleteMany({});
  await MeetingAuditLog.deleteMany({});
  navigator = await User.create({ email: 'nav@test.com', firstName: 'Nora', lastName: 'Nav', role: 'learning_navigator', isActive: true });
  student = await User.create({ email: 'stu@test.com', firstName: 'Sam', lastName: 'Stu', role: 'student', isActive: true });
  otherStudent = await User.create({ email: 'stu2@test.com', firstName: 'Ola', lastName: 'Other', role: 'student', isActive: true });
});

const pacificTime = (date) => {
  const c = getPacificComponents(date);
  return `${c.month + 1}/${c.day} ${c.hours}:${String(c.minutes).padStart(2, '0')}`;
};

// Builds a series the way the old generator did: fixed 7 x 24h steps from the parent.
// DST ends Nov 3, 2030, so the third occurrence crosses it.
const createOldStyleSeries = async (studentId, hour) => {
  const parentStart = createPacificDate(2030, 9, 23, hour, 0);
  const parent = await Meeting.create({
    student: studentId,
    navigator: navigator._id,
    title: 'Weekly check-in',
    startTime: parentStart,
    endTime: new Date(parentStart.getTime() + HALF_HOUR),
    isRecurring: true,
    type: 'recurring',
    recurrence: { frequency: 'weekly' },
    status: 'scheduled',
    createdBy: studentId
  });
  const children = [];
  for (let i = 1; i <= 3; i++) {
    const start = new Date(parentStart.getTime() + i * 7 * DAY_MS);
    children.push(await Meeting.create({
      student: studentId,
      navigator: navigator._id,
      title: 'Weekly check-in',
      startTime: start,
      endTime: new Date(start.getTime() + HALF_HOUR),
      isRecurring: true,
      type: 'recurring',
      recurrence: { frequency: 'weekly', parentMeetingId: parent._id },
      status: 'scheduled',
      createdBy: studentId
    }));
  }
  return { parent, children };
};

describe('DST recurring meeting correction migration', () => {
  it('moves occurrences after the DST change back to the series time', async () => {
    const { children } = await createOldStyleSeries(student._id, 15);
    expect(children.map(c => pacificTime(c.startTime))).toEqual(['10/30 15:00', '11/6 14:00', '11/13 14:00']);

    await migration.up();

    const after = await Meeting.find({ _id: { $in: children.map(c => c._id) } }).sort({ startTime: 1 });
    expect(after.map(c => pacificTime(c.startTime))).toEqual(['10/30 15:00', '11/6 15:00', '11/13 15:00']);
    expect(after.map(c => pacificTime(c.endTime))).toEqual(['10/30 15:30', '11/6 15:30', '11/13 15:30']);

    const logs = await MeetingAuditLog.find({ action: 'rescheduled' });
    expect(logs).toHaveLength(2);
    expect(logs[0].performedByName).toBe('System');
    expect(logs[0].details).toMatch(/daylight saving/i);
  });

  it('leaves correctly generated and individually rescheduled meetings alone', async () => {
    const { children } = await createOldStyleSeries(student._id, 15);
    const correct = children[1];
    correct.startTime = createPacificDate(2030, 10, 6, 15, 0);
    correct.endTime = new Date(correct.startTime.getTime() + HALF_HOUR);
    await correct.save();

    const moved = children[2];
    moved.rescheduledFrom = moved.startTime;
    moved.rescheduledBy = student._id;
    await moved.save();

    await migration.up();

    expect(pacificTime((await Meeting.findById(correct._id)).startTime)).toBe('11/6 15:00');
    expect(pacificTime((await Meeting.findById(moved._id)).startTime)).toBe('11/13 14:00');
  });

  it('handles back-to-back series for the same navigator', async () => {
    await createOldStyleSeries(student._id, 14);
    await createOldStyleSeries(otherStudent._id, 15);

    await migration.up();

    const nov6 = await Meeting.find({
      startTime: { $gte: createPacificDate(2030, 10, 6, 0, 0), $lt: createPacificDate(2030, 10, 7, 0, 0) }
    }).sort({ startTime: 1 });
    expect(nov6.map(m => pacificTime(m.startTime))).toEqual(['11/6 14:00', '11/6 15:00']);
  });

  it('skips a meeting when its corrected time is already taken', async () => {
    const { children } = await createOldStyleSeries(student._id, 15);
    const blockerStart = createPacificDate(2030, 10, 6, 15, 0);
    await Meeting.create({
      student: otherStudent._id,
      navigator: navigator._id,
      title: 'Other meeting',
      startTime: blockerStart,
      endTime: new Date(blockerStart.getTime() + HALF_HOUR),
      status: 'scheduled',
      createdBy: otherStudent._id
    });

    await migration.up();

    expect(pacificTime((await Meeting.findById(children[1]._id)).startTime)).toBe('11/6 14:00');
    expect(pacificTime((await Meeting.findById(children[2]._id)).startTime)).toBe('11/13 15:00');
  });
});
