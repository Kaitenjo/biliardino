import { addDays, weekdayOf } from '../dates.ts';
import type { RomeClock } from '../dates.ts';

/**
 * A lobby of the day, at Italian times (`HH:MM`).
 */
export interface LobbySlot {
  /**
   * When it opens: also its name.
   */
  open: string;
  /**
   * When the matchmaking generates the match with who is in.
   */
  match: string;
  /**
   * When it closes.
   */
  close: string;
}

/**
 * The lobbies of a working day: each closes 30 minutes after its match, the last one in the evening.
 */
export const SLOTS: readonly LobbySlot[] = [
  { open: '10:30', match: '11:00', close: '11:30' },
  { open: '12:30', match: '13:00', close: '13:30' },
  { open: '15:30', match: '16:00', close: '16:30' },
  { open: '17:30', match: '18:00', close: '20:00' }
];

/**
 * Italian national holidays at a fixed date, `MM-DD`. San Francesco (4 October) is a national holiday again from 2026.
 */
const FIXED_HOLIDAYS: readonly string[] = ['01-01', '01-06', '04-25', '05-01', '06-02', '08-15', '10-04', '11-01', '12-08', '12-25', '12-26'];

/**
 * Minutes since midnight of a time.
 *
 * @param time - The time, `HH:MM`.
 * @returns The minutes.
 */
export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours! * 60 + minutes!;
}

/**
 * Finds the lobby that opens at a time.
 *
 * @param open - Its opening time.
 * @returns The lobby, `undefined` for a time with none.
 */
export function slotAt(open: string): LobbySlot | undefined {
  return SLOTS.find(slot => slot.open === open);
}

/**
 * Whether the lobbies open on a day: monday to friday, holidays excluded.
 *
 * @param day - The date, `YYYY-MM-DD`.
 * @returns Whether it is a working day.
 */
export function isWorkingDay(day: string): boolean {
  const weekday = weekdayOf(day);
  if (weekday === 0 || weekday === 6 || FIXED_HOLIDAYS.includes(day.slice(5))) {
    return false;
  }

  // Easter Monday, the only moving holiday that can fall on a working day
  return day !== addDays(easterSunday(Number(day.slice(0, 4))), 1);
}

/**
 * The next lobby to open after a moment.
 *
 * @param clock - The moment, on an Italian clock.
 * @returns Its day and its slot, `null` when none opens in the next weeks (it can't happen).
 */
export function nextOpening(clock: RomeClock): { day: string; slot: LobbySlot } | null {
  for (let offset = 0; offset < 21; offset++) {
    const day = addDays(clock.day, offset);
    if (!isWorkingDay(day)) {
      continue;
    }

    const slot = SLOTS.find(candidate => offset > 0 || toMinutes(candidate.open) > clock.minutes);
    if (slot) {
      return { day, slot };
    }
  }

  return null;
}

/**
 * Easter Sunday of a year (the anonymous Gregorian algorithm).
 *
 * @param year - The year.
 * @returns The date, `YYYY-MM-DD`.
 */
function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
