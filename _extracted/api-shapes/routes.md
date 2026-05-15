# Proposed API surface for Ultron booking pages

These are the routes the next session should build inside Ultron's
`src/app/api/` tree. Each one points at the algorithm module that owns the
hard logic and the Supabase table it reads/writes.

The naming follows Ultron's existing conventions — REST-ish under
`/api/...`, server-side Supabase clients with auth cookie + service role
admin client for the public-facing booking flow.

## Event types — host-facing (authenticated)

### `GET /api/event-types`
List the authenticated user's event types.
- Auth: session
- Source: `event_types` where `user_id = auth.uid()`

### `POST /api/event-types`
Create a new event type.
- Auth: session
- Body: subset of `EventType` (without `id`, `userId`)
- Slug uniqueness enforced by `et_user_slug_unique` index → catch unique
  violation → 409.

### `PATCH /api/event-types/:id`
Update event type config (duration, buffers, limits, etc.).

### `DELETE /api/event-types/:id`
Soft-delete (or hard-delete — your call). Cascades to bookings via FK.

### `GET /api/event-types/:id/share`
Mint a `shared_link` of resource_type='booking' for this event type and
return the URL. Reuses `/api/share` infrastructure — see
`_extracted/share-as-booking/README.md`.

---

## Event types — booker-facing (public)

### `GET /api/public/event-types/:user_slug/:event_slug`
Public-read of an event type for the booking page.
- No auth (or behind a `shared_link` slug if gated).
- Returns: title, description, duration, owner display info (name, avatar).
- Hides: limits, internal flags.

### `GET /api/public/event-types/:user_slug/:event_slug/availability?from=...&to=...&tz=...`
Compute slots for a window. **This is the hot path** for the slot picker UI.

Server-side flow:
1. Load `event_types` + `availability_schedules` rows (admin client).
2. Fetch busy times in parallel:
   - From `bookings` table where `status IN ('PENDING','ACCEPTED')` and
     `event_type_id` matches OR `user_id` matches and overlaps window.
     (Match owner's full calendar, not just this event type, so a sales
     call doesn't double-book on top of a personal block.)
   - From Composio: `executeTool({ toolSlug: "GOOGLECALENDAR_EVENTS_LIST", ... })`
     (use `workspace_code` from profile as Composio user_id, like
     `/api/calendar/feed` already does).
   - From any iCal feed URL on `integrations` (already implemented in
     `/api/calendar/feed`; lift the same loop).
3. Hand off to `findAvailableSlots()` from
   `_extracted/algorithms/slot-finder.ts`.
4. Apply `isOutOfPeriodBounds()` to drop slots beyond the future limit.
   For `ROLLING_WINDOW`, you need a date-bookability map — easy: derive it
   from the slot list (any day with ≥1 slot is bookable).
5. Return `{ slots, owner: { name, avatar, timezone } }`.

**Caching**: this endpoint is hit on every booking page load. Two options:
- Cache the Composio response keyed by `(user_id, from, to)` for ~60s in CF
  KV (`ultron-shared-config` namespace already exists).
- Or use Next.js `revalidate: 60` if you don't mind serving slightly stale
  availability.

---

## Bookings — booker-facing (public, no auth)

### `POST /api/public/bookings`
Create a booking.

Server-side flow (atomicity matters — race conditions are real):

```
1. Parse + validate body (zod).
   { event_type_id, start_time, attendee: { email, name, tz, ... } }

2. Load event_type + availability_schedule (admin client).
   Reject 404 if hidden+no-auth-context, or if shared_link gate not passed.

3. validateBookingTime() from time-validation.ts.

4. isOutOfPeriodBounds() from period-bounds.ts.

5. checkBookingLimits() from booking-limits.ts.
   countBookings fn = a Supabase select on bookings where status in
   ('PENDING','ACCEPTED').

6. RACE-FREE SLOT VALIDATION:
   - BEGIN serializable transaction (or use a Postgres advisory lock keyed
     by event_type_id).
   - Re-query bookings overlapping [start, end].
   - Re-query Composio (busy times). If any overlap → 409 conflict.
   - INSERT booking row with status =
       'PENDING' if event_type.requires_confirmation
       'ACCEPTED' otherwise.
   - COMMIT.

7. POST-COMMIT (best-effort, in background):
   - Create Google Calendar event via Composio
     (toolSlug: 'GOOGLECALENDAR_EVENTS_INSERT' — verify exact slug in
     Composio's tool catalog). Store event id in
     bookings.external_calendar_event_ids.
   - Create Zoom/Meet/Teams meeting if location_type !== 'in_person'.
     For Google Meet: include `conferenceData` in the calendar insert.
   - If ACCEPTED: mirror to public.events row with channel='calendar',
     source='booking', booking_id=<id>.
   - Send confirmation email to attendee (Resend / SES).
   - Send notification email to host.
   - Trigger reminders by handing off to the booking-reminders CF worker
     (write to a queue or just rely on its scheduled scan).

8. Return: { booking_uid, cancel_url, reschedule_url, status }.
```

Why the lock: between step 5 and 7 another booker could grab the same slot.
Advisory lock per event_type_id is cheap and gives serializability without
a full transaction at SERIALIZABLE isolation. Pattern:

```sql
SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0));
-- ... rest of inserts in same txn
```

### `GET /api/public/bookings/:uid`
Show booking details — used by confirmation page and reschedule/cancel pages.
Auth: anyone holding the uid (which we generate as a 24-char random string,
unguessable).

### `POST /api/public/bookings/:uid/cancel`
Mark booking CANCELLED. Optional `reason` in body. Background: delete
mirror events row, remove external calendar event via Composio, send
cancellation emails.

### `POST /api/public/bookings/:uid/reschedule`
Two-step:
- Step A: return the same `availability` data as
  `/api/public/event-types/.../availability` with the current booking
  excluded from busy times.
- Step B: when user picks new slot, atomically create new booking
  (status = original.status), set rescheduled_to_uid on the old one,
  set rescheduled_from_uid on the new one, mark old as RESCHEDULED.

---

## Host-facing booking management (authenticated)

### `GET /api/bookings`
List the authenticated user's bookings with filters: status, date range.
Page-by-page; cap at 100/page.

### `PATCH /api/bookings/:id`
Update host_notes, or change status (CONFIRM / REJECT a PENDING booking).
On CONFIRM: trigger the same post-commit work as auto-accept.

---

## Where each piece lives in Ultron

```
src/
├── app/
│   ├── api/
│   │   ├── event-types/
│   │   │   ├── route.ts                    # GET, POST
│   │   │   ├── [id]/
│   │   │   │   ├── route.ts                # PATCH, DELETE
│   │   │   │   └── share/route.ts          # POST → mint shared_link
│   │   ├── public/
│   │   │   ├── event-types/[user]/[event]/
│   │   │   │   ├── route.ts                # GET
│   │   │   │   └── availability/route.ts   # GET
│   │   │   └── bookings/
│   │   │       ├── route.ts                # POST
│   │   │       └── [uid]/
│   │   │           ├── route.ts            # GET
│   │   │           ├── cancel/route.ts     # POST
│   │   │           └── reschedule/route.ts # POST
│   │   └── bookings/
│   │       ├── route.ts                    # GET
│   │       └── [id]/route.ts               # PATCH
│   ├── b/[username]/                       # public booking pages
│   │   ├── page.tsx                        # list user's event types
│   │   └── [event]/
│   │       ├── page.tsx                    # slot picker
│   │       ├── confirm/page.tsx            # form + submit
│   │       └── confirmed/[uid]/page.tsx    # confirmation
│   ├── bookings/[uid]/
│   │   ├── cancel/page.tsx                 # public cancel UI
│   │   └── reschedule/page.tsx             # public reschedule UI
│   └── dashboard/
│       ├── event-types/
│       │   ├── page.tsx                    # list event types
│       │   └── [id]/page.tsx               # edit
│       └── availability/page.tsx           # weekly hours + overrides
│
└── lib/
    └── booking/
        ├── types.ts                        # ← from _extracted/types/booking.ts
        ├── working-hours.ts                # ← from _extracted/algorithms/
        ├── slot-finder.ts                  # ←
        ├── period-bounds.ts                # ←
        ├── booking-limits.ts               # ←
        ├── time-validation.ts              # ←
        ├── busy-aggregator.ts              # NEW: fetches from supabase
        │                                   #      + Composio + iCal
        ├── booking-creator.ts              # NEW: the txn flow from above
        └── reminder-scheduler.ts           # NEW: writes to CF worker queue
```
