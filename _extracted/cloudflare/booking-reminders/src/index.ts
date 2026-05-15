/**
 * ultron-bookings — booking reminders worker + workflow
 *
 * Three entry points:
 *   1. `fetch`   — Next.js app POSTs here to schedule a reminder workflow
 *                   for a newly-created booking.
 *   2. `scheduled` — handles cron triggers (busy-time cache refresh, sweep).
 *   3. `BookingReminderWorkflow` — per-booking durable workflow that
 *                                  sleeps and sends reminders at T-24h /
 *                                  T-1h / T+15min (no-show check).
 *
 * Skeleton — fill in the email-sending and Supabase-reading code. Imports
 * the cloudflare:workers Workflow types.
 */

import {
  WorkflowEntrypoint,
  type WorkflowStep,
  type WorkflowEvent,
} from "cloudflare:workers";

// ─── Bindings + env ──────────────────────────────────────────────────────────

interface Env {
  // Workflow binding
  BOOKING_REMINDER: Workflow;

  // Vars
  ULTRON_BASE_URL: string;
  SUPABASE_URL: string;

  // Secrets
  SUPABASE_SERVICE_ROLE_KEY: string;
  COMPOSIO_API_KEY: string;
  RESEND_API_KEY: string;
  WEBHOOK_SECRET: string;
}

// Cloudflare's Workflow primitive — typed loosely here, the actual types
// come from `@cloudflare/workers-types`.
interface Workflow {
  create(options: { id?: string; params: BookingReminderParams }): Promise<{ id: string }>;
}

// ─── HTTP entry: POST /schedule-reminder ─────────────────────────────────────

interface BookingReminderParams {
  bookingId: string;
  bookingUid: string;
  attendeeEmail: string;
  attendeeName: string;
  hostEmail: string;
  startTime: string; // ISO
  endTime: string;
  eventTitle: string;
  meetingUrl?: string;
}

export default {
  /**
   * The Next.js POST /api/public/bookings handler hits this endpoint after
   * a successful booking. We start a Workflow run that will sleep until
   * each reminder is due.
   *
   * Auth: shared WEBHOOK_SECRET via Bearer token.
   */
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method !== "POST" || url.pathname !== "/schedule-reminder") {
      return new Response("Not found", { status: 404 });
    }

    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${env.WEBHOOK_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    const params = (await req.json()) as BookingReminderParams;
    const instance = await env.BOOKING_REMINDER.create({
      id: `reminder-${params.bookingUid}`,
      params,
    });
    return Response.json({ ok: true, instanceId: instance.id });
  },

  /**
   * Cron handler. Two schedules in wrangler.toml:
   *   "*/5 * * * *" → refresh busy-time cache (optional)
   *   "0 3 * * *"   → daily shared_links retention sweep
   */
  async scheduled(event: ScheduledController, env: Env): Promise<void> {
    if (event.cron === "*/5 * * * *") {
      await refreshBusyTimeCache(env);
    } else if (event.cron === "0 3 * * *") {
      await sweepSharedLinks(env);
    }
  },
};

// ─── Workflow: BookingReminderWorkflow ───────────────────────────────────────

export class BookingReminderWorkflow extends WorkflowEntrypoint<
  Env,
  BookingReminderParams
> {
  async run(event: WorkflowEvent<BookingReminderParams>, step: WorkflowStep) {
    const p = event.payload;
    const startTime = new Date(p.startTime);

    // ── Step 1: T-24h reminder ────────────────────────────────────────────
    const tMinus24h = new Date(startTime.getTime() - 24 * 60 * 60_000);
    if (tMinus24h.getTime() > Date.now()) {
      await step.sleepUntil("wait-24h-before", tMinus24h);
      await step.do("send-24h-reminder", async () => {
        const ok = await assertBookingStillActive(p.bookingId, this.env);
        if (!ok) throw new Error("Booking no longer active — skip remaining steps");
        await sendReminderEmail({
          to: p.attendeeEmail,
          recipientName: p.attendeeName,
          eventTitle: p.eventTitle,
          startTime: p.startTime,
          meetingUrl: p.meetingUrl,
          when: "tomorrow",
          env: this.env,
        });
      });
    }

    // ── Step 2: T-1h reminder ────────────────────────────────────────────
    const tMinus1h = new Date(startTime.getTime() - 60 * 60_000);
    if (tMinus1h.getTime() > Date.now()) {
      await step.sleepUntil("wait-1h-before", tMinus1h);
      await step.do("send-1h-reminder", async () => {
        const ok = await assertBookingStillActive(p.bookingId, this.env);
        if (!ok) throw new Error("Booking no longer active — skip");
        await sendReminderEmail({
          to: p.attendeeEmail,
          recipientName: p.attendeeName,
          eventTitle: p.eventTitle,
          startTime: p.startTime,
          meetingUrl: p.meetingUrl,
          when: "in 1 hour",
          env: this.env,
        });
      });
    }

    // ── Step 3: No-show check at T+15min ─────────────────────────────────
    const tPlus15m = new Date(startTime.getTime() + 15 * 60_000);
    if (tPlus15m.getTime() > Date.now()) {
      await step.sleepUntil("wait-15-after", tPlus15m);
      await step.do("noshow-check", async () => {
        // Implementation note: this should check whether the host marked
        // attendance. For v1, just notify the host that the slot completed.
        // Add real no-show flags once we have a host UI for it.
        return;
      });
    }
  }
}

// ─── Helpers (skeleton — fill in) ────────────────────────────────────────────

interface ScheduledController {
  cron: string;
  scheduledTime: number;
}

async function refreshBusyTimeCache(env: Env): Promise<void> {
  // For each user with a 'google_calendar' integration in 'active' status,
  // hit Composio GOOGLECALENDAR_EVENTS_LIST for the next 30 days, upsert
  // into a `busy_times_cache` table on Supabase keyed by (user_id, day).
  // The slot finder can then read busy times from this cache for faster
  // booking-page loads.
  //
  // Skip if you decide to fetch live every page-load instead.
  void env;
}

async function sweepSharedLinks(env: Env): Promise<void> {
  // Delete shared_links rows where is_archived=true AND updated_at < now-90d.
  // Delete shared_link_verifications where expires_at < now.
  void env;
}

async function assertBookingStillActive(
  bookingId: string,
  env: Env,
): Promise<boolean> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/bookings?id=eq.${bookingId}&select=status`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) return false;
  const rows = (await res.json()) as { status: string }[];
  return rows[0]?.status === "ACCEPTED" || rows[0]?.status === "PENDING";
}

async function sendReminderEmail(opts: {
  to: string;
  recipientName: string;
  eventTitle: string;
  startTime: string;
  meetingUrl?: string;
  when: string;
  env: Env;
}): Promise<void> {
  // Send via Resend (Ultron already uses transactional emails — match the
  // existing email-sending lib at src/lib/email/share-notifications.ts).
  const startDate = new Date(opts.startTime);
  const friendly = startDate.toLocaleString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Ultron <bookings@51ultron.com>",
      to: [opts.to],
      subject: `Reminder: ${opts.eventTitle} ${opts.when}`,
      html: `
        <p>Hi ${opts.recipientName},</p>
        <p>This is a reminder that <strong>${opts.eventTitle}</strong> is ${opts.when} (${friendly}).</p>
        ${opts.meetingUrl ? `<p>Join: <a href="${opts.meetingUrl}">${opts.meetingUrl}</a></p>` : ""}
      `,
    }),
  });
}
