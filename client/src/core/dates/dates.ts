/**
 * Milliseconds in a day.
 */
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

/**
 * How long until the next midnight in Italy, where the server counts its days. It reads the clock, so on the days summer
 * time changes it can be an hour off: asking again when it elapses corrects it.
 *
 * @returns The milliseconds.
 */
export function untilRomeMidnight(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find(candidate => candidate.type === type)!.value);
  return DAY_MILLISECONDS - (part('hour') * 3600 + part('minute') * 60 + part('second')) * 1000;
}
