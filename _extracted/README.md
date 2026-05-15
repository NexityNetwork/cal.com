# Cal.com → Ultron Booking Extraction

This folder contains pure, framework-agnostic modules and integration plans
extracted from cal.com's scheduling engine, adapted for Ultron's existing
architecture (Next.js + Supabase + Composio + Cloudflare).

## Why this exists

Ultron already has:
- A polished calendar UI (`AgentActivitySidebar.tsx` → schedule modal,
  Day/Week/Month views, Morning/Afternoon/Night bands)
- Multi-source feed aggregation (`/api/calendar/feed`: events + scheduled
  tasks + posts + home_tasks + Google via Composio + Calendly + iCal)
- Google/Meet/Teams/Zoom calendar integrations via Composio
- A state-of-the-art generic share-link system (`shared_links` table +
  `ShareModal.tsx`) — password / expiry / email-required / OTP / view-limit /
  allow-list / agreements / view analytics

What Ultron is **missing**: a public **booking page** — the Calendly-style
`yourdomain.com/diana/30min` flow where an external person picks a slot,
books, and gets confirmation emails.

What cal.com solves that's hard to rebuild:
- Availability slot calculation across multiple calendars + timezones + DST
- Period bounds (ROLLING / ROLLING_WINDOW / RANGE future-limits)
- Booking frequency limits (per-day / per-week / per-month / per-year)
- Minimum booking notice + advance limit + buffer time logic
- Booking race condition handling

This extraction lifts those algorithms — stripped of Prisma/tRPC/cal.com's
DI container — and shows how to plug them into Ultron.

## Structure

```
_extracted/
├── README.md                  ← you are here
├── INTEGRATION.md             ← the main handoff doc (read this next)
├── types/
│   └── booking.ts             ← pure TS types (no Prisma)
├── algorithms/
│   ├── working-hours.ts       ← weekly schedule → tz-aware date ranges
│   ├── period-bounds.ts       ← ROLLING / RANGE future-limit check
│   ├── booking-limits.ts      ← per-period booking caps
│   ├── slot-finder.ts         ← compute available slots
│   └── time-validation.ts     ← min notice + past-time guards
├── api-shapes/
│   └── routes.md              ← proposed API surface for Ultron
├── supabase/
│   └── schema.sql             ← new tables + extensions for Ultron's DB
├── share-as-booking/
│   └── README.md              ← how the existing share-link system maps
│                                 to bookable links
└── cloudflare/
    ├── booking-reminders/     ← new worker for confirmation + reminder cron
    │   ├── wrangler.toml
    │   └── src/index.ts
    └── README.md              ← deployment plan for the new worker
```

## How to use this folder (for the next session)

1. **Start with `INTEGRATION.md`.** It's the map. Lays out:
   - Where each piece fits in Ultron's architecture
   - Build order (Supabase migrations → server logic → page route → worker)
   - Exact file paths in the Ultron repo for each new piece
   - Decisions already made + the open questions left

2. **Copy the algorithm modules into Ultron.** Suggested path:
   `src/lib/booking/` for the pure algorithms.

3. **Apply the Supabase migration.** Adds `event_types`, `bookings`, and
   extends `shared_links` with the `booking` resource_type.

4. **Build the API routes** per `api-shapes/routes.md`.

5. **Build the booking page** at `/b/[slug]` using the existing share-link
   gates (password / OTP / etc.) wrapped around the slot picker.

6. **Deploy the CF Worker** for booking confirmations and reminder emails.

## What's NOT in here (and why)

- **Cal.com's Booker UI components.** Ultron has its own design language
  (the screenshots show it's already much more polished than cal.com's UI).
  The slot-picker component is straightforward to build with Ultron's
  existing UI primitives + the slot algorithm in `algorithms/slot-finder.ts`.

- **Cal.com's calendar/video integration adapters.** Ultron uses Composio
  for Google Calendar / Meet / Teams / Zoom. Cal.com's app-store integrations
  don't apply.

- **Cal.com's workflow engine.** Out of scope. If/when Ultron needs
  workflow triggers (reminder N hours before, follow-up after, etc.), the
  CF Worker in `cloudflare/booking-reminders/` is the seed.

- **Cal.com's round-robin / team scheduling.** Personal-use first. Add if
  Ultron evolves toward team scheduling.

- **Cal.com's seat-based bookings, recurring bookings, instant bookings.**
  Add only if needed.

## License note

Cal.com's code is AGPLv3. Ultron is open source, so the dependency direction
is clean — Ultron-side modules adapted from cal.com remain AGPL-compatible.

Cal.com's `packages/features/ee/` is under a separate Commercial License.
**None of the code extracted here is from `ee/`** — only from AGPL-licensed
`packages/features/availability`, `packages/features/bookings/lib`,
`packages/features/schedules`, `packages/features/busyTimes`, and
`packages/lib`.
