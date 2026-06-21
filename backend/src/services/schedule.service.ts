import { ScheduleRule } from '../shared/types/index.js';

/**
 * Validate a schedule rule to ensure it's properly configured
 * @returns Object with valid flag and error message if invalid
 */
export function validateSchedule(schedule: ScheduleRule): { valid: boolean; error?: string } {
  // Validate timezone
  try {
    new Date().toLocaleString('en-US', { timeZone: schedule.timezone });
  } catch (e) {
    return { valid: false, error: `Invalid timezone: ${schedule.timezone}` };
  }

  // Validate time format if provided
  if (schedule.time) {
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (!timeRegex.test(schedule.time)) {
      return { valid: false, error: `Invalid time format: ${schedule.time}. Expected HH:MM` };
    }
  }

  // Validate end date if provided
  if (schedule.endDate) {
    const endDate = new Date(schedule.endDate);
    if (isNaN(endDate.getTime())) {
      return { valid: false, error: `Invalid end date: ${schedule.endDate}` };
    }
    if (endDate < new Date()) {
      return { valid: false, error: `End date is in the past: ${schedule.endDate}` };
    }
  }

  // Type-specific validation
  switch (schedule.type) {
    case 'weekly':
      if (!schedule.daysOfWeek || schedule.daysOfWeek.length === 0) {
        return { valid: false, error: 'Weekly schedule requires daysOfWeek array' };
      }
      if (schedule.daysOfWeek.some(day => day < 0 || day > 6)) {
        return { valid: false, error: 'daysOfWeek must be between 0 (Sunday) and 6 (Saturday)' };
      }
      break;

    case 'monthly':
      if (!schedule.dayOfMonth || schedule.dayOfMonth.length === 0) {
        return { valid: false, error: 'Monthly schedule requires dayOfMonth array' };
      }
      if (schedule.dayOfMonth.some(day => day < 1 || day > 31)) {
        return { valid: false, error: 'dayOfMonth must be between 1 and 31' };
      }
      break;

    case 'custom':
      if (!schedule.interval || schedule.interval < 1) {
        return { valid: false, error: 'Custom schedule requires interval >= 1' };
      }
      break;
  }

  return { valid: true };
}

/**
 * Calculate the next due date for an item based on its schedule rule
 */
export function calculateNextDueDate(schedule: ScheduleRule, lastCompleted?: Date): Date {
  const now = new Date();
  const baseDate = lastCompleted || now;
  const timezone = schedule.timezone;

  let nextDue: Date;

  switch (schedule.type) {
    case 'once':
      // For one-time tasks, return the scheduled time if it's in the future
      if (schedule.time) {
        const scheduledTime = parseTime(schedule.time, baseDate, timezone);
        nextDue = scheduledTime > now ? scheduledTime : new Date(8640000000000000); // Far future if passed
      } else {
        nextDue = baseDate;
      }
      break;

    case 'daily':
      nextDue = calculateDailyNext(schedule, baseDate, timezone);
      break;

    case 'weekly':
      nextDue = calculateWeeklyNext(schedule, baseDate, timezone);
      break;

    case 'monthly':
      nextDue = calculateMonthlyNext(schedule, baseDate, timezone);
      break;

    case 'custom':
      nextDue = calculateCustomNext(schedule, baseDate, timezone);
      break;

    default:
      nextDue = baseDate;
  }

  // Apply recurrence end date if set
  if (schedule.endDate) {
    const endDate = new Date(schedule.endDate);
    if (nextDue > endDate) {
      return new Date(8640000000000000); // Far future to indicate no more occurrences
    }
  }

  return nextDue;
}

function calculateDailyNext(schedule: ScheduleRule, baseDate: Date, timezone: string): Date {
  const next = new Date(baseDate);
  next.setDate(next.getDate() + 1);

  if (schedule.time) {
    const time = parseTime(schedule.time, next, timezone);
    return time;
  }

  return toTimezone(next, timezone);
}

function calculateWeeklyNext(schedule: ScheduleRule, baseDate: Date, timezone: string): Date {
  if (!schedule.daysOfWeek || schedule.daysOfWeek.length === 0) {
    // Default to same day next week
    const next = new Date(baseDate);
    next.setDate(next.getDate() + 7);
    return toTimezone(next, timezone);
  }

  const currentDay = baseDate.getDay();
  const targetDays = schedule.daysOfWeek.sort((a: number, b: number) => a - b);

  // Find the next target day
  let nextDay = targetDays.find(day => day > currentDay);
  
  if (nextDay === undefined) {
    // Wrap to next week
    nextDay = targetDays[0];
    const daysUntilNext = (7 - currentDay) + nextDay;
    const next = new Date(baseDate);
    next.setDate(next.getDate() + daysUntilNext);
    
    if (schedule.time) {
      return parseTime(schedule.time, next, timezone);
    }
    return toTimezone(next, timezone);
  }

  const daysUntil = nextDay - currentDay;
  const next = new Date(baseDate);
  next.setDate(next.getDate() + daysUntil);

  if (schedule.time) {
    return parseTime(schedule.time, next, timezone);
  }

  return toTimezone(next, timezone);
}

function calculateMonthlyNext(schedule: ScheduleRule, baseDate: Date, timezone: string): Date {
  if (!schedule.dayOfMonth || schedule.dayOfMonth.length === 0) {
    // Default to same day next month
    const next = new Date(baseDate);
    next.setMonth(next.getMonth() + 1);
    return toTimezone(next, timezone);
  }

  const currentDay = baseDate.getDate();
  const targetDays = schedule.dayOfMonth.sort((a: number, b: number) => a - b);

  // Find the next target day in current month
  let nextDay = targetDays.find(day => day > currentDay);

  if (nextDay === undefined) {
    // Move to next month
    nextDay = targetDays[0];
    const next = new Date(baseDate);
    next.setMonth(next.getMonth() + 1);
    next.setDate(Math.min(nextDay, getDaysInMonth(next.getFullYear(), next.getMonth())));
    
    if (schedule.time) {
      return parseTime(schedule.time, next, timezone);
    }
    return toTimezone(next, timezone);
  }

  const next = new Date(baseDate);
  next.setDate(nextDay);

  if (schedule.time) {
    return parseTime(schedule.time, next, timezone);
  }

  return toTimezone(next, timezone);
}

function calculateCustomNext(schedule: ScheduleRule, baseDate: Date, timezone: string): Date {
  if (!schedule.interval) {
    return baseDate;
  }

  const next = new Date(baseDate);
  next.setDate(next.getDate() + schedule.interval);

  if (schedule.time) {
    return parseTime(schedule.time, next, timezone);
  }

  return toTimezone(next, timezone);
}

function parseTime(time: string, date: Date, timezone: string): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return toTimezone(result, timezone);
}

function toTimezone(date: Date, timezone: string): Date {
  // Simple timezone handling - in production, use a library like luxon or date-fns-tz
  return new Date(date.toLocaleString('en-US', { timeZone: timezone }));
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}
