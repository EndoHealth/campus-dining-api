const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  const value = parseDateOnly(date);
  value.setUTCDate(value.getUTCDate() + days);
  return dateOnly(value);
}

export function weekdayName(date: string) {
  return WEEKDAYS[parseDateOnly(date).getUTCDay()];
}

export function monthName(date: string) {
  return MONTHS[parseDateOnly(date).getUTCMonth()];
}

export function monthNumber(date: string) {
  return parseDateOnly(date).getUTCMonth() + 1;
}

export function isWeekday(date: string) {
  const day = parseDateOnly(date).getUTCDay();
  return day >= 1 && day <= 5;
}

export function isTodayUtc(date: string) {
  return date === new Date().toISOString().slice(0, 10);
}

export function dateFromMonthDay(monthDay: string, year: number) {
  const match = monthDay.trim().match(/^([A-Za-z]+)\s+(\d{1,2})$/);
  if (!match) return undefined;

  const monthIndex = MONTHS.findIndex((month) => month.toLowerCase() === match[1].toLowerCase());
  if (monthIndex < 0) return undefined;

  const value = new Date(Date.UTC(year, monthIndex, Number(match[2])));
  return Number.isNaN(value.valueOf()) ? undefined : dateOnly(value);
}

export function normalizeTimeRange(source: string) {
  const normalized = source
    .replace(/\u00a0/g, ' ')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const match = normalized.match(
    /(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|am|pm)\s*(?:-|to)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|am|pm)/i
  );

  if (!match) return {};

  return {
    startTime: toTwentyFourHour(match[1], match[2], match[3]),
    endTime: toTwentyFourHour(match[4], match[5], match[6]),
  };
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function toTwentyFourHour(hourText: string, minuteText: string | undefined, meridiemText: string) {
  let hour = Number(hourText);
  const minute = Number(minuteText ?? '0');
  const meridiem = meridiemText.toLowerCase().replace(/\./g, '');

  if (meridiem === 'pm' && hour !== 12) hour += 12;
  if (meridiem === 'am' && hour === 12) hour = 0;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
