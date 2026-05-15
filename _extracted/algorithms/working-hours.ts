/**
 * Working hours → timezone-aware date ranges.
 *
 * EXTRACTED FROM:
 *   - packages/lib/availability.ts (getWorkingHours)
 *   - packages/features/schedules/lib/date-ranges.ts (processWorkingHours)
 *
 * WHAT IT DOES:
 *   Given a host's weekly schedule (e.g. "Mon-Fri 9-5 in Europe/Bucharest"),
 *   produce concrete UTC time ranges for each day in a query window. Correctly
 *   handles:
 *     - timezone offsets
 *     - DST transitions (spring-forward / fall-back)
 *     - day-boundary overflow (e.g. evening shifts that cross midnight UTC)
 *     - date-specific overrides ("I'm off this Friday")
 *
 * ZERO RUNTIME DEPS — uses native JS Date + Intl. No Day.js.
 *   (Cal.com's original relies on Day.js + plugins; this rewrite uses
 *    Intl.DateTimeFormat which has tz support since Node 14 / all browsers.)
 *
 * INTEGRATION NOTE:
 *   Ultron's profiles table likely doesn't store availability schedules yet.
 *   You'll need a new table `availability_schedules` per the schema in
 *   `_extracted/supabase/schema.sql`. Default schedule = Mon-Fri 9-17 in
 *   the user's profile timezone.
 */

import type {
  AvailabilitySchedule,
  DateOverride,
  DayOfWeek,
  ISODateTime,
  IANATimezone,
  MinutesOfDay,
  WorkingHours,
} from "../types/booking";

export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Compute the timezone offset (in minutes) of a given UTC instant in the
 * specified IANA timezone. Positive = ahead of UTC.
 *
 * Uses Intl.DateTimeFormat which is well-supported and correct for DST.
 */
export function tzOffsetMinutes(at: Date, timezone: IANATimezone): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(at);
  const get = (t: Intl.DateTimeFormatPart["type"]) =>
    Number(parts.find((p) => p.type === t)?.value);
  const y = get("year");
  const m = get("month");
  const d = get("day");
  const hh = get("hour");
  const mm = get("minute");
  const ss = get("second");
  const asUtc = Date.UTC(y, m - 1, d, hh, mm, ss);
  return Math.round((asUtc - at.getTime()) / 60000);
}

/**
 * Construct a UTC Date that represents the given wall-clock time in the
 * specified timezone. Handles DST automatically.
 *
 * Example: localDateInTz("2026-03-30", 9*60, "Europe/Bucharest") returns
 * the UTC instant of 2026-03-30 09:00 in Bucharest (which is 06:00Z in
 * winter, 07:00Z in summer — but here happens to be the DST transition day).
 */
export function localDateInTz(
  isoDate: string,
  minutesFromMidnight: MinutesOfDay,
  timezone: IANATimezone,
): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  // First approximation: pretend the wall-clock is UTC, then subtract the
  // timezone offset at that point. Two-pass is enough for DST correctness.
  const approx = new Date(Date.UTC(y, m - 1, d, 0, minutesFromMidnight, 0));
  const off1 = tzOffsetMinutes(approx, timezone);
  const corrected = new Date(approx.getTime() - off1 * 60_000);
  const off2 = tzOffsetMinutes(corrected, timezone);
  if (off1 !== off2) {
    // We crossed a DST transition mid-correction. The second offset is the
    // correct one for the wall-clock target.
    return new Date(approx.getTime() - off2 * 60_000);
  }
  return corrected;
}

/**
 * Return the YYYY-MM-DD string for a UTC instant rendered in a timezone.
 */
function isoDateInTz(at: Date, timezone: IANATimezone): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return dtf.format(at); // en-CA gives YYYY-MM-DD
}

function dayOfWeekInTz(at: Date, timezone: IANATimezone): DayOfWeek {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  });
  const wk = dtf.format(at); // "Mon" / "Tue" / ...
  return ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as const)[
    wk as "Sun"
  ] as DayOfWeek;
}

/**
 * Generate the ordered list of YYYY-MM-DD dates between two UTC instants,
 * as observed in the given timezone.
 */
function* enumerateDatesInTz(
  fromUtc: Date,
  toUtc: Date,
  timezone: IANATimezone,
): Generator<string> {
  const seen = new Set<string>();
  // Step in 12-hour increments — big enough to be efficient, small enough
  // to never skip a day even across DST.
  for (
    let t = fromUtc.getTime();
    t <= toUtc.getTime();
    t += 12 * 60 * 60 * 1000
  ) {
    const d = isoDateInTz(new Date(t), timezone);
    if (!seen.has(d)) {
      seen.add(d);
      yield d;
    }
  }
}

/**
 * Index date overrides by ISO date for O(1) lookup.
 */
function indexOverrides(overrides: DateOverride[]): Map<string, DateOverride> {
  const m = new Map<string, DateOverride>();
  for (const o of overrides) m.set(o.date, o);
  return m;
}

/**
 * Find working-hours rules that apply on a given weekday.
 */
function workingHoursForDay(
  rules: WorkingHours[],
  dow: DayOfWeek,
): { startMinute: MinutesOfDay; endMinute: MinutesOfDay }[] {
  const out: { startMinute: MinutesOfDay; endMinute: MinutesOfDay }[] = [];
  for (const r of rules) {
    if (r.days.includes(dow)) {
      out.push({ startMinute: r.startMinute, endMinute: r.endMinute });
    }
  }
  return out;
}

/**
 * Merge overlapping or touching date ranges, in-place sort first.
 */
function mergeRanges(ranges: DateRange[]): DateRange[] {
  if (ranges.length <= 1) return ranges;
  const sorted = [...ranges].sort(
    (a, b) => a.start.getTime() - b.start.getTime(),
  );
  const out: DateRange[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const cur = sorted[i];
    if (cur.start.getTime() <= last.end.getTime()) {
      if (cur.end.getTime() > last.end.getTime()) last.end = cur.end;
    } else {
      out.push(cur);
    }
  }
  return out;
}

/**
 * Build the host's available date ranges within the query window.
 *
 * Algorithm:
 *   1. Enumerate every date in [rangeStart, rangeEnd] in the host's timezone
 *   2. For each date:
 *      a. If a date override exists, use it (might be unavailable all day)
 *      b. Else find recurring working-hours rules for that day-of-week
 *   3. Translate the wall-clock ranges → UTC Date objects (DST-aware)
 *   4. Intersect with [rangeStart, rangeEnd]
 *   5. Merge overlapping ranges
 *
 * @param rangeStart inclusive
 * @param rangeEnd exclusive
 */
export function buildAvailableRanges(
  rangeStart: ISODateTime,
  rangeEnd: ISODateTime,
  schedule: AvailabilitySchedule,
): DateRange[] {
  const rs = new Date(rangeStart);
  const re = new Date(rangeEnd);
  if (re.getTime() <= rs.getTime()) return [];

  const tz = schedule.timezone;
  const overrideIdx = indexOverrides(schedule.overrides);

  const out: DateRange[] = [];

  for (const isoDate of enumerateDatesInTz(rs, re, tz)) {
    // Build a Date inside the day to determine its day-of-week in tz.
    const noon = localDateInTz(isoDate, 12 * 60, tz);
    const dow = dayOfWeekInTz(noon, tz);

    let dayRanges: { startMinute: MinutesOfDay; endMinute: MinutesOfDay }[];

    const override = overrideIdx.get(isoDate);
    if (override) {
      // Override = the ONLY availability for this date. If start==end==0
      // it means "unavailable all day".
      if (override.endMinute > override.startMinute) {
        dayRanges = [
          { startMinute: override.startMinute, endMinute: override.endMinute },
        ];
      } else {
        dayRanges = [];
      }
    } else {
      dayRanges = workingHoursForDay(schedule.workingHours, dow);
    }

    for (const { startMinute, endMinute } of dayRanges) {
      const start = localDateInTz(isoDate, startMinute, tz);
      const end = localDateInTz(isoDate, endMinute, tz);

      // Intersect with query window
      const clipStart = start.getTime() < rs.getTime() ? rs : start;
      const clipEnd = end.getTime() > re.getTime() ? re : end;
      if (clipEnd.getTime() > clipStart.getTime()) {
        out.push({ start: clipStart, end: clipEnd });
      }
    }
  }

  return mergeRanges(out);
}

/**
 * Subtract busy ranges from available ranges.
 * Both inputs must be sorted by start ascending and non-overlapping.
 * (Use `mergeRanges` first if not already merged.)
 */
export function subtractRanges(
  available: DateRange[],
  busy: DateRange[],
): DateRange[] {
  if (busy.length === 0) return [...available];
  const sortedBusy = mergeRanges(busy);
  const out: DateRange[] = [];

  for (const avail of available) {
    let cursor = avail.start;
    for (const b of sortedBusy) {
      if (b.end.getTime() <= cursor.getTime()) continue;
      if (b.start.getTime() >= avail.end.getTime()) break;

      if (b.start.getTime() > cursor.getTime()) {
        out.push({ start: cursor, end: new Date(b.start.getTime()) });
      }
      cursor = b.end.getTime() > cursor.getTime() ? b.end : cursor;
      if (cursor.getTime() >= avail.end.getTime()) break;
    }
    if (cursor.getTime() < avail.end.getTime()) {
      out.push({ start: cursor, end: avail.end });
    }
  }

  return out.filter((r) => r.end.getTime() > r.start.getTime());
}
