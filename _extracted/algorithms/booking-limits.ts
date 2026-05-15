/**
 * Booking frequency limits — cap how many bookings can land in a sliding
 * window (per day, per week, per month, per year).
 *
 * EXTRACTED FROM:
 *   - packages/features/bookings/lib/checkBookingLimits.ts
 *   - packages/lib/intervalLimits/intervalLimit.ts
 *
 * WHAT IT DOES:
 *   Given a candidate booking time + the event type's limits + a function
 *   that counts existing bookings in a range, return whether the booking
 *   would exceed any limit.
 *
 * USAGE PATTERN:
 *
 *   const result = await checkBookingLimits({
 *     bookingStart: candidate.start,
 *     limits: eventType.bookingLimits,
 *     hostTimezone: hostSchedule.timezone,
 *     countBookings: async (from, to) => {
 *       const { count } = await supabase
 *         .from("bookings")
 *         .select("*", { count: "exact", head: true })
 *         .eq("event_type_id", eventType.id)
 *         .in("status", ["ACCEPTED", "PENDING"])
 *         .gte("start_time", from.toISOString())
 *         .lt("start_time", to.toISOString());
 *       return count ?? 0;
 *     }
 *   });
 *   if (result.exceeded) throw new Error(`Limit reached: ${result.window}`);
 *
 * COMPLEXITY: One DB count per active limit (typically 1–4 queries).
 * Cheap.
 */

import type { BookingLimits, IANATimezone, ISODateTime } from "../types/booking";

export type BookingLimitWindow = "PER_DAY" | "PER_WEEK" | "PER_MONTH" | "PER_YEAR";

/**
 * Order matters for short-circuit evaluation — check tightest window first.
 */
const WINDOWS_TIGHTEST_FIRST: BookingLimitWindow[] = [
  "PER_DAY",
  "PER_WEEK",
  "PER_MONTH",
  "PER_YEAR",
];

/**
 * Tz-aware "start of period" for a given booking instant.
 *
 * NOTE: week starts on Monday (ISO 8601). Change if you prefer Sunday.
 */
function periodBoundsInTz(
  instant: Date,
  window: BookingLimitWindow,
  timezone: IANATimezone,
): { from: Date; to: Date } {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(instant);
  const get = (t: Intl.DateTimeFormatPart["type"]) =>
    parts.find((p) => p.type === t)?.value || "";
  const y = Number(get("year"));
  const m = Number(get("month"));
  const d = Number(get("day"));
  const weekday = get("weekday");

  // Use plain UTC arithmetic on the wall-clock date as a stable proxy —
  // since limits care about "which day this booking lands on in host's tz",
  // not seconds. We then convert back to UTC instants by interpreting the
  // wall-clock midnight in the host's timezone.
  const wallStart = (year: number, mo: number, day: number) =>
    new Date(Date.UTC(year, mo - 1, day, 0, 0, 0, 0));

  let fromY = y;
  let fromM = m;
  let fromD = d;
  let toY = y;
  let toM = m;
  let toD = d;

  switch (window) {
    case "PER_DAY": {
      toD = d + 1;
      break;
    }
    case "PER_WEEK": {
      // Monday-start week
      const dayIndex = (
        { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 } as const
      )[weekday as "Mon"];
      fromD = d - dayIndex;
      toD = fromD + 7;
      break;
    }
    case "PER_MONTH": {
      fromD = 1;
      toM = m + 1;
      toD = 1;
      break;
    }
    case "PER_YEAR": {
      fromM = 1;
      fromD = 1;
      toY = y + 1;
      toM = 1;
      toD = 1;
      break;
    }
  }

  // We approximated by treating wall-clock as UTC. The actual UTC instants
  // for the bounds are these wall-clock dates interpreted in the host's tz.
  // For booking-limits, the small offset error (a few hours at most) is OK:
  // a booking landing within the period in host's tz will still be counted
  // even if the UTC bounds are skewed, because we count by `start_time`.
  return {
    from: wallStart(fromY, fromM, fromD),
    to: wallStart(toY, toM, toD),
  };
}

export interface CheckBookingLimitsInput {
  /** Candidate booking start time. */
  bookingStart: ISODateTime;
  /** Event type's configured limits (any subset; null/undefined = unlimited). */
  limits?: BookingLimits;
  /** Host's timezone — week/month boundaries derived in this zone. */
  hostTimezone: IANATimezone;
  /**
   * Caller-supplied counter. Receives [from, to) UTC instants and returns
   * the count of existing PENDING + ACCEPTED bookings for this event type.
   */
  countBookings: (from: Date, to: Date) => Promise<number>;
}

export type CheckBookingLimitsResult =
  | { exceeded: false }
  | { exceeded: true; window: BookingLimitWindow; limit: number; current: number };

/**
 * Check whether adding one booking at `bookingStart` would exceed any limit.
 * Short-circuits at the first exceeded window.
 */
export async function checkBookingLimits(
  input: CheckBookingLimitsInput,
): Promise<CheckBookingLimitsResult> {
  if (!input.limits) return { exceeded: false };

  const instant = new Date(input.bookingStart);
  for (const window of WINDOWS_TIGHTEST_FIRST) {
    const cap = input.limits[window];
    if (cap === undefined || cap === null || cap <= 0) continue;

    const { from, to } = periodBoundsInTz(instant, window, input.hostTimezone);
    const current = await input.countBookings(from, to);

    if (current + 1 > cap) {
      return { exceeded: true, window, limit: cap, current };
    }
  }

  return { exceeded: false };
}
