/**
 * DisplayFormatter - Single Responsibility: turn raw enum values into
 * human-readable labels. Changing labels/i18n touches only this file.
 */
const DEFAULT_LABELS = {
  status: {
    scheduled: 'Scheduled',
    completed: 'Completed',
    cancelled: 'Cancelled',
    no_show: 'No Show'
  },
  location: {
    virtual: 'Virtual',
    in_person: 'In Person',
    phone: 'Phone'
  }
};

class DisplayFormatter {
  constructor(labelMaps = DEFAULT_LABELS) {
    this.labelMaps = labelMaps;
  }

  status(value) {
    return this.labelMaps.status[value] ?? value;
  }

  location(value) {
    return this.labelMaps.location[value] ?? value;
  }

  /**
   * Format a value for an arbitrary field, if a label map exists for it.
   */
  field(field, value) {
    const map = this.labelMaps[field];
    return map ? (map[value] ?? value) : value;
  }
}

const displayFormatter = new DisplayFormatter();

module.exports = { DisplayFormatter, DEFAULT_LABELS, displayFormatter };
