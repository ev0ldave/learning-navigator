/**
 * GroupingRegistry - Open/Closed grouping dimensions.
 *
 * Each grouping is a strategy that knows how to derive a bucket key + label
 * from a meeting. Adding "by navigator" or "by quarter" means registering a new
 * strategy — no switch statement to edit (contrast with the old switch(groupBy)).
 */
const { displayFormatter } = require('./DisplayFormatter');
const { metricsCalculator: defaultMetricsCalculator } = require('./MetricRegistry');

const startOfWeek = (date) => {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
};

class GroupingStrategy {
  // Safe defaults; concrete strategies override id/keyFor/labelFor.
  get titleLabel() { return ''; }
  // By default notes are not group-specific.
  assignNotes() { /* no-op */ }
}

class StudentGrouping extends GroupingStrategy {
  get id() { return 'student'; }
  get titleLabel() { return 'by Student'; }
  keyFor(meeting) { return meeting.student?._id?.toString() || 'unknown'; }
  labelFor(meeting) {
    return meeting.student
      ? `${meeting.student.firstName} ${meeting.student.lastName}`
      : 'Unknown Student';
  }
  assignNotes(groups, notes) {
    notes.forEach(note => {
      const key = note.student?.toString() || 'unknown';
      if (groups.has(key)) groups.get(key).notes.push(note);
    });
  }
}

class WeekGrouping extends GroupingStrategy {
  get id() { return 'week'; }
  get titleLabel() { return 'Weekly'; }
  keyFor(meeting) { return startOfWeek(meeting.startTime).toISOString().split('T')[0]; }
  labelFor(meeting) {
    const weekStart = startOfWeek(meeting.startTime);
    return `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }
}

class MonthGrouping extends GroupingStrategy {
  get id() { return 'month'; }
  get titleLabel() { return 'Monthly'; }
  keyFor(meeting) {
    return `${meeting.startTime.getFullYear()}-${String(meeting.startTime.getMonth() + 1).padStart(2, '0')}`;
  }
  labelFor(meeting) {
    return meeting.startTime.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
}

class StatusGrouping extends GroupingStrategy {
  get id() { return 'status'; }
  get titleLabel() { return 'by Status'; }
  keyFor(meeting) { return meeting.status || 'unknown'; }
  labelFor(meeting, formatter) { return formatter.status(meeting.status); }
}

class LocationGrouping extends GroupingStrategy {
  get id() { return 'location'; }
  get titleLabel() { return 'by Location'; }
  keyFor(meeting) { return meeting.location || 'unknown'; }
  labelFor(meeting, formatter) { return formatter.location(meeting.location); }
}

class GroupingRegistry {
  constructor() {
    this._strategies = new Map();
  }

  register(strategy) {
    this._strategies.set(strategy.id, strategy);
    return this;
  }

  get(id) {
    return this._strategies.get(id);
  }

  has(id) {
    return this._strategies.has(id);
  }
}

/**
 * GroupingEngine - orchestrates a grouping strategy + metric calculation.
 */
class GroupingEngine {
  constructor(registry, metricsCalculator = defaultMetricsCalculator, formatter = displayFormatter) {
    this.registry = registry;
    this.metricsCalculator = metricsCalculator;
    this.formatter = formatter;
  }

  group(meetings, notes, groupById, selectedMetrics) {
    const strategy = this.registry.get(groupById);
    if (!strategy) return null;

    const groups = new Map();
    for (const meeting of meetings) {
      const key = strategy.keyFor(meeting);
      if (!groups.has(key)) {
        groups.set(key, { key, label: strategy.labelFor(meeting, this.formatter), meetings: [], notes: [] });
      }
      groups.get(key).meetings.push(meeting);
    }

    strategy.assignNotes(groups, notes);

    return [...groups.values()].map(group => ({
      key: group.key,
      label: group.label,
      count: group.meetings.length,
      metrics: this.metricsCalculator.calculate(group.meetings, group.notes, selectedMetrics)
    }));
  }

  titleLabel(groupById) {
    return this.registry.get(groupById)?.titleLabel || '';
  }
}

const defaultGroupingRegistry = new GroupingRegistry()
  .register(new StudentGrouping())
  .register(new WeekGrouping())
  .register(new MonthGrouping())
  .register(new StatusGrouping())
  .register(new LocationGrouping());

const groupingEngine = new GroupingEngine(defaultGroupingRegistry);

module.exports = {
  GroupingStrategy,
  StudentGrouping,
  WeekGrouping,
  MonthGrouping,
  StatusGrouping,
  LocationGrouping,
  GroupingRegistry,
  GroupingEngine,
  defaultGroupingRegistry,
  groupingEngine
};
