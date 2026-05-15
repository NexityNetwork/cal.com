/**
 * Slot finder — the core of any Calendly-style booking page.
 *
 * EXTRACTED FROM:
 *   - packages/trpc/server/routers/viewer/slots/getSchedule.handler.ts
 *   - packages/features/availability/lib/getUserAvailability.ts
 *   - packages/features/schedules/lib/date-ranges.ts (slot iteration logic)
 *
 * WHAT IT DOES:
 *   Given a host's schedule, a list of busy times, and an event type, return
 *   every available start-time within a window. Honors:
 *     - Working hours + date overrides (handled by working-hours.ts)
 *     - Busy times (existing bookings + connected calendars)
 *     - Buffer time before/after each booking
 *     - Minimum booking notice
 *     - Slot increment (every 15min vs every 30min etc.)
 *     - Event duration
 *
 * NOT HANDLED HERE (caller's job):
 *     - Period bounds (use `period-bounds.ts`)
 *     - Booking frequency limits (use `booking-limits.ts`)
 *     - Fetching busy times from Composio / iCal / etc.
 *     - Race-condition lock when actually creating the booking
 *
 * COMPLEXITY: O(D log B) where D = available date ranges, B = busy times.
 * Sort once, sweep once.
 */

import type {
  AvailableSlot,
  BusyTime,
  EventType,
  SlotFinderInput,
  SlotFinderOutput,
} from "../types/booking";
import {
  buildAvailableRanges,
  type DateRange,
  subtractRanges,
} from "./working-hours";

/**
 * Apply buffer time to busy ranges so the slot finder treats
 * `[start - beforeBuffer, end + afterBuffer]` as unavailable.
 */
function applyBuffersToBusy(
  busy: BusyTime[],
  eventType: EventType,
): DateRange[] {
  const beforeMs = (eventType.beforeEventBuffer ?? 0) * 60_000;
  const afterMs = (eventType.afterEventBuffer ?? 0) * 60_000;
  return busy.map((b) => ({
    start: new Date(new Date(b.start).getTime() - beforeMs),
    end: new Date(new Date(b.end).getTime() + afterMs),
  }));
}

/**
 * Round a Date up to the next slot boundary.
 *
 * Slot boundaries are "every N minutes" from local midnight in the host's
 * timezone, where N = slotInterval (or duration if no interval set).
 *
 * Simplified: we use absolute Unix epoch boundaries. This is a small
 * deviation from cal.com which rounds to the host's local midnight. For
 * most users this is invisible (any tz is a whole-minute offset from UTC,
 * and slot intervals divide an hour cleanly). If you need exact
 * local-midnight alignment for half-hour-offset timezones (India,
 * Newfoundland), switch to deriving the boundary from the host's tz.
 */
function ceilToSlotBoundary(t: Date, slotIntervalMin: number): Date {
  const stepMs = slotIntervalMin * 60_000;
  const epoch = t.getTime();
  const remainder = epoch % stepMs;
  return remainder === 0 ? t : new Date(epoch + stepMs - remainder);
}

/**
 * Iterate slot starts within a single contiguous available range.
 *
 * Yields a slot whenever [start, start+duration] fits entirely inside the
 * available range.
 */
function* slotsInRange(
  range: DateRange,
  durationMinutes: number,
  slotIntervalMin: number,
): Generator<{ start: Date; end: Date }> {
  const durMs = durationMinutes * 60_000;
  const stepMs = slotIntervalMin * 60_000;
  let cursor = ceilToSlotBoundary(range.start, slotIntervalMin);

  while (cursor.getTime() + durMs <= range.end.getTime()) {
    yield {
      start: cursor,
      end: new Date(cursor.getTime() + durMs),
    };
    cursor = new Date(cursor.getTime() + stepMs);
  }
}

/**
 * Compute available slots.
 *
 * USAGE:
 *   const { slots } = findAvailableSlots({
 *     rangeStart: "2026-06-01T00:00:00Z",
 *     rangeEnd:   "2026-06-08T00:00:00Z",
 *     bookerTimezone: "America/Los_Angeles",
 *     schedule: {
 *       timezone: "Europe/Bucharest",
 *       workingHours: [
 *         { days: [1,2,3,4,5], startMinute: 9*60, endMinute: 17*60 }
 *       ],
 *       overrides: [
 *         { date: "2026-06-05", startMinute: 0, endMinute: 0 } // out
 *       ],
 *     },
 *     busyTimes: [
 *       { start: "2026-06-02T10:00:00Z", end: "2026-06-02T11:00:00Z" }
 *     ],
 *     eventType: {
 *       id: "...", slug: "30min", title: "...", userId: "...",
 *       durationMinutes: 30,
 *       slotInterval: 30,
 *       minimumBookingNotice: 60,        // book 1h ahead minimum
 *       periodType: "UNLIMITED",
 *       requiresConfirmation: false,
 *       locationType: "google_meet",
 *       hidden: false,
 *     }
 *   });
 *
 *   slots is sorted ascending.
 *
 * CALLER MUST: still run `isOutOfPeriodBounds()` and `checkBookingLimits()`
 * on the chosen slot before creating the booking.
 */
export function findAvailableSlots(input: SlotFinderInput): SlotFinderOutput {
  const { rangeStart, rangeEnd, schedule, busyTimes, eventType } = input;

  const diagnostics = {
    excludedByBusy: 0,
    excludedByBuffer: 0,
    excludedByMinNotice: 0,
    excludedByPeriodLimit: 0,
  };

  // 1. Enforce minimum booking notice — clip rangeStart forward.
  const minNoticeMs = (eventType.minimumBookingNotice || 0) * 60_000;
  const earliestAllowed = new Date(Date.now() + minNoticeMs);
  const effectiveStart = new Date(
    Math.max(new Date(rangeStart).getTime(), earliestAllowed.getTime()),
  );
  const effectiveEnd = new Date(rangeEnd);
  if (effectiveEnd.getTime() <= effectiveStart.getTime()) {
    return { slots: [], diagnostics };
  }

  // 2. Compute the host's available working-hour ranges.
  const availRanges = buildAvailableRanges(
    effectiveStart.toISOString(),
    effectiveEnd.toISOString(),
    schedule,
  );
  if (availRanges.length === 0) return { slots: [], diagnostics };

  // 3. Subtract busy times (with buffers applied).
  const bufferedBusy = applyBuffersToBusy(busyTimes, eventType);
  const free = subtractRanges(availRanges, bufferedBusy);

  // 4. Iterate slot starts within each free range.
  const interval = eventType.slotInterval || eventType.durationMinutes;
  const slots: AvailableSlot[] = [];
  for (const range of free) {
    for (const s of slotsInRange(range, eventType.durationMinutes, interval)) {
      slots.push({
        start: s.start.toISOString(),
        end: s.end.toISOString(),
      });
    }
  }

  return { slots, diagnostics };
}

/**
 * Group slots by date (in the booker's timezone) for the UI.
 *
 * The booker's slot picker typically shows: "Tuesday, June 3" → list of
 * times. This is convenience for that grouping.
 */
export function groupSlotsByDate(
  slots: AvailableSlot[],
  bookerTimezone: string,
): Map<string, AvailableSlot[]> {
  const out = new Map<string, AvailableSlot[]>();
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: bookerTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  for (const slot of slots) {
    const key = dtf.format(new Date(slot.start));
    const arr = out.get(key);
    if (arr) arr.push(slot);
    else out.set(key, [slot]);
  }
  return out;
}
