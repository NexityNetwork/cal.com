/**
 * Pure TypeScript types for the booking system — no Prisma, no tRPC.
 *
 * These are the boundary types passed between the algorithms in `_extracted/algorithms/`
 * and the eventual Ultron implementation. They are intentionally minimal:
 * each algorithm gets exactly the data shape it needs, nothing more.
 *
 * Naming note: kept short / generic. Adapt to Ultron's naming conventions
 * (`Event`, `Booking`, `EventType`) when porting.
 */

// ─── Time primitives ─────────────────────────────────────────────────────────

/** Minutes from midnight (0–1439). Used in working hours. */
export type MinutesOfDay = number;

/** ISO 8601 datetime string. Always include timezone offset (`Z` or `±HH:MM`). */
export type ISODateTime = string;

/** IANA timezone identifier, e.g. "America/New_York", "Europe/Bucharest". */
export type IANATimezone = string;

/** Date-only string `YYYY-MM-DD`. */
export type ISODate = string;

/** Day of week: 0 = Sunday, 6 = Saturday. Matches JS `Date.prototype.getDay()`. */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// ─── Working hours / schedule ────────────────────────────────────────────────

/**
 * A recurring weekly availability slot. Times are minutes-from-midnight in
 * the user's timezone.
 *
 * Example: Monday + Wednesday + Friday, 9:00 to 17:00 →
 *   { days: [1, 3, 5], startMinute: 540, endMinute: 1020 }
 */
export interface WorkingHours {
  days: DayOfWeek[];
  startMinute: MinutesOfDay;
  endMinute: MinutesOfDay;
}

/**
 * A one-off override that replaces working hours for a specific date.
 * `startMinute === endMinute === 0` means "unavailable all day".
 */
export interface DateOverride {
  date: ISODate;
  startMinute: MinutesOfDay;
  endMinute: MinutesOfDay;
}

/**
 * Full user availability schedule: weekly recurring + date overrides + timezone.
 */
export interface AvailabilitySchedule {
  timezone: IANATimezone;
  workingHours: WorkingHours[];
  overrides: DateOverride[];
}

// ─── Busy times (from connected calendars / existing bookings) ───────────────

/**
 * A time range during which the user is busy. Sources can be: existing
 * bookings, Google Calendar events (via Composio), iCal feed events, etc.
 */
export interface BusyTime {
  start: ISODateTime;
  end: ISODateTime;
  /** Origin tag for debugging / UI hints. */
  source?: "booking" | "google" | "calendly" | "ical" | "outlook" | "other";
  /** External event id (e.g. Google Calendar event id), for dedupe. */
  externalId?: string;
}

// ─── Event types ─────────────────────────────────────────────────────────────

/**
 * Period type for future-bookability limit. From cal.com.
 *
 * - UNLIMITED: no future-date limit
 * - ROLLING: bookable up to N days from today
 * - ROLLING_WINDOW: rolling window that skips fully-busy days
 * - RANGE: bookable only between fixed start/end dates
 */
export type PeriodType = "UNLIMITED" | "ROLLING" | "ROLLING_WINDOW" | "RANGE";

/**
 * One bookable "event type" owned by a user. The booker (external person)
 * picks one of the user's event types to book.
 *
 * Example: Diana has event types ["15min intro", "30min sync", "1h deep work"].
 */
export interface EventType {
  id: string;
  /** URL slug, e.g. "30min". */
  slug: string;
  /** Human-readable title shown to the booker. */
  title: string;
  /** Markdown description shown on the booking page. */
  description?: string;
  /** Slot duration in minutes. */
  durationMinutes: number;
  /** Owner user id (Ultron auth.users.id). */
  userId: string;

  // ── Booking constraints ────────────────────────────────────────────────
  /** Minimum notice in minutes — book at least this far in advance. */
  minimumBookingNotice: number;
  /** Future limit: type + days/range. */
  periodType: PeriodType;
  /** For ROLLING / ROLLING_WINDOW. */
  periodDays?: number;
  /** For RANGE. */
  periodStartDate?: ISODate;
  /** For RANGE. */
  periodEndDate?: ISODate;
  /** If true: counts calendar days. If false: counts business days. */
  periodCountCalendarDays?: boolean;

  // ── Buffer time ────────────────────────────────────────────────────────
  /** Buffer in minutes before each booking (no other booking can land here). */
  beforeEventBuffer?: number;
  /** Buffer after each booking. */
  afterEventBuffer?: number;

  // ── Slot increment ─────────────────────────────────────────────────────
  /**
   * Slot interval in minutes. Controls how granular the slot picker is.
   * E.g. duration=30, slotInterval=30 → slots every 30min on the half hour.
   * E.g. duration=30, slotInterval=15 → slots every 15min.
   * Defaults to durationMinutes if unset.
   */
  slotInterval?: number;

  // ── Frequency limits (per-period booking caps) ─────────────────────────
  /**
   * Optional cap on bookings per period. Sliding window per
   * day/week/month/year. Throws if the booker tries to book a slot that
   * would exceed the cap for the period containing the slot's start.
   */
  bookingLimits?: BookingLimits;

  // ── Confirmation + location ────────────────────────────────────────────
  /** If true: booking is held PENDING until host confirms. */
  requiresConfirmation: boolean;
  /** Default meeting location. Composio toolkit slug or static string. */
  locationType:
    | "google_meet"
    | "zoom"
    | "microsoft_teams"
    | "phone"
    | "in_person"
    | "custom";
  /** Free-form, e.g. phone number / office address for non-video types. */
  locationValue?: string;

  // ── Access ─────────────────────────────────────────────────────────────
  /** Hidden = no public listing on `/[username]`, only direct link works. */
  hidden: boolean;
  /**
   * If set: this event type is gated by a shared_links row. The booking page
   * inherits all gates (password / OTP / expiry / max-views).
   */
  sharedLinkId?: string;
}

// ─── Booking limits ──────────────────────────────────────────────────────────

/**
 * Sliding-window booking caps. Keys correspond to sliding window units.
 * `null` / undefined = no limit for that window.
 *
 * Example: { PER_DAY: 4, PER_WEEK: 15 } = max 4/day, max 15/week.
 */
export interface BookingLimits {
  PER_DAY?: number;
  PER_WEEK?: number;
  PER_MONTH?: number;
  PER_YEAR?: number;
}

// ─── Computed slots ──────────────────────────────────────────────────────────

/**
 * One available time slot returned by the slot finder.
 * Booker UI renders these as the clickable time chips.
 */
export interface AvailableSlot {
  /** Slot start (ISO with timezone). */
  start: ISODateTime;
  /** Slot end. start + eventType.durationMinutes. */
  end: ISODateTime;
}

// ─── Bookings ────────────────────────────────────────────────────────────────

export type BookingStatus =
  | "PENDING" // requires host confirmation
  | "ACCEPTED" // confirmed
  | "REJECTED" // host rejected (or auto-rejected by limit)
  | "CANCELLED" // either side cancelled
  | "RESCHEDULED"; // superseded by another booking

/**
 * A booking is what gets written to the database when someone books a slot.
 * One booking = one occurrence (no recurrence support in this MVP).
 */
export interface Booking {
  id: string;
  /** Stable UID used in confirmation/cancel/reschedule URLs. Cryptographic. */
  uid: string;

  eventTypeId: string;
  /** Host (owner) user id. */
  userId: string;

  /** Booker (external person who clicked the booking link). */
  attendee: BookingAttendee;

  /** Time window. */
  startTime: ISODateTime;
  endTime: ISODateTime;

  status: BookingStatus;

  /** Resolved meeting location at booking-time. */
  location?: string;
  /** Filled after the calendar event is created. */
  meetingUrl?: string;

  /** If this booking superseded another (reschedule). */
  rescheduledFromUid?: string;
  /** If this booking was rescheduled by another. */
  rescheduledToUid?: string;

  /** Free-form notes the booker added during booking. */
  attendeeNotes?: string;
  /** Free-form notes the host can add post-booking. */
  hostNotes?: string;

  /** External calendar event ids (Google/etc.) for cleanup on cancel. */
  externalCalendarEventIds?: { provider: string; eventId: string }[];

  /** If booking was created via a shared_link, track which one. */
  sharedLinkId?: string;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface BookingAttendee {
  email: string;
  name: string;
  timezone: IANATimezone;
  /** Optional fields the host might ask for. */
  phone?: string;
  /** Custom form responses keyed by field id. */
  responses?: Record<string, string | number | boolean | string[]>;
}

// ─── Inputs to algorithms ────────────────────────────────────────────────────

/**
 * Everything `findAvailableSlots` needs. Algorithm has zero side effects —
 * caller fetches busy times from Composio / Supabase / etc. and hands them in.
 */
export interface SlotFinderInput {
  /** The window the caller wants slots for. */
  rangeStart: ISODateTime;
  rangeEnd: ISODateTime;
  /** Booker's timezone — slot starts are returned in this tz's offset. */
  bookerTimezone: IANATimezone;

  /** Host availability + timezone. */
  schedule: AvailabilitySchedule;

  /** Aggregated busy times for the host. */
  busyTimes: BusyTime[];

  /** Event type config — drives duration, buffers, interval. */
  eventType: EventType;
}

export interface SlotFinderOutput {
  slots: AvailableSlot[];
  /** Diagnostics — useful for UI ("3 days fully busy", "out of working hours"). */
  diagnostics?: {
    excludedByBusy: number;
    excludedByBuffer: number;
    excludedByMinNotice: number;
    excludedByPeriodLimit: number;
  };
}
