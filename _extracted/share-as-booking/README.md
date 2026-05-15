# Reusing the share-link system for booking pages

Ultron's `shared_links` table is unusually well-designed: it's polymorphic
across resource types, and the gate stack (password / expiry /
email-required / OTP / max-views / allow-list / agreement / view analytics)
is exactly what a serious booking system needs for private invitations.

Most "Calendly clones" rebuild a worse version of this. We don't have to.

## What we get for free

Setting `resource_type = 'booking'` on a `shared_links` row gives the
booking page:

| Gate                   | Use case                                          |
|------------------------|---------------------------------------------------|
| `password_hash`        | Private booking link with a shared password       |
| `expires_at`           | Link only valid for X days (e.g. interview window)|
| `email_protected`      | Booker must enter email                           |
| `email_verified` (OTP) | One-time code to the booker's email — invite-only |
| `allow_list[]`         | Only `*@acme.com` can book (B2B sales)            |
| `deny_list[]`          | Block specific emails                             |
| `max_views`            | First-N people, link self-archives after          |
| `enable_agreement`     | NDA / Terms gate before booking                   |
| `enable_notification`  | Host gets email when link is viewed               |
| `enable_watermark`     | Less relevant for bookings, but available         |
| `slug`                 | URL-safe public id                                |
| `view_count` analytics | "12 people viewed your interview link"            |
| `shared_link_views`    | Full view log (geo, duration, downloaded_at)      |
| `regenerate_slug`      | Invalidate old URL, mint a new one                |
| Revoke (archive)       | Kill the link immediately                         |

## How it composes

Two operating modes, decided per event type:

### Mode A — public bookable link
```
event_types row with
  hidden = false
  shared_link_id = NULL
→ URL: /b/{user_slug}/{event_slug}
→ No gates. Like cal.com's default.
```

### Mode B — gated bookable link
```
event_types row with
  shared_link_id = <some uuid>
shared_links row with
  resource_type = 'booking'
  resource_id   = <event_type_id>
  password_hash = ...
  expires_at    = ...
  ...etc
→ URL: /s/{share_slug}
   (reuses existing /s/[slug] route — no new public route needed!)
```

`/s/[slug]/page.tsx` already handles every gate. We just need to teach it
to render the **booking page** when `resource_type === 'booking'`, in the
same way it currently renders the file viewer / note viewer / chat viewer
depending on the resource type.

## Implementation steps

### 1. Extend the resource_type CHECK constraint
Already done in `_extracted/supabase/schema.sql` step 4.

### 2. Update `/s/[slug]/page.tsx` to dispatch on resource_type='booking'

```tsx
// existing
if (link.resource_type === "file") return <FileViewer ... />;
if (link.resource_type === "chat") return <ChatViewer ... />;

// NEW
if (link.resource_type === "booking") {
  const eventType = await loadEventType(link.resource_id);
  return <BookingPage eventType={eventType} sharedLinkId={link.id} />;
}
```

### 3. The `BookingPage` component pulls from public APIs

```tsx
<BookingPage eventType={eventType} sharedLinkId={link.id}>
  <SlotPicker
    fetchAvailability={() =>
      fetch(`/api/public/event-types/.../availability?...&via=${link.slug}`)
    }
    onBook={(slot, attendee) =>
      fetch("/api/public/bookings", {
        method: "POST",
        body: JSON.stringify({
          event_type_id: eventType.id,
          shared_link_id: link.id,   // ← so we can log via shared_link_views
          ...
        })
      })
    }
  />
</BookingPage>
```

### 4. Log the booking-page view through shared_link_views

The existing share-view tracker already runs in `/s/[slug]/page.tsx`
post-gate. No change needed — we get viewer email + geo + duration for free
on every booking-page visit.

### 5. Connect `enable_notification`

If the share link has `enable_notification=true`, the existing
`/api/share/[id]` view handler emails the host on view. That continues to
work. Additionally, on successful booking, send the existing
`share-viewed` email or a new `booking-created` template.

### 6. Connect `enable_agreement`

If a booker clicks a link gated by an agreement (NDA), they must sign
before the slot picker renders. The existing agreement flow already handles
this — we just check `link.enable_agreement` in `BookingPage` and render
the agreement step first.

## The killer feature this unlocks

Privately-shared booking links with full audit trail. Use cases:

- **Sales**: send a 1-hour-window link with `expires_at=+3 days,
  allow_list=['@prospect.com']` after a discovery call.
- **Interviews**: link with `password` shared via the recruiter, `max_views=1`
  so once they book, no one else can.
- **Investors**: link with `enable_agreement=true` (NDA) → `email_verified`
  (OTP) before they see the founder's calendar.
- **Member-only office hours**: `allow_list=['@alumni.harvard.edu']`,
  `max_views=20`, expires every Friday.

Cal.com has **none** of this out of the box.

## What if I want to A/B test public vs gated for the same event type?

Easy: a single event_type can have **multiple shared_links** pointing at
it. They're all `resource_id = <event_type_id>`. Each has its own slug,
password, view count, expiry. The host dashboard already lists them all
via `GET /api/share?resource_type=booking&resource_id=...`.
