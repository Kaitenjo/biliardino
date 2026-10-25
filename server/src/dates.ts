/**
 * The time zone of the days the application counts: the roles change once a day, the availability is for today, the
 * lobbies open at Italian times.
 */
const TIME_ZONE = 'Europe/Rome';

/**
 * A moment as read on an Italian clock.
 */
export interface RomeClock {
  /**
   * The date, `YYYY-MM-DD`.
   */
  day: string;
  /**
   * Minutes since midnight, e.g. 630 for 10:30.
   */
  minutes: number;
}

/**
 * Today in Italy: D1 knows only UTC.
 *
 * @returns The date, `YYYY-MM-DD`.
 */
export function today(): string {
  return romeClock().day;
}

/**
 * Reads a moment on an Italian clock, summer time included.
 *
 * @param now - The moment, now by default.
 * @returns The Italian date and time.
 */
export function romeClock(now = new Date()): RomeClock {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find(candidate => candidate.type === type)!.value;
  return { day: `${part('year')}-${part('month')}-${part('day')}`, minutes: Number(part('hour')) * 60 + Number(part('minute')) };
}

/**
 * Moves a date by some days.
 *
 * @param day - The date, `YYYY-MM-DD`.
 * @param count - The days, negative to go back.
 * @returns The date, `YYYY-MM-DD`.
 */
export function addDays(day: string, count: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

/**
 * The day of the week of a date.
 *
 * @param day - The date, `YYYY-MM-DD`.
 * @returns 0 (sunday) to 6 (saturday).
 */
export function weekdayOf(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}
