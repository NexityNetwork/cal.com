-- ============================================================================
-- Booking system schema additions for Ultron
-- ============================================================================
--
-- This migration extends Ultron's existing Supabase schema with the tables
-- needed to support Calendly-style booking pages.
--
-- Drop-in points:
--   - Reuses auth.users for ownership.
--   - Reuses public.events as the destination for confirmed bookings
--     (when source = 'booking') so the existing calendar UI shows them.
--   - Extends shared_links with resource_type='booking' so the existing
--     ShareModal handles password / OTP / expiry on booking links for free.
--   - Adds availability_schedules so each user can configure their working
--     hours (today they're implicitly Mon-Fri 9-5 in profile.timezone).
--
-- Compatible with the algorithms in `_extracted/algorithms/*`.
-- ============================================================================

-- ─── 1. availability_schedules ────────────────────────────────────────────
-- One row per (user, schedule). Most users will have exactly one schedule;
-- power users may have several (e.g. "Sales hours" vs "Coaching hours").
-- Each event_type points at one schedule via default_schedule_id.

CREATE TABLE IF NOT EXISTS public.availability_schedules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text NOT NULL DEFAULT 'Default',
  timezone      text NOT NULL,                  -- IANA, e.g. 'Europe/Bucharest'
  -- Stored as compact JSON to mirror the AvailabilitySchedule type:
  --   { workingHours: [{ days: [1,2,3,4,5], startMinute: 540, endMinute: 1020 }],
  --     overrides:    [{ date: 'YYYY-MM-DD', startMinute: 0, endMinute: 0 }] }
  -- Splitting into rows would be over-normalization for read-mostly data.
  working_hours jsonb NOT NULL DEFAULT '[]'::jsonb,
  overrides     jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS as_user_idx ON public.availability_schedules(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS as_one_default_per_user
  ON public.availability_schedules(user_id) WHERE is_default = true;

ALTER TABLE public.availability_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own schedules" ON public.availability_schedules;
CREATE POLICY "Users manage own schedules"
  ON public.availability_schedules
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS as_set_updated_at ON public.availability_schedules;
CREATE TRIGGER as_set_updated_at
  BEFORE UPDATE ON public.availability_schedules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─── 2. event_types ────────────────────────────────────────────────────────
-- One row per bookable thing a user offers. Ultron URL pattern:
--   /b/{user_slug}/{event_type_slug}
-- (a separate /b/* route, similar to /s/* for shares)

CREATE TABLE IF NOT EXISTS public.event_types (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  schedule_id              uuid REFERENCES public.availability_schedules(id) ON DELETE SET NULL,
  -- Public URL slug. Unique per-user (a user can have one "30min" slug).
  slug                     text NOT NULL,
  title                    text NOT NULL,
  description              text,
  duration_minutes         int  NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 1440),
  -- Time validation
  minimum_booking_notice   int  NOT NULL DEFAULT 0,   -- minutes
  -- Future-bookability window. Matches PeriodType in types/booking.ts
  period_type              text NOT NULL DEFAULT 'UNLIMITED'
    CHECK (period_type IN ('UNLIMITED','ROLLING','ROLLING_WINDOW','RANGE')),
  period_days              int,
  period_start_date        date,
  period_end_date          date,
  period_count_calendar_days boolean NOT NULL DEFAULT true,
  -- Buffers (minutes)
  before_event_buffer      int NOT NULL DEFAULT 0,
  after_event_buffer       int NOT NULL DEFAULT 0,
  -- Slot increment (defaults to duration if null)
  slot_interval            int,
  -- Booking frequency limits: { PER_DAY: 4, PER_WEEK: 15, ... } or null
  booking_limits           jsonb,
  -- Confirmation + location
  requires_confirmation    boolean NOT NULL DEFAULT false,
  location_type            text NOT NULL DEFAULT 'google_meet'
    CHECK (location_type IN ('google_meet','zoom','microsoft_teams','phone','in_person','custom')),
  location_value           text,
  -- Visibility
  hidden                   boolean NOT NULL DEFAULT false,
  -- Optional pairing with a shared_link for password/OTP-gated booking pages
  shared_link_id           uuid REFERENCES public.shared_links(id) ON DELETE SET NULL,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS et_user_slug_unique ON public.event_types(user_id, slug);
CREATE INDEX IF NOT EXISTS et_user_idx ON public.event_types(user_id);
CREATE INDEX IF NOT EXISTS et_visible_idx ON public.event_types(user_id) WHERE hidden = false;

ALTER TABLE public.event_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read non-hidden event types" ON public.event_types;
CREATE POLICY "Public read non-hidden event types"
  ON public.event_types FOR SELECT
  USING (hidden = false OR auth.uid() = user_id);
DROP POLICY IF EXISTS "Owners manage own event types" ON public.event_types;
CREATE POLICY "Owners manage own event types"
  ON public.event_types FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS et_set_updated_at ON public.event_types;
CREATE TRIGGER et_set_updated_at
  BEFORE UPDATE ON public.event_types
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─── 3. bookings ───────────────────────────────────────────────────────────
-- One row per booking. Distinct from public.events so we have first-class
-- booking-specific fields (attendee, uid for cancel links, status machine).
-- On ACCEPTED, we also write to public.events with source='booking' so the
-- existing schedule modal renders it. (Insert/update in the app layer —
-- avoiding the complexity of an after-insert trigger.)

CREATE TABLE IF NOT EXISTS public.bookings (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stable URL-safe uid for cancel/reschedule links. Never expose `id`.
  uid                     text UNIQUE NOT NULL,
  event_type_id           uuid NOT NULL REFERENCES public.event_types(id) ON DELETE CASCADE,
  user_id                 uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Attendee
  attendee_email          text NOT NULL,
  attendee_name           text NOT NULL,
  attendee_timezone       text NOT NULL,
  attendee_phone          text,
  attendee_responses      jsonb,
  attendee_notes          text,

  -- Time window
  start_time              timestamptz NOT NULL,
  end_time                timestamptz NOT NULL,

  status                  text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','ACCEPTED','REJECTED','CANCELLED','RESCHEDULED')),
  cancellation_reason     text,
  host_notes              text,

  location                text,
  meeting_url             text,

  -- Reschedule chain
  rescheduled_from_uid    text,
  rescheduled_to_uid      text,

  -- External calendar event ids (array of { provider, event_id })
  external_calendar_event_ids jsonb DEFAULT '[]'::jsonb,

  -- Optional pairing back to the shared_link the booker accessed through
  shared_link_id          uuid REFERENCES public.shared_links(id) ON DELETE SET NULL,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS b_user_window_idx
  ON public.bookings(user_id, start_time);
CREATE INDEX IF NOT EXISTS b_event_type_window_idx
  ON public.bookings(event_type_id, start_time);
CREATE INDEX IF NOT EXISTS b_active_idx
  ON public.bookings(event_type_id, status, start_time)
  WHERE status IN ('PENDING','ACCEPTED');
CREATE INDEX IF NOT EXISTS b_uid_idx ON public.bookings(uid);
CREATE INDEX IF NOT EXISTS b_attendee_email_idx ON public.bookings(attendee_email);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Hosts see their own bookings
DROP POLICY IF EXISTS "Hosts see own bookings" ON public.bookings;
CREATE POLICY "Hosts see own bookings"
  ON public.bookings FOR SELECT
  USING (auth.uid() = user_id);

-- Hosts can update/cancel their own bookings (status change, host_notes)
DROP POLICY IF EXISTS "Hosts manage own bookings" ON public.bookings;
CREATE POLICY "Hosts manage own bookings"
  ON public.bookings FOR UPDATE
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- INSERTs from the booking flow happen with the service role (booker is not
-- authenticated). No public INSERT policy here.

DROP TRIGGER IF EXISTS b_set_updated_at ON public.bookings;
CREATE TRIGGER b_set_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─── 4. Extend shared_links with the 'booking' resource type ───────────────
-- Drop the old CHECK constraint and add it back including 'booking'.
ALTER TABLE public.shared_links DROP CONSTRAINT IF EXISTS shared_links_resource_type_check;
ALTER TABLE public.shared_links ADD CONSTRAINT shared_links_resource_type_check
  CHECK (resource_type IN ('file','note','chat','agreement','deal','document','canvas','custom','booking'));

COMMENT ON CONSTRAINT shared_links_resource_type_check ON public.shared_links IS
  'booking-type rows let you wrap event_types with the existing share gate stack: password / OTP / expiry / max_views / agreement.';

-- ─── 5. Mirror confirmed bookings into public.events ───────────────────────
-- The schedule modal already reads public.events. Mirroring keeps a single
-- source of truth for the calendar UI. (Application code in api/bookings
-- should insert/update both rows when a booking is ACCEPTED, and delete the
-- mirror row when CANCELLED. Avoid a trigger so the logic stays explicit.)
--
-- Add a back-reference column to events so we can find the source booking.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS events_booking_id_idx ON public.events(booking_id)
  WHERE booking_id IS NOT NULL;

-- Make 'booking' a valid value for events.source / events.channel
-- (events table currently free-form text; no constraint to extend)

-- ─── 6. Comments ───────────────────────────────────────────────────────────
COMMENT ON TABLE public.availability_schedules IS
  'Per-user weekly working hours + per-date overrides. One row = one named schedule.';
COMMENT ON TABLE public.event_types IS
  'Bookable offerings. Public URL: /b/{user_slug}/{slug}.';
COMMENT ON TABLE public.bookings IS
  'Confirmed/pending bookings made via the public booking page. Mirror to events on ACCEPTED.';
