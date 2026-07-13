/**
 * Pacific Timezone Utilities
 * All time operations in this app use America/Los_Angeles (Pacific Time)
 */

const PACIFIC_TZ = 'America/Los_Angeles';

/**
 * Get Pacific time components from a Date object
 * @param {Date} date - Date object in any timezone
 * @returns {Object} - { year, month, day, hours, minutes, seconds, dayOfWeek }
 */
function getPacificComponents(date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short'
  });
  
  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find(p => p.type === type)?.value;
  
  const weekdayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
  
  // Some ICU implementations return "24" for midnight instead of "00"
  // Handle this edge case by converting 24 to 0
  let hours = parseInt(get('hour'));
  if (hours === 24) {
    hours = 0;
  }
  
  return {
    year: parseInt(get('year')),
    month: parseInt(get('month')) - 1, // 0-indexed like JS Date
    day: parseInt(get('day')),
    hours: hours,
    minutes: parseInt(get('minute')),
    seconds: parseInt(get('second')),
    dayOfWeek: weekdayMap[get('weekday')]
  };
}

/**
 * Get the day of week (0-6, Sunday-Saturday) in Pacific time
 * @param {Date} date 
 * @returns {number}
 */
function getPacificDayOfWeek(date) {
  return getPacificComponents(date).dayOfWeek;
}

/**
 * Create a Date object for a specific time in Pacific timezone
 * @param {number} year 
 * @param {number} month - 0-indexed
 * @param {number} day 
 * @param {number} hours 
 * @param {number} minutes 
 * @param {number} seconds 
 * @returns {Date}
 */
function createPacificDate(year, month, day, hours = 0, minutes = 0, seconds = 0) {
  // Create an ISO string for the target time in Pacific
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${year}-${pad(month + 1)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  
  // Get the UTC offset for Pacific time on this date
  // We need to account for DST
  const tempDate = new Date(dateStr + 'Z'); // Interpret as UTC first
  const pacificStr = tempDate.toLocaleString('en-US', { timeZone: PACIFIC_TZ });
  const pacificDate = new Date(pacificStr);
  
  // Calculate offset in milliseconds
  const utcMs = tempDate.getTime();
  const localMs = pacificDate.getTime();
  const offsetMs = utcMs - localMs;
  
  // Create the correct date by parsing as local Pacific time
  // Use a more reliable method: create date string and let JS parse with timezone info
  const targetDate = new Date(`${dateStr}`);
  
  // Get what the Pacific time would be if we interpret dateStr as Pacific
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  });
  
  // Binary search to find the UTC time that corresponds to the Pacific time
  // Start with a guess that the offset is ~8 hours (PST)
  let guess = new Date(Date.UTC(year, month, day, hours + 8, minutes, seconds));
  
  for (let i = 0; i < 5; i++) {
    const pacificComps = getPacificComponents(guess);
    const diffHours = hours - pacificComps.hours;
    const diffMins = minutes - pacificComps.minutes;
    const diffDays = day - pacificComps.day;
    
    if (diffHours === 0 && diffMins === 0 && diffDays === 0) {
      return guess;
    }
    
    guess = new Date(guess.getTime() + (diffDays * 24 + diffHours) * 60 * 60 * 1000 + diffMins * 60 * 1000);
  }
  
  return guess;
}

/**
 * Get start of day in Pacific time
 * @param {Date} date - Any date
 * @returns {Date} - Start of that day (00:00:00) in Pacific
 */
function getPacificStartOfDay(date) {
  const { year, month, day } = getPacificComponents(date);
  return createPacificDate(year, month, day, 0, 0, 0);
}

/**
 * Get end of day in Pacific time
 * @param {Date} date - Any date
 * @returns {Date} - End of that day (23:59:59.999) in Pacific
 */
function getPacificEndOfDay(date) {
  const { year, month, day } = getPacificComponents(date);
  const endOfDay = createPacificDate(year, month, day, 23, 59, 59);
  return new Date(endOfDay.getTime() + 999);
}

/**
 * Format a date in Pacific time
 * @param {Date} date 
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {string}
 */
function formatPacific(date, options = {}) {
  return date.toLocaleString('en-US', { ...options, timeZone: PACIFIC_TZ });
}

/**
 * Get Pacific time as HH:MM string from a Date
 * @param {Date} date 
 * @returns {string} e.g., "09:30"
 */
function getPacificTimeString(date) {
  const { hours, minutes } = getPacificComponents(date);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Parse a date string (YYYY-MM-DD or ISO) and return Pacific date components.
 * This ensures we get the calendar date the user intended, not a timezone-shifted one.
 * @param {string} dateStr - Date string in YYYY-MM-DD or ISO format
 * @returns {{ year: number, month: number, day: number, dayOfWeek: number }}
 */
function parseDateAsPacific(dateStr) {
  // If it's YYYY-MM-DD format, parse directly as calendar date
  const yyyymmddMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyymmddMatch) {
    const year = parseInt(yyyymmddMatch[1]);
    const month = parseInt(yyyymmddMatch[2]) - 1; // 0-indexed
    const day = parseInt(yyyymmddMatch[3]);
    
    // Create a date at noon Pacific to get correct day of week
    const noonPacific = createPacificDate(year, month, day, 12, 0, 0);
    const dayOfWeek = getPacificDayOfWeek(noonPacific);
    
    return { year, month, day, dayOfWeek };
  }
  
  // If it's an ISO string, convert to Pacific and extract components
  const date = new Date(dateStr);
  return getPacificComponents(date);
}

module.exports = {
  PACIFIC_TZ,
  getPacificComponents,
  getPacificDayOfWeek,
  createPacificDate,
  getPacificStartOfDay,
  getPacificEndOfDay,
  formatPacific,
  getPacificTimeString,
  parseDateAsPacific
};
