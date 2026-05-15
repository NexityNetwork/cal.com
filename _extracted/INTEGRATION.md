# Integration plan: lift cal.com booking → Ultron

**For**: the next Claude Code session (or human engineer) wiring this up.

---

## 0. Session Zero — read this first

### Where this extraction lives
- **Repo**: `nexitynetwork/cal.com`
- **Branch**: `claude/inspect-repo-dYEon`
- **Path**: `_extracted/`

The extraction is a self-contained folder. Clone the branch read-only or
inspect via the GitHub UI:
```bash
git clone --depth=1 --branch claude/inspect-repo-dYEon \
  https://github.com/NexityNetwork/cal.com.git /tmp/calcom-extraction
cd /tmp/calcom-extraction/_extracted
```

You'll do your actual writing in the **Ultron** repo
(`nexitynetwork/ultron`). This folder is your reference + paste source.

### Access preflight checklist

Before writing any code, confirm you can reach all of these. If something
is missing, ask the user before starting:

| Need | What it's for | How to verify |
|---|---|---|
| Ultron repo write access | All implementation | `git clone` + push to a feature branch |
| Supabase project (Ultron, id `rvugghuawrgdigabochq`, eu-north-1) | DB migrations, RLS testing | Open in Supabase dashboard, run `select 1` |
| Supabase service-role key | Booking creation as admin client | Env var `SUPABASE_SERVICE_ROLE_KEY` in Ultron's `.env.local` |
| Composio API key | Calendar event creation/lookup | Env var `COMPOSIO_API_KEY`. Test with `curl -H "x-api-key: $KEY" https://backend.composio.dev/api/v3/connected_accounts` |
| Cloudflare account (id `9329dd27959dfe8804ff27e1d5d50b29`) | Deploy `ultron-bookings` worker | `wrangler whoami` |
| Resend / email provider creds | Confirmation + reminder emails | Same provider Ultron uses for `src/lib/email/share-notifications.ts` |
| `WEBHOOK_SECRET` | Shared between Next.js app + CF worker | Existing var on Ultron — extend usage |

### First 30 minutes (recommended order)

1. **Read this doc end-to-end.** ~10 min.
2. **Skim `_extracted/README.md` and `_extracted/share-as-booking/README.md`.** ~5 min.
3. **Open `_extracted/types/booking.ts`** to internalize the type vocabulary the rest of the docs use. ~5 min.
4. **Read sections 1–3 of this doc** (what Ultron has, what's provided, build order). ~10 min.
5. **Run the sanity check below** before writing real code. ~5 min.

### Sanity check — verify the algorithms work in 30 seconds

Save this as a scratch file in Ultron (`scripts/test-slot-finder.ts`) and
run with `tsx`:

```ts
// Paste types/booking.ts and algorithms/*.ts contents OR symlink
// _extracted/algorithms/ into Ultron's src/lib/booking/ first.

import { findAvailableSlots } from "./src/lib/booking/slot-finder";

const result = findAvailableSlots({
  rangeStart: "2026-06-01T00:00:00Z",
  rangeEnd:   "2026-06-02T00:00:00Z",
  bookerTimezone: "America/Los_Angeles",
  schedule: {
    timezone: "Europe/Bucharest",
    workingHours: [
      { days: [1,2,3,4,5], startMinute: 9*60, endMinute: 17*60 }
    ],
    overrides: [],
  },
  busyTimes: [
    { start: "2026-06-01T10:00:00Z", end: "2026-06-01T11:00:00Z" }
  ],
  eventType: {
    id: "test", slug: "30min", title: "Test", userId: "test",
    durationMinutes: 30,
    minimumBookingNotice: 0,
    periodType: "UNLIMITED",
    requiresConfirmation: false,
    locationType: "google_meet",
    hidden: false,
  }
});

console.log(`Found ${result.slots.length} slots`);
console.log(result.slots.slice(0, 5));
```

Expected: 14-16 slots (Bucharest 9-17 = UTC 06-14 in summer, minus the
busy hour 10:00-11:00 UTC, in 30-minute increments). If you see roughly
this, the algorithms work.

### Cross-references you might need to open

- Cal.com source files the algorithms were extracted from (header comments
  in each `algorithms/*.ts` cite the exact paths). Don't read these unless
  debugging.
- Ultron source files cited in section 1 below — those are the integration
  points in your codebase.

---

## 1. What Ultron already has (DON'T duplicate)

Verified by reading branch `claude/review-cloudflare-infrastructure-tzDsV`
of `nexitynetwork/ultron`:

### Calendar UI
- **`src/components/AgentActivitySidebar.tsx`** — the Schedule modal at
  lines 6280–6850. Day/Week/Month views, Morning/Afternoon/Night bands,
  All/Events/Agents/Posts/Tasks filter, "New event" button.
- **Filter channels**: `calendar` / `agent` / `post` / `task` (see line
  6287). The booking-system events should appear under `calendar` with
  `source: "booking"`.

### Feed aggregation
- **`src/app/api/calendar/feed/route.ts`** — single endpoint that returns
  unified `FeedItem[]` for the schedule modal. Aggregates:
  - `events` table (manual + cached)
  - `scheduled_tasks` (agent runs)
  - `social_posts` (scheduled posts)
  - `home_tasks` (todos)
  - Google Calendar via Composio (`GOOGLECALENDAR_EVENTS_LIST`)
  - Calendly via direct API (stored encrypted token)
  - iCal feed URL (server-fetched + parsed)
- **`src/app/api/mc/calendar/route.ts`** — server-side Google Calendar
  writes for agents. Uses `refreshGoogleToken` (direct OAuth, not via
  Composio — interesting inconsistency; flag for future cleanup).

### Composio integration layer
- **`src/lib/composio.ts`** — wrapper around Composio v3 API. Key bits:
  - Tool slug constants for `googlecalendar`, `gmail`, `googlemeet`,
    `zoom`, `microsoft_teams`, `outlook`, etc.
  - `executeTool({ toolSlug, userId, arguments })` — universal call.
  - User's Composio id = `profile.workspace_code`.
- **`src/app/api/webhooks/composio/route.ts`** — receives Composio webhook
  events (connection status changes, etc.). HMAC-verified.

### Share-link system (★ relevant for booking pages)
- **`src/components/share/ShareModal.tsx`** — universal share UI used for
  files, notes, chats, agreements. Gate stack: password / expiry / email
  required / OTP (one-time code) / view limit / allow download / notify-on-view.
- **`supabase/migrations/20260415_shared_links.sql`** — 3 tables:
  - `shared_links` (the link itself + all gates)
  - `shared_link_views` (per-view audit log w/ ip_hash, geo, duration)
  - `shared_link_verifications` (OTP records, hashed codes, TTL)
- **`src/app/s/[slug]/page.tsx`** — public viewer that handles all gates.
- **`src/app/api/share/*`** — CRUD on share links.
- **`src/emails/transactional/share-{otp,viewed}.tsx`** — email templates.
- **`src/lib/email/share-notifications.ts`** — sender.

### Database
- **Supabase project `Ultron`** (id: `rvugghuawrgdigabochq`, region:
  eu-north-1)
- **`public.events`** table — schema in
  `supabase/migrations/calendar_events.sql`. Already has `channel`,
  `source`, `external_id`, `external_url`, `booking_id` is what we'll add.
- **`public.profiles.workspace_code`** = the user's Composio user_id.

### Cloudflare Workers
- 18 workers live. Most relevant: `ultron-cron` (cf-workers/ultron-cron/)
  — pattern is "Worker fires cron, POSTs to a Next.js route with shared
  WEBHOOK_SECRET". `ultron-cron-scheduler` is a sibling.
- 6 Workflows: `discovery-aggregator`, `milestones-evaluator`,
  `competitor-watcher`, `aeo-tracker`, `scraper`, `poller`.
- 4 D1 dbs (none calendar-related).
- 1 KV namespace: `ultron-shared-config`.
- 0 Queues.

### What's MISSING from Ultron (== the gap this extraction fills)
- Per-user availability schedule (working hours + date overrides)
- Bookable event types (durations, buffers, location config)
- Public booking page (slot picker + attendee form)
- Bookings table with status machine + uid-based cancel/reschedule links
- Booking creation flow with race-free slot validation
- Reminder emails on schedule
- Frequency limits (daily/weekly/monthly caps)
- ROLLING / RANGE future-window limits

Everything else exists.

---

## 2. What this extraction provides

```
_extracted/
├── README.md                 (top-level)
├── INTEGRATION.md            (this file)
├── types/
│   └── booking.ts            ← Pure TS types, no Prisma
├── algorithms/
│   ├── working-hours.ts      ← Schedule → date ranges (DST-aware, native Date)
│   ├── slot-finder.ts        ← Main slot computation
│   ├── period-bounds.ts      ← ROLLING / ROLLING_WINDOW / RANGE checks
│   ├── booking-limits.ts     ← Per-day/week/month/year caps
│   └── time-validation.ts    ← Past-time + min-notice gates
├── supabase/
│   └── schema.sql            ← 3 new tables + 1 constraint extension
├── api-shapes/
│   └── routes.md             ← Proposed Ultron API routes + flow diagrams
├── share-as-booking/
│   └── README.md             ← How shared_links covers booking-page gating
└── cloudflare/
    ├── README.md             ← CF additions overview
    └── booking-reminders/
        ├── wrangler.toml     ← Worker + Workflow config
        └── src/index.ts      ← Reminder Workflow skeleton
```

All algorithm modules have **zero runtime deps** (no Day.js, no Prisma, no
tRPC). Pure TypeScript + native Date + Intl. Drop into Ultron's
`src/lib/booking/` as-is.

---

## 3. Build order (recommended)

### Phase A — schema + types (1-2h)
1. Copy `_extracted/types/booking.ts` → `ultron/src/lib/booking/types.ts`.
2. Apply `_extracted/supabase/schema.sql` to the Ultron Supabase project.
   You can run it through the Supabase SQL editor or `supabase db push`.
   Adds: `availability_schedules`, `event_types`, `bookings` tables;
   extends `shared_links.resource_type` CHECK constraint to include
   `'booking'`; adds `events.booking_id` column.
3. Verify RLS policies work (try a public SELECT on event_types, etc.).

### Phase B — pure algorithm modules (no integration yet) (1h)
1. Copy all 5 files in `_extracted/algorithms/` → `ultron/src/lib/booking/`.
2. Write unit tests in `ultron/src/lib/booking/__tests__/`:
   - `slot-finder.test.ts` — happy path, busy times, buffers, DST day.
   - `period-bounds.test.ts` — each PeriodType.
   - `booking-limits.test.ts` — each window.
3. Verify with `pnpm test`.

### Phase C — host-facing API + dashboard pages (3-5h)
1. Create event-types CRUD routes (see `_extracted/api-shapes/routes.md`).
2. Create availability page at `app/dashboard/availability/page.tsx`.
   Reuse existing UI primitives. State = the `AvailabilitySchedule` type.
3. Create event-types list + edit pages at
   `app/dashboard/event-types/`.

### Phase D — public booking flow (3-5h)
1. `GET /api/public/event-types/[user]/[event]/availability` — wires up
   `findAvailableSlots`. Fetches busy times in parallel:
   - `bookings` table for this user where overlaps window
   - Composio `GOOGLECALENDAR_EVENTS_LIST` (same call pattern as
     `/api/calendar/feed`)
   - iCal feed if user has one in `integrations`
2. `POST /api/public/bookings` — the race-free create flow. Use a Postgres
   advisory lock keyed by `event_type_id` to prevent double-booking.
3. Public pages at `app/b/[username]/[event]/`:
   - `page.tsx`: slot picker. Renders the available slots list, grouped
     by date in the booker's timezone (use `groupSlotsByDate` from
     `slot-finder.ts`).
   - `confirm/page.tsx`: attendee form (name, email, optional fields).
   - `confirmed/[uid]/page.tsx`: success page with cancel/reschedule
     links.
4. `app/bookings/[uid]/cancel/page.tsx` + `/reschedule/page.tsx`.

### Phase E — share-link gated booking (1-2h)
1. In `app/s/[slug]/page.tsx`, dispatch to `<BookingPage>` when
   `resource_type === 'booking'` (see `share-as-booking/README.md`).
2. Test the gate stack: create a `shared_links` row with
   `resource_type='booking'`, `password_hash` set, `resource_id` = an
   event type id. Visit `/s/{slug}` — should require password before
   showing slot picker.
3. The existing `/api/share/[id]` view-tracker fires for free.

### Phase F — Cloudflare reminders (2-3h)
1. `cd cf-workers && cp -r _extracted/cloudflare/booking-reminders .`
2. Set secrets per `cloudflare/README.md`.
3. `cd booking-reminders && wrangler deploy`.
4. In `POST /api/public/bookings`, after the booking row is committed,
   POST to the worker:
   ```ts
   await fetch(`${process.env.BOOKING_REMINDERS_URL}/schedule-reminder`, {
     method: "POST",
     headers: {
       Authorization: `Bearer ${process.env.WEBHOOK_SECRET}`,
       "Content-Type": "application/json",
     },
     body: JSON.stringify({
       bookingId, bookingUid, attendeeEmail, attendeeName,
       hostEmail, startTime, endTime, eventTitle, meetingUrl,
     }),
   });
   ```
5. Test by creating a booking 2 minutes in the future and watching the
   Workflow logs in the CF dashboard.

### Phase G — Composio calendar event creation (1-2h)
1. Verify the exact Composio tool slug for Google Calendar insert. Most
   likely `GOOGLECALENDAR_EVENTS_INSERT` based on naming pattern in
   `src/lib/composio.ts`. If not, list tools via Composio API.
2. After a booking commits, call `executeTool({ toolSlug: ..., userId:
   workspaceCode, arguments: { calendarId: 'primary', summary, start,
   end, attendees, conferenceData } })`.
3. Store the returned event id in `bookings.external_calendar_event_ids`.
4. On cancel, call `GOOGLECALENDAR_EVENTS_DELETE` with the stored event id.

### Phase H — polish (variable)
- Confirmation/cancel email templates (mirror `share-otp.tsx` style).
- Time zone selector on booking page (default to browser tz).
- Calendar invite (.ics) attachment in confirmation email.
- Host dashboard view of upcoming bookings.

**Total estimate: 12-20 hours of focused work.** No dependency hell, no
heroic refactors, all pieces additive.

---

## 4. Decisions already made (vs. cal.com)

| Decision | Cal.com | Here | Reason |
|---|---|---|---|
| ORM | Prisma | Supabase JS client | Match Ultron's stack |
| Date lib | Day.js + tz/utc plugins | Native Date + Intl | Smaller, faster, sufficient |
| Schedule storage | Normalized rows | JSONB columns | Simpler; read-mostly |
| Booking lock | Various (Redis, optimistic, advisory) | PG advisory_xact_lock | Single-DB, no Redis dep |
| Workflows engine | Custom in-app | CF Workflows | Already in Ultron's stack |
| EE features (workflows, round-robin, attribute routing) | Yes | OUT OF SCOPE | Add only if needed |
| `getSchedule.handler` 800+ line tRPC handler | Yes | Replaced by 5 small modules | Cal.com handler does everything (cache, OOO, holidays, teams) — overkill for v1 |
| Booker UI | `packages/features/bookings/Booker/` (heavy React) | Build from Ultron's design system | Ultron's UI is already better |

---

## 5. Open questions for human review

These are decisions the next session can make confidently, but flagging
them for awareness:

1. **Mirror to `events` table on ACCEPTED, or have schedule modal read
   `bookings` directly?**
   - Mirror approach is simpler for the existing schedule modal but
     creates two sources of truth.
   - Reading `bookings` directly in the feed aggregator (add a new branch
     in `/api/calendar/feed`) is more correct but means another query.
   - **Default**: extend the feed aggregator to query `bookings` (status
     IN PENDING, ACCEPTED) with `channel='calendar', source='booking'`.
     Skip the `events` mirror. Simpler.

2. **Public route prefix: `/b/{user}/{slug}` or reuse `/{user}/{slug}`?**
   - Cal.com uses `/{username}/{slug}`. Cleaner URLs.
   - Ultron's existing routes might conflict.
   - **Default**: `/b/{username}/{slug}` to avoid namespace collisions.
     Less Calendly-pretty but unambiguous.

3. **Host display name on public page?**
   - Probably from `profiles.display_name` or similar — verify the
     existing column name in Ultron's profiles table.
   - Avatar from where? Profiles? Supabase Storage?

4. **Email provider?**
   - Existing share emails go through whatever Ultron uses
     (`src/lib/email/share-notifications.ts`). Check there and reuse.
   - The CF worker skeleton uses Resend; replace if needed.

5. **Time-zone of the host when no profile.timezone is set?**
   - Default to "UTC" or to "Europe/Bucharest" (org default)?
   - Cal.com defaults to a hardcoded "America/Los_Angeles" which is wrong
     for our user base. Use UTC as the safe default.

6. **Should bookings count against existing scheduled_tasks limits?**
   - No. They're a different rate. Each event_type has its own
     `booking_limits` JSONB.

---

## 6. License + provenance

All extracted code derives from AGPLv3 packages in cal.com:
- `packages/lib/availability.ts`
- `packages/lib/isOutOfBounds.tsx`
- `packages/features/availability/lib/getUserAvailability.ts`
- `packages/features/bookings/lib/checkBookingLimits.ts`
- `packages/features/bookings/lib/handleNewBooking/validateBookingTimeIsNotOutOfBounds.ts`
- `packages/features/schedules/lib/date-ranges.ts`

**None of `packages/features/ee/` was touched.** That code is under
cal.com's Commercial License and we're not using it.

Ultron is open source, so AGPL is fine. If Ultron ever pivots to closed
source, this extraction stays AGPL — that's a copyright-law constraint,
not a code constraint.

---

## 7. Files in this folder, recap

| File | Purpose | Lines |
|---|---|---|
| `README.md` | Index for this folder | 80 |
| `INTEGRATION.md` | **This doc** | 350+ |
| `types/booking.ts` | Pure TS types | 220 |
| `algorithms/working-hours.ts` | Schedule → ranges, DST-aware | 230 |
| `algorithms/slot-finder.ts` | Main slot computation | 200 |
| `algorithms/period-bounds.ts` | Future-limit checks | 210 |
| `algorithms/booking-limits.ts` | Per-period frequency caps | 170 |
| `algorithms/time-validation.ts` | Past-time + min-notice | 70 |
| `supabase/schema.sql` | DDL: 3 tables + constraint + column | 175 |
| `api-shapes/routes.md` | Endpoint contracts + flow diagrams | 200 |
| `share-as-booking/README.md` | Reuse shared_links for booking gating | 130 |
| `cloudflare/README.md` | CF additions overview | 100 |
| `cloudflare/booking-reminders/wrangler.toml` | Worker + Workflow config | 30 |
| `cloudflare/booking-reminders/src/index.ts` | Reminder Workflow skeleton | 230 |

Total: ~2,300 lines of TS/SQL/Markdown, all consumable in one session.

---

## 8. The 5-minute version

If you're starting fresh and just want the gist:

1. Run `supabase/schema.sql` to add 3 tables to Ultron.
2. Copy `types/booking.ts` + `algorithms/*` into
   `ultron/src/lib/booking/`.
3. Build `/api/public/event-types/.../availability` that calls
   `findAvailableSlots()` after fetching busy times from Supabase +
   Composio (same Composio call as `/api/calendar/feed`).
4. Build `/api/public/bookings` POST with a Postgres advisory lock for
   race-free create.
5. Build `/b/[user]/[event]/page.tsx` with a slot picker UI using
   Ultron's existing design primitives.
6. Deploy `cf-workers/booking-reminders` to handle T-24h/T-1h reminders.

Done. You have a Calendly-class booking system that integrates seamlessly
with Ultron's existing calendar UI, share-link gates, and Composio
integrations.
