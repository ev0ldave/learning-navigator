/**
 * MetricRegistry - Open/Closed metric definitions.
 *
 * Each metric is a strategy: { id, compute(ctx) }. Adding a new metric means
 * registering a new strategy — no existing code is modified (contrast with the
 * old long `if (selectedMetrics.includes(...))` chain).
 */
const { displayFormatter } = require('./DisplayFormatter');

/**
 * Count meetings by a field value, producing { key, label, count, percentage }.
 */
const countByField = (meetings, field, formatter) => {
  const counts = {};
  meetings.forEach(m => {
    const value = m[field] || 'unknown';
    counts[value] = (counts[value] || 0) + 1;
  });
  return Object.entries(counts).map(([key, count]) => ({
    key,
    label: formatter.field(field, key),
    count,
    percentage: meetings.length > 0 ? Math.round((count / meetings.length) * 100) : 0
  }));
};

/**
 * Bucket meetings into a time-series trend by 'week' or 'month'.
 */
const calculateTrend = (meetings, period) => {
  const buckets = {};

  meetings.forEach(m => {
    let key;
    if (period === 'week') {
      const weekStart = new Date(m.startTime);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      key = weekStart.toISOString().split('T')[0];
    } else {
      key = `${m.startTime.getFullYear()}-${String(m.startTime.getMonth() + 1).padStart(2, '0')}`;
    }

    if (!buckets[key]) {
      buckets[key] = { total: 0, completed: 0, cancelled: 0, noShow: 0 };
    }
    buckets[key].total++;
    if (m.status === 'completed') buckets[key].completed++;
    if (m.status === 'cancelled') buckets[key].cancelled++;
    if (m.status === 'no_show') buckets[key].noShow++;
  });

  return Object.entries(buckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({ date, ...data }));
};

/**
 * Default metric strategies. `ctx` = { meetings, notes, formatter, aggregates }.
 */
const DEFAULT_METRICS = [
  { id: 'totalSessions', compute: ({ aggregates }) => aggregates.totalSessions },
  { id: 'completedSessions', compute: ({ aggregates }) => aggregates.completedSessions },
  { id: 'cancelledSessions', compute: ({ aggregates }) => aggregates.cancelledSessions },
  { id: 'noShowSessions', compute: ({ aggregates }) => aggregates.noShowSessions },
  {
    id: 'attendanceRate',
    compute: ({ aggregates }) => aggregates.totalSessions > 0
      ? Math.round((aggregates.completedSessions / aggregates.totalSessions) * 100)
      : 0
  },
  { id: 'totalDuration', compute: ({ aggregates }) => aggregates.totalDuration },
  {
    id: 'averageDuration',
    compute: ({ aggregates }) => aggregates.totalSessions > 0
      ? Math.round(aggregates.totalDuration / aggregates.totalSessions)
      : 0
  },
  { id: 'noteCount', compute: ({ notes }) => notes.length },
  { id: 'sharedNotes', compute: ({ notes }) => notes.filter(n => n.sharedWithStudent).length },
  { id: 'meetingTypes', compute: ({ meetings, formatter }) => countByField(meetings, 'location', formatter) },
  { id: 'statusBreakdown', compute: ({ meetings, formatter }) => countByField(meetings, 'status', formatter) },
  { id: 'weeklyTrend', compute: ({ meetings }) => calculateTrend(meetings, 'week') },
  { id: 'monthlyTrend', compute: ({ meetings }) => calculateTrend(meetings, 'month') }
];

class MetricRegistry {
  constructor() {
    this._metrics = new Map();
  }

  register(metric) {
    this._metrics.set(metric.id, metric);
    return this;
  }

  get(id) {
    return this._metrics.get(id);
  }

  has(id) {
    return this._metrics.has(id);
  }

  ids() {
    return [...this._metrics.keys()];
  }
}

/**
 * MetricsCalculator - computes the selected metrics from meeting/note data.
 * Shared aggregates are computed once and reused across metrics.
 */
class MetricsCalculator {
  constructor(registry, formatter = displayFormatter) {
    this.registry = registry;
    this.formatter = formatter;
  }

  calculate(meetings, notes, selectedMetrics = []) {
    const aggregates = this._aggregate(meetings);
    const ctx = { meetings, notes, formatter: this.formatter, aggregates };

    return selectedMetrics.reduce((result, id) => {
      const metric = this.registry.get(id);
      if (metric) {
        result[id] = metric.compute(ctx);
      }
      return result;
    }, {});
  }

  _aggregate(meetings) {
    return {
      totalSessions: meetings.length,
      completedSessions: meetings.filter(m => m.status === 'completed').length,
      cancelledSessions: meetings.filter(m => m.status === 'cancelled').length,
      noShowSessions: meetings.filter(m => m.status === 'no_show').length,
      totalDuration: meetings.reduce((sum, m) => sum + (m.duration || 0), 0)
    };
  }
}

const defaultMetricRegistry = new MetricRegistry();
DEFAULT_METRICS.forEach(metric => defaultMetricRegistry.register(metric));

const metricsCalculator = new MetricsCalculator(defaultMetricRegistry);

module.exports = {
  MetricRegistry,
  MetricsCalculator,
  DEFAULT_METRICS,
  countByField,
  calculateTrend,
  defaultMetricRegistry,
  metricsCalculator
};
