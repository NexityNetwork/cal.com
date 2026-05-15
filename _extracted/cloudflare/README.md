# Cloudflare additions for the booking system

The existing `ultron-cron` worker pattern already covers Ultron's
scheduled-task needs (lifecycle emails + job reconciler). We extend it
with one **new dedicated worker** for booking-specific async work, plus
**one Workflow** for the reminder pipeline.

## What needs to run on Cloudflare for the booking system

| Concern | Where it should run | Why |
|---|---|---|
| Booking confirmation email | Inline in `/api/public/bookings` POST | Synchronous; user sees "Booked!" only after email queued. |
| Calendar event creation via Composio | Inline best-effort, retry queued | Synchronous attempt; falls back to retry queue on failure. |
| **Reminder emails** (e.g. 24h before, 1h before) | **CF Workflow** (durable, retryable) | Fire-and-forget at booking time; survive worker restarts. |
| **Reschedule/cancel link cleanup** (post-event) | CF Cron Trigger | Once-daily sweep. |
| **No-show detection** (T+15min after start) | CF Workflow per booking | Each booking schedules its own no-show task. |
| **Calendar polling** (for users who haven't authorized webhook) | CF Cron Trigger every 5min | Refresh busy times. |

## Proposed new resources

### Worker: `ultron-bookings`

A single worker that handles:
- **Cron trigger** (5min): refresh Composio calendar busy-times into a
  Supabase cache table for fast slot-finder reads.
- **Cron trigger** (daily): clean up archived shared_links past expiry, run
  retention.
- **Fetch handler** for synchronous calls from the Next.js app:
  `POST /schedule-reminder` to enqueue a CF Workflow run for a new booking.

See `booking-reminders/` directory for the wrangler.toml + index.ts.

### Workflow: `BookingReminderWorkflow`

One run per booking. Steps:
1. Sleep until reminder time (24h before start_time)
2. Check booking is still ACCEPTED + not cancelled (re-read from Supabase)
3. Send reminder email to attendee
4. Send reminder email to host (optional)
5. Sleep until 1h before
6. Check + send 1h-out reminder
7. Sleep until 15min after start_time
8. Mark as NO_SHOW if status still PENDING (auto-cancel for some flows)

CF Workflows are durable, so a worker restart or platform issue resumes
where it left off. Perfect for "do thing in the future" jobs without a
dedicated queue + scheduler.

## Why not just extend `ultron-cron`?

The existing `ultron-cron` follows a "POST to Next.js app" pattern for
each cron. That's fine for daily lifecycle emails, but reminders need:
- **Per-booking scheduling** (Workflows give us this)
- **Retry semantics with exponential backoff** (Workflows give us this)
- **No coordination with Next.js for the timing** (cheaper)

Keep `ultron-cron` for what it does. Add `ultron-bookings` for booking-specific
async + reminders.

## Local development

The other CF session is working on something else — `ultron-bookings`
doesn't collide with any existing worker name. Confirmed via `wrangler
list` and the inventory above.

When ready to deploy:
```
cd cf-workers/ultron-bookings
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put COMPOSIO_API_KEY
wrangler secret put RESEND_API_KEY  (or whichever email provider)
wrangler secret put WEBHOOK_SECRET  (shared with the Next.js app)
wrangler deploy
```

The other Claude session will continue working without interference.

## Future: workflows beyond reminders

Cal.com has a full workflow engine (send email/SMS at trigger X, time
offset Y, with template Z). We don't need it for v1, but the `Workflow`
primitive in CF maps cleanly:

- Each cal.com-style workflow rule = one CF Workflow definition
- Per-booking instantiation = one CF Workflow run
- The Workflow's `step.sleep()` is the offset
- The Workflow's body sends the email via Resend / Brevo

If/when Ultron grows there, we already have the pattern.
