/**
 * Period bounds — is a booking time within the event type's allowed
 * future-window?
 *
 * EXTRACTED FROM:
 *   - packages/lib/isOutOfBounds.tsx
 *
 * WHAT IT DOES:
 *   Cal.com offers four ways to limit how far into the future people can
 *   book. This module evaluates them:
 *
 *     UNLIMITED:      no future limit
 *     ROLLING:        bookable up to N days from today (calendar or business)
 *     ROLLING_WINDOW: same as ROLLING but skips fully-busy days when counting
 *                     (so "bookable in the next 5 working slots" not "next 5
 *                      calendar days from today")
 *     RANGE:          bookable only between fixed periodStartDate and
 *                     periodEndDate (e.g. "this conference window only")
 *
 * NOT HANDLED HERE:
 *     - Minimum-booking-notice past-cutoff (already in slot-finder)
 *     - "Day is fully busy" computation for ROLLING_WINDOW — caller must
 *       provide that via the optional `dateBookabilityMap` arg
 *
 * COMPLEXITY: O(1) for ROLLING/RANGE, O(MAX_DAYS) for ROLLING_WINDOW.
 */

import type { EventType, ISODateTime } from "../types/booking";

/**
 * Resolved future-limit. The actual end-of-bookability date in UTC.
 * `null` = no limit (UNLIMITED) or invalid configuration.
 */
export interface PeriodLimit {
  /** Booking must NOT be after this instant. */
  latestAllowedAt: Date | null;
  /** Booking must NOT be before this instant. Only set for RANGE. */
  earliestAllowedAt: Date | null;
}

/**
 * Maximum days the ROLLING_WINDOW loop will check before giving up.
 * Mirrors cal.com's ROLLING_WINDOW_PERIOD_MAX_DAYS_TO_CHECK.
 */
const ROLLING_WINDOW_MAX_DAYS = 60;

/**
 * Add `days` calendar days to a Date. Returns a new Date.
 */
function addCalendarDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/**
 * Add `days` business days (skips Saturday/Sunday) to a Date.
 */
function addBusinessDays(d: Date, days: number): Date {
  if (days === 0) return new Date(d);
  let out = new Date(d);
  let remaining = days;
  const step = days > 0 ? 1 : -1;
  while (remaining !== 0) {
    out = addCalendarDays(out, step);
    const dow = out.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      remaining -= step;
    }
  }
  return out;
}

/**
 * UTC end-of-day for a given Date.
 */
function endOfDayUTC(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(23, 59, 59, 999);
  return out;
}

/**
 * Start of day for an ISO date (YYYY-MM-DD) in UTC.
 */
function startOfDayUTC(isoDate: string): Date {
  const [y, m, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day, 0, 0, 0, 0));
}

/**
 * Compute the period limit for an event type, relative to "now".
 *
 * For ROLLING_WINDOW, `dateBookabilityMap` is required. The map's keys are
 * YYYY-MM-DD in the booker's timezone, and values indicate whether that day
 * has any bookable slots. (Caller computes this by running the slot finder
 * day-by-day before checking the limit.)
 */
export function calculatePeriodLimit(
  eventType: Pick<
    EventType,
    | "periodType"
    | "periodDays"
    | "periodCountCalendarDays"
    | "periodStartDate"
    | "periodEndDate"
  >,
  options?: {
    /** Override "now" for testing. */
    now?: Date;
    /** Required for ROLLING_WINDOW; ignored otherwise. */
    dateBookabilityMap?: Map<string, { isBookable: boolean }>;
  },
): PeriodLimit {
  const now = options?.now ?? new Date();

  switch (eventType.periodType) {
    case "UNLIMITED":
      return { latestAllowedAt: null, earliestAllowedAt: null };

    case "ROLLING": {
      const days = eventType.periodDays ?? 0;
      const end = eventType.periodCountCalendarDays
        ? addCalendarDays(now, days)
        : addBusinessDays(now, days);
      return {
        latestAllowedAt: endOfDayUTC(end),
        earliestAllowedAt: null,
      };
    }

    case "ROLLING_WINDOW": {
      const days = eventType.periodDays ?? 0;
      const map = options?.dateBookabilityMap;
      if (!map) {
        // Without the map, fall back to a generous calendar-days estimate.
        // This is the same defensive default cal.com applies in code paths
        // that haven't yet computed availability.
        return {
          latestAllowedAt: endOfDayUTC(addCalendarDays(now, days)),
          earliestAllowedAt: null,
        };
      }

      let bookableCount = 0;
      let cursor = new Date(now);
      let lastBookable: Date | null = null;
      let checked = 0;
      while (bookableCount < days && checked < ROLLING_WINDOW_MAX_DAYS) {
        const key = cursor.toISOString().slice(0, 10);
        if (map.get(key)?.isBookable) {
          bookableCount++;
          lastBookable = new Date(cursor);
        }
        cursor = eventType.periodCountCalendarDays
          ? addCalendarDays(cursor, 1)
          : addBusinessDays(cursor, 1);
        checked++;
      }
      return {
        latestAllowedAt: endOfDayUTC(lastBookable ?? cursor),
        earliestAllowedAt: null,
      };
    }

    case "RANGE": {
      if (!eventType.periodStartDate || !eventType.periodEndDate) {
        return { latestAllowedAt: null, earliestAllowedAt: null };
      }
      return {
        earliestAllowedAt: startOfDayUTC(eventType.periodStartDate),
        latestAllowedAt: endOfDayUTC(startOfDayUTC(eventType.periodEndDate)),
      };
    }
  }

  return { latestAllowedAt: null, earliestAllowedAt: null };
}

/**
 * Convenience: is a specific candidate booking time outside the event
 * type's period bounds?
 *
 * Returns a reason code so callers can produce useful error messages.
 */
export function isOutOfPeriodBounds(
  bookingStart: ISODateTime,
  eventType: Pick<
    EventType,
    | "periodType"
    | "periodDays"
    | "periodCountCalendarDays"
    | "periodStartDate"
    | "periodEndDate"
    | "minimumBookingNotice"
  >,
  options?: { now?: Date },
): { outOfBounds: false } | { outOfBounds: true; reason: PeriodBoundReason } {
  const now = options?.now ?? new Date();
  const start = new Date(bookingStart);

  if (start.getTime() < now.getTime()) {
    return { outOfBounds: true, reason: "IN_THE_PAST" };
  }

  if (eventType.minimumBookingNotice && eventType.minimumBookingNotice > 0) {
    const earliest = new Date(
      now.getTime() + eventType.minimumBookingNotice * 60_000,
    );
    if (start.getTime() < earliest.getTime()) {
      return { outOfBounds: true, reason: "MIN_NOTICE_VIOLATED" };
    }
  }

  const limit = calculatePeriodLimit(eventType, { now });
  if (limit.earliestAllowedAt && start.getTime() < limit.earliestAllowedAt.getTime()) {
    return { outOfBounds: true, reason: "BEFORE_PERIOD_START" };
  }
  if (limit.latestAllowedAt && start.getTime() > limit.latestAllowedAt.getTime()) {
    return { outOfBounds: true, reason: "AFTER_PERIOD_END" };
  }

  return { outOfBounds: false };
}

export type PeriodBoundReason =
  | "IN_THE_PAST"
  | "MIN_NOTICE_VIOLATED"
  | "BEFORE_PERIOD_START"
  | "AFTER_PERIOD_END";
