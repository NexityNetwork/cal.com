/**
 * Time validation utilities — past-time guard + min-notice + boundary check.
 *
 * EXTRACTED FROM:
 *   - packages/lib/isOutOfBounds.tsx (isTimeOutOfBounds,
 *     getPastTimeAndMinimumBookingNoticeBoundsStatus)
 *   - packages/features/bookings/lib/handleNewBooking/validateBookingTimeIsNotOutOfBounds.ts
 *
 * WHAT IT DOES:
 *   Cheap validation gates that should run before the expensive
 *   slot finder. Together with `period-bounds.ts`, these cover all the
 *   reasons cal.com rejects a booking by time alone.
 *
 * USE THESE IN THE BOOKING ENDPOINT:
 *
 *   const status = validateBookingTime({
 *     bookingStart: req.body.start,
 *     minimumBookingNotice: eventType.minimumBookingNotice,
 *   });
 *   if (!status.ok) return 400 with status.reason;
 */

import type { ISODateTime } from "../types/booking";

export type ValidationReason =
  | "IN_THE_PAST"
  | "MIN_NOTICE_VIOLATED"
  | "INVALID_FORMAT";

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: ValidationReason; detail?: string };

export interface ValidateBookingTimeInput {
  bookingStart: ISODateTime;
  /** Minutes — book at least this far in advance. */
  minimumBookingNotice?: number;
  /** Override "now" for testing. */
  now?: Date;
}

/**
 * Sub-second validation: ensures bookingStart is parseable, in the future,
 * and after the minimum booking notice window.
 */
export function validateBookingTime(
  input: ValidateBookingTimeInput,
): ValidationResult {
  const now = input.now ?? new Date();
  const start = new Date(input.bookingStart);

  if (Number.isNaN(start.getTime())) {
    return {
      ok: false,
      reason: "INVALID_FORMAT",
      detail: `Could not parse bookingStart: ${input.bookingStart}`,
    };
  }

  if (start.getTime() <= now.getTime()) {
    return { ok: false, reason: "IN_THE_PAST" };
  }

  const noticeMin = input.minimumBookingNotice ?? 0;
  if (noticeMin > 0) {
    const earliest = new Date(now.getTime() + noticeMin * 60_000);
    if (start.getTime() < earliest.getTime()) {
      return {
        ok: false,
        reason: "MIN_NOTICE_VIOLATED",
        detail: `Earliest bookable: ${earliest.toISOString()}`,
      };
    }
  }

  return { ok: true };
}
