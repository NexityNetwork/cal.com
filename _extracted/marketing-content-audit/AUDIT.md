# Marketing & content tooling — open source audit for Ultron

**Status**: research only, no code changes. Audit triggered by the request to
scope what's worth lifting from the OSS marketing/content ecosystem into
Ultron.

**Scope filter**: only open source (MIT / Apache / AGPL — flagging fair-code
and custom licenses explicitly). Only things that **complement** Ultron's
existing stack, not duplicate it. Only repos with active maintenance
(commits in last 6 months) and ≥1k stars unless explicitly justified.

---

## 0. What Ultron already has (DO NOT pull anything that duplicates)

Verified from the `claude/review-cloudflare-infrastructure-tzDsV` branch:

| Capability                       | Existing implementation                                       |
|----------------------------------|---------------------------------------------------------------|
| Multi-platform social posting    | Content tab + New Post modal + platform previews              |
| Scheduling (calendar grid)       | Content tab → "May 2026" calendar                             |
| Drafts / scheduled / published   | Post details modal (Draft state, schedule, character count)   |
| Channels: LI, X, IG, TikTok, FB, YT | `Channels 4/6` connector strip                             |
| Carousel/image generation        | `services/carousel-renderer` + `carousel-engine` D1 + R2 bucket |
| Marketing-swarm orchestration    | `cf-workers/marketing-swarm` worker                           |
| AEO (answer engine optimization) | `cf-workers/aeo` + `aeo-tracker` workflow                     |
| Competitor tracking              | `cf-workers/watcher` + `competitor-watcher` workflow          |
| Content factory storage          | R2 bucket `ultron-content-factory`                            |
| Web scraping                     | `cf-workers/scrape` + `cf-workers/scraper-webhook` + `apify-actors` |
| Lead gen / SMTP verification     | `cf-workers/smtp-verify` + `smtp-verify-worker`               |
| Calendar feed aggregation        | `/api/calendar/feed` (events + scheduled tasks + posts + tasks + Google via Composio + Calendly + iCal) |
| Sharing / gated public links     | `shared_links` + `ShareModal` (password, OTP, expiry, max-views, agreements) |
| Surveys / forms                  | Formbricks (env vars present)                                  |
| Link shortener / attribution     | Dub.co (env var `NEXT_PUBLIC_DUB_PROGRAM_ID` present)         |
| Knowledge base / brain          | `src/lib/knowledge/brain-inventory.ts`, `embeddings.ts`        |
| Discovery / aggregation         | `discovery-aggregator` CF workflow                             |
| Milestones tracking             | `milestones-evaluator` workflow                                |
| Fundraising emails              | `fundraising-worker`                                           |
| Sales pipeline (presumed)       | `Sales 483` tab                                                |
| Calendar UI (Day/Week/Month)    | `AgentActivitySidebar.tsx` schedule modal                      |
| Cron infrastructure             | `cf-workers/ultron-cron` + `ultron-cron-scheduler`             |
| Async tasks framework           | (none yet — see Tier 1 #2 below)                               |
| Integration broker              | **Composio** for Gmail/GCal/Outlook/Meet/Zoom/Teams/IG/FB/YT/Reddit/Notion/Drive/Sheets/Docs/Analytics |
| Database / auth                 | Supabase (project `rvugghuawrgdigabochq`, eu-north-1)         |

---

## 1. Verdict at a glance

### Tier 1 — strongly recommended (real gap + clean fit + open license)

| # | Repo | License | What we'd lift | Effort |
|---|---|---|---|---|
| 1 | **Postiz** (`gitroomhq/postiz-app`, 30k★) | AGPL-3.0 | Provider implementations (TikTok, Bluesky, Threads, Mastodon, Warpcast — beyond what Composio gives) + autopilot AI agent patterns + comment/DM ingestion | M |
| 2 | **Trigger.dev v3** (`triggerdotdev/trigger.dev`) | Apache 2.0 | Durable background-jobs framework. Replaces ad-hoc CF Worker queueing for long content pipelines (carousel render, video gen, swarm runs) | M-L |
| 3 | **Langfuse** (`langfuse/langfuse`) | MIT | LLM observability + prompt versioning + evals. Critical when you have many agents. Self-hostable | M |
| 4 | **Plausible CE** (`plausible/analytics`) or **Umami** (`umami-software/umami`) | AGPL-3.0 / MIT | Privacy-first web analytics for shared pages (`/s/[slug]` traffic), booking pages, public posts | S |
| 5 | **Inbox Zero** (`elie222/inbox-zero`) | AGPL-3.0 | Rule-based AI email triage. Same stack as Ultron (Next.js, TS, Prisma swap for Supabase). Wire to Composio Gmail | S-M |
| 6 | **Documenso** (`documenso/documenso`, 12k★) | AGPL-3.0 | Real PDF e-signatures (PAdES). Plugs into existing `agreements` system referenced in `shared_links.enable_agreement` | M |

### Tier 2 — useful if/when scope expands

| # | Repo | License | Why it's interesting | Effort |
|---|---|---|---|---|
| 7 | **GrowthBook** (`growthbook/growthbook`) | MIT | Feature flags + A/B testing + product analytics, warehouse-native. Useful once you ship UX experiments | M |
| 8 | **Activepieces** (`activepieces/activepieces`) | MIT | User-facing visual workflow automation (Zapier-style). Different from internal job queue — this is for end-users to build automations between Ultron + their tools | L |
| 9 | **Mastra** + **Vercel AI SDK** | Apache 2.0 / MIT | Modern TS-native AI agent primitives. If you're rewriting any agent loop, look here first | S-M |
| 10 | **OpenShorts** / **AI-Youtube-Shorts-Generator** | MIT | Long-form → 9:16 short-form pipeline. Pairs with carousel-engine to extend into video | L |
| 11 | **Twenty** (`twentyhq/twenty`, 44k★) | AGPL-3.0 | Modern CRM (NestJS + React + GraphQL). Could complement `Sales 483` tab if you scale into pipeline mgmt | L |
| 12 | **AppFlowy** (`AppFlowy-IO/AppFlowy`) | AGPL-3.0 | Notion-style collaborative workspace. Look at their block editor + database view if you ever build internal docs | L |

### Tier 3 — skip or already covered

| # | Repo | Why skip |
|---|---|---|
| 13 | n8n | Fair-code license = NOT fully open source (commercial redistribution restricted). Activepieces (MIT) is the cleaner pick if you go this direction |
| 14 | Mautic | PHP/Symfony. Legacy stack, hard to integrate. Plunk / Keila are better modern alternatives |
| 15 | Remotion | Custom license — commercial video rendering services require **paid** license. Read the terms carefully before lifting |
| 16 | PostHog (self-hosted) | Excellent product but self-hosted version is community-build-only with missing features. Use as cloud, not lift |
| 17 | Chatwoot | Ruby on Rails — completely different stack from Ultron. Use as cloud if you need omnichannel inbox, don't lift |
| 18 | RudderStack / Jitsu | Heavy CDP infrastructure. Overkill until you have multiple analytics destinations |
| 19 | Mixpost | PHP/Laravel; Postiz covers similar ground in a Node/TS stack |
| 20 | Listmonk | Go-based; if you want newsletter, **Keila** (Rust+TS) or **Plunk** (TS) are easier to integrate |

---

## 2. Per-category deep dive

### 2.1 Social posting providers — the Composio gap

**Ultron has**: LinkedIn (Live), Instagram (Live), TikTok (Live) shown in
screenshots. Composio wraps `instagram`, `facebook`, `youtube`, `microsoft_teams`,
`outlook`, but **not** TikTok, Threads, Bluesky, Mastodon, Reddit-write,
Warpcast.

**The actual gap**: Posting to TikTok/Threads/Bluesky/Mastodon happens
*somewhere* in Ultron given the screenshots show TikTok Live. Either
through a non-Composio path, or through some custom integration. Worth
auditing how this works before lifting from Postiz.

**Lift candidate**: **Postiz** has battle-tested provider implementations
for 15+ platforms including all of the above. Each provider is a self-contained
class in `apps/backend/src/services/providers/`. Specifically the TikTok,
Threads, Bluesky, and Mastodon providers are worth studying.

**License**: AGPL-3.0 — fine for Ultron (also open source). Note: if you
ever go closed-source, lifting AGPL code becomes a problem.

**What NOT to lift**: Postiz's whole app architecture (Nest.js + Postgres
+ Redis) duplicates what Ultron already has. Just the provider classes.

### 2.2 Comment / DM ingestion — real gap

**Ultron has**: outbound posting + scheduling. **No evidence** of
ingestion (comments, DMs, mentions back).

**Why this matters for an AI agents platform**: agents that post should
also be able to *respond* — that's a huge UX unlock. "AI replied to 12
comments on your LinkedIn post" is a feature.

**Lift candidates**:
- **Chatwoot** — leader, but Ruby/Rails. **DO NOT LIFT** the code; use
  patterns: unified conversation model, channel-agnostic message store,
  agent-routing rules.
- **Postiz Engagement module** — included in the Postiz tree; lifts
  comments via the same provider classes. Same code reuse as 2.1.
- **Composio** — check if `executeTool` has webhook/poll patterns for
  IG comments, LinkedIn comments, TikTok comments. Likely yes for IG/FB,
  unknown for the others. (Investigation needed.)

**Recommended approach**: Extend the Composio webhook handler
(`src/app/api/webhooks/composio/route.ts`) to route incoming
comment/DM events into a new `inbox_messages` table. UI = a new tab in
the Content hub.

### 2.3 LLM observability + prompt management — real gap

**Ultron has**: many AI agents (skills, marketing-swarm, kimi-anthropic-shim,
brain knowledge base). **No evidence** of centralized prompt management
or trace observability.

**Pain this solves**: when something goes wrong with an agent run, where
is the prompt that was sent? What did the model reply? What was the
token cost? How does today's run compare to yesterday's?

**Lift candidate**: **Langfuse** (MIT, YC W23). Self-hostable on Docker
or via npm `@langfuse/client`. TypeScript SDK is mature. Integrates with
OpenAI / Anthropic / LangChain / OpenTelemetry. Storage: PostgreSQL +
ClickHouse (or PG-only for low volume).

**What to lift**:
- Add `@langfuse/openai` and `@langfuse/client` to Ultron's package.json
- Wrap every LLM call in `langfuse.trace()` / `langfuse.generation()`
- Store prompts as named "Langfuse prompts" rather than inlining in code
- Self-host Langfuse on a separate VPS or use cloud free tier (50k events/mo)

**Effort**: ~1-2 days of wrap-the-LLM-calls work + 1 day to spin up the
self-host or sign up for cloud.

**Alternative**: **Latitude** is newer, more agent-focused. Worth a look
if you'd rather have a built-for-agents tool than a generic LLM ops tool.

### 2.4 Newsletter / email campaign — real gap

**Ultron has**: transactional emails (`src/lib/email/share-notifications.ts`)
and likely some fundraising emails (via `fundraising-worker`). **No evidence**
of campaign management: lists, segments, broadcasts, A/B test subject lines,
unsubscribe-link mgmt at scale.

**Lift candidates**:
- **Keila** (Rust backend + TS/React frontend) — modern API-first, GDPR-focused.
  Good if you want a full newsletter UI.
- **Plunk** (full TypeScript + React) — newest, most Ultron-stack-aligned.
  Transactional + marketing + automations in one. Designed for embedding.
- **Listmonk** (Go) — most mature, handles millions, but Go service ≠
  Ultron's stack.

**Recommendation**: **Plunk** if you want code-level integration (embed
list mgmt in Ultron's UI). **Keila** if a sidecar service is fine.

**What to lift specifically from Plunk** (if not deploying it whole):
- Their automation rules engine (event → conditional → wait → action chain)
- Their template renderer (React Email components)
- Their list-segment evaluator
- Their unsubscribe-link cryptographic signing scheme

### 2.5 Web analytics for shared pages — real gap

**Ultron has**: `shared_link_views` table tracks views per share link. Solid
custom analytics within Ultron itself. **No evidence** of broader site
analytics — for the marketing site or for booking pages once they exist.

**Lift candidate**: **Plausible CE** (AGPL-3.0) or **Umami** (MIT). Both
are tiny, privacy-first, cookieless.

**For Ultron specifically**: probably **Umami** — lighter, MIT (more
flexibility), and the schema can be embedded into Ultron's existing
Supabase instance rather than running a separate Postgres.

**What to lift from Umami**:
- The event ingestion endpoint (`/api/send`)
- The session deduplication algorithm (hashed IP + UA + day window)
- The aggregation views (last_24h, last_7d, last_30d pre-computed tables)

**Or**: use Umami as a sidecar, just point analytics scripts at it. Less
code surgery.

### 2.6 Programmatic video / shorts — opportunity

**Ultron has**: carousel-engine (image-based content). **No video pipeline**.

**Lift candidate** (research-heavy):
- **OpenShorts** (mutonby/openshorts) — full self-hostable, long-form →
  9:16 with AI clip selection. Newer, smaller community.
- **AI-Youtube-Shorts-Generator** (SamurAIGPT) — Whisper + LLM highlight
  detection + auto vertical crop. Open source, no watermarks.
- **Remotion** — programmatic React-based video. **Custom license** —
  commercial use is paid above a threshold. Read carefully.

**Recommended**: don't lift now. Tag this as a 2026 Q4 / 2027 Q1 expansion.
The infrastructure cost (FFmpeg + GPU-or-not? + storage) is non-trivial.

### 2.7 Workflow automation (user-facing) — strategic decision

**Ultron has**: scheduled_tasks for agent runs. **No** user-built workflows
(in the Zapier / Make sense).

**Lift candidate**: **Activepieces** (MIT — fully open source). Lets users
visually build flows: trigger → action → action. 100+ integrations.

**Effort**: large. Activepieces is a full app. Two integration options:
- **As a sidecar**: deploy separately, link from Ultron's UI ("Build
  automation in Activepieces"). Low integration but fragmented UX.
- **Embed**: lift their visual builder component. Significantly harder.

**Strategic question**: is workflow automation core to Ultron's value
prop, or is it an adjacent feature? If your AI agents already do most of
the automation work via natural language, end-user visual builders may be
redundant. **Defer this decision.**

### 2.8 Document signing — closes the agreements loop

**Ultron has**: `shared_links.enable_agreement` + `agreement_id` columns —
signaling there's an agreements feature, possibly NDAs. Not clear if
they're actually *signed* (cryptographically) or just acknowledged.

**Lift candidate**: **Documenso** (AGPL-3.0). Same stack as Ultron
(Next.js + TS + Prisma — swap Prisma for Supabase). Produces real
PAdES-compatible signatures (same standard as DocuSign / Adobe Sign).

**What to lift**:
- The PDF signing service (`packages/pdf-sign/` in Documenso)
- The audit-trail email pipeline (everyone who signs gets a copy + audit doc)
- The signing widget component (drop into the existing `agreements` flow)
- Their PKCS#12 certificate management pattern

**Effort**: medium. The PDF/signing work is the meat; UI integration is
straightforward.

### 2.9 AI email assistant — niche but high-value

**Ultron has**: agents, brain knowledge base, Gmail via Composio. No
dedicated "manage my inbox" UX.

**Lift candidate**: **Inbox Zero** (AGPL-3.0). Built with the **exact**
Ultron stack: Next.js + TypeScript + Prisma (swap for Supabase) + Tailwind.

**What's compelling**: their rule-based triage system (plain-text rules
like "anything from Stripe → archive + label payment") + human-in-loop
approval. Very on-brand for Ultron's agentic philosophy.

**Two paths**:
- **Lift as a feature inside Ultron**: copy the rule engine + UI, wire
  to Composio Gmail. Adds an "Inbox" tab to the platform.
- **Don't lift, recommend it**: keep Ultron focused, integrate by webhook
  if needed.

### 2.10 Feature flags + A/B testing — future-proofing

**Ultron has**: nothing. Probably fine for now.

**Lift candidate**: **GrowthBook** (MIT). Self-hostable, warehouse-native
(integrates with Supabase). Has a visual editor for marketers to make
front-end variations without code.

**When to add**: when you ship a UX experiment you'd want to A/B test —
e.g., "do we get more bookings if the booking page uses Postiz-style cards
vs. cal.com-style list?"

---

## 3. Cross-cutting patterns worth studying (regardless of lift)

Even if you don't lift code, these patterns from the surveyed repos are
useful design references:

| Pattern | Source | Why look |
|---|---|---|
| Provider class pattern (per-platform integrations) | Postiz `apps/backend/src/services/providers/` | Cleaner than Composio's tool-slug-string for platforms that need bespoke logic |
| Event-driven workflow + step.sleep() | Trigger.dev v3, Inngest | The right primitive for long-running content pipelines |
| Prompt versioning | Langfuse | Don't inline prompts in code; version + label them |
| Audit trail on every state change | Documenso | Real PAdES + per-signer trail is the gold standard |
| Local-first sync engine | AppFlowy | If Ultron ever needs offline-first |
| Step-based flow builder UX | Activepieces vs n8n | Activepieces is simpler / less developer-coded; better for end-users |
| Single-DB advisory locks for serializable operations | Cal.com booking flow (already covered in our `_extracted/`) | Cheap race-free creation |

---

## 4. License flags

**Always read the license before lifting code:**

| License | Implication for Ultron |
|---|---|
| **MIT / Apache 2.0** | No-strings. Lift freely. (Activepieces, Trigger.dev, Mixpost, GrowthBook, Plasmic, Mastra, Vercel AI SDK, Plunk) |
| **AGPL-3.0** | Ultron stays open source if you lift. **Fine for current Ultron**. Becomes a problem if you ever go closed-source. (Postiz, Documenso, Inbox Zero, Twenty, AppFlowy, Plausible CE, Listmonk) |
| **fair-code (n8n)** | NOT open source under OSI definition. Commercial redistribution restricted. **Avoid**. |
| **Custom (Remotion)** | Commercial video rendering requires paid seat above threshold. **Read carefully**. |

---

## 5. Composio coverage check

Before lifting *any* integration, check if Composio already covers it
(`src/lib/composio.ts:TOOLKIT_ENV_VAR`):

| Platform / Capability | Composio tool | Need to lift? |
|---|---|---|
| Gmail (read/send) | `gmail` ✓ | No |
| Google Calendar | `googlecalendar` ✓ | No |
| Google Drive / Sheets / Docs | `googledrive` / `googlesheets` / `googledocs` ✓ | No |
| Google Meet / Zoom / Teams | `googlemeet` / `zoom` / `microsoft_teams` ✓ | No |
| Instagram | `instagram` ✓ | Posting yes; **comment ingestion** — verify |
| Facebook | `facebook` ✓ | Same — verify ingestion |
| YouTube | `youtube` ✓ | Verify |
| Outlook | `outlook` ✓ | No |
| Notion | `notion` ✓ | No |
| Reddit | `reddit` ✓ | No |
| TikTok | ❌ | **Lift Postiz TikTok provider** |
| Threads | ❌ | **Lift Postiz Threads provider** |
| Bluesky | ❌ | **Lift Postiz Bluesky provider** |
| Mastodon | ❌ | **Lift Postiz Mastodon provider** |
| Warpcast (Farcaster) | ❌ | **Lift Postiz Warpcast provider** |
| LinkedIn | ❌ in Composio | Already custom in Ultron (LI is "Live" in screenshots). Compare with Postiz LI provider for parity |
| X / Twitter | ❌ in Composio | Already partial (screenshot shows "Not connected"). Reference Postiz X provider |

**This is the most concrete and immediately actionable finding**: Composio
gaps map cleanly to Postiz's strong providers.

---

## 6. Recommended sequence (if user wants to act on this)

If acting on these recommendations, here's a sensible order:

1. **Langfuse** (1-2 days) — wins the most because every agent benefits.
   Self-host on a VPS or use cloud free tier.
2. **Postiz provider audit + lift** (3-5 days) — wraps TikTok/Threads/Bluesky/
   Mastodon into Ultron. Audit Composio first to avoid duplicating IG/FB/YT.
3. **Inbox Zero patterns** (2-3 days) — rule-based AI triage adds an "Inbox" lane.
4. **Plausible CE or Umami** (1 day) — privacy-first analytics for marketing pages.
5. **Documenso** (3-5 days) — real signatures close the agreements loop.
6. **Trigger.dev v3** (1 week) — only when you outgrow CF Workers for long content jobs.
7. **GrowthBook / Activepieces** — only when product strategy demands it.

Each is independently valuable. None require lifting more than ~5% of the
respective repo. None lock you into AGPL beyond what Ultron already is.

---

## 7. Sources

### Top OSS repos referenced in this audit
- [Postiz](https://github.com/gitroomhq/postiz-app) — AGPL-3.0, 30k stars
- [Mixpost](https://github.com/inovector/mixpost) — MIT, 3k stars
- [Trigger.dev](https://github.com/triggerdotdev/trigger.dev) — Apache 2.0
- [Langfuse](https://github.com/langfuse/langfuse) — MIT, YC W23
- [Activepieces](https://github.com/activepieces/activepieces) — MIT
- [Documenso](https://github.com/documenso/documenso) — AGPL-3.0, 12k stars
- [Twenty CRM](https://github.com/twentyhq/twenty) — AGPL-3.0, 44k stars (Y Combinator S23)
- [AppFlowy](https://github.com/AppFlowy-IO/AppFlowy) — AGPL-3.0
- [Inbox Zero](https://github.com/elie222/inbox-zero) — AGPL-3.0
- [Plausible Analytics](https://plausible.io) — AGPL-3.0
- [Umami](https://umami.is) — MIT
- [GrowthBook](https://github.com/growthbook/growthbook) — MIT
- [Plunk](https://www.useplunk.com/) — MIT
- [Keila](https://www.keila.io/) — AGPL-3.0
- [Listmonk](https://listmonk.app/) — AGPL-3.0
- [Remotion](https://github.com/remotion-dev/remotion) — Custom (commercial = paid)
- [OpenShorts](https://github.com/mutonby/openshorts) — AGPL-3.0
- [AI-Youtube-Shorts-Generator](https://github.com/SamurAIGPT/AI-Youtube-Shorts-Generator) — MIT
- [Mastra](https://mastra.ai/) — Apache 2.0
- [Chatwoot](https://github.com/chatwoot/chatwoot) — MIT (Ruby/Rails)
- [Plasmic](https://github.com/plasmicapp/plasmic) — MIT
- [Webstudio](https://webstudio.is) — AGPL-3.0
- [Puck](https://github.com/measuredco/puck) — MIT (visual editor primitive)
- [Refferq](https://github.com/Refferq/Refferq) — open source affiliate

### Comparison pieces
- [Postiz vs Mixpost (2026)](https://openalternative.co/compare/mixpost/vs/postiz)
- [Self-Hosted Analytics 2026: Plausible vs Matomo vs Umami vs OpenPanel](https://openpanel.dev/articles/self-hosted-web-analytics)
- [Open Source Feature Flag Tools: Unleash vs GrowthBook vs Flipt vs Flagsmith (2026)](https://flagshark.com/blog/open-source-feature-flag-tools-compared-2026/)
- [n8n vs Activepieces (2026)](https://automationatlas.io/answers/n8n-vs-activepieces-2026/)
- [Open Source CRM Benchmark 2026](https://marmelab.com/blog/2026/01/09/open-source-crm-benchmark-2026.html)
- [Open Source Email Marketing Platforms](https://www.awwtomation.com/blog/best-open-source-email-marketing-platforms)
- [5 Open-Source DocuSign Alternatives](https://sliplane.io/blog/5-open-source-docusign-alternatives)
- [Best Trigger.dev Alternatives (2026)](https://www.buildmvpfast.com/alternatives/trigger-dev)
