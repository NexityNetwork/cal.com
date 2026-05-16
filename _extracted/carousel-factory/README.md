# carousel-factory

A **typed-layout, batch-generation pipeline** for premium carousels. Generates
hundreds of carousels in parallel, scores them automatically, surfaces a
review page for human approval, and learns from rejections.

Replaces the current marketing-swarm's broken freeform pipeline.

## Why this exists

The current `marketing-swarm` worker produces low-quality carousels because:
- Every slide is `kind: "freeform"` — the LLM positions every element by hand
- The vision QA loop is dead (every score = 0.5, nothing ever promoted)
- The exemplar library is stale (seeded once, never updated)
- The planner uses weak models (Llama-4-Scout 17B for creative content)

This factory inverts the problem: **layouts are pre-built templates**, the
LLM only fills slots. Quality is bounded by template curation, not LLM
creativity.

## Architecture

```
brief                       ┌─ layouts/ (typed HTML templates)
  │                         │   each = template.html + schema.ts
  ▼                         │
┌─────────────────────────┐ │
│ 1. Planner              │─┘     Kimi K2.6 picks layouts +
│    (Workers AI)         │       fills slots, given brief +
└──────┬──────────────────┘       brand voice + few-shot exemplars
       │
       ▼ spec.json: { slides: [{ layoutId, slots }] }
┌─────────────────────────┐
│ 2. Composer             │       Substitutes {{slots}} into
│    lib/compose.ts       │       template.html → renderable HTML strings
└──────┬──────────────────┘
       │
       ▼ html[] (one per slide)
┌─────────────────────────┐
│ 3. Renderer             │       Playwright runs in CF Browser
│    Cloudflare Browser   │       Rendering, screenshots at exact
│    Rendering            │       1080x1350 → PNG buffers
└──────┬──────────────────┘
       │
       ▼ png[]
┌─────────────────────────┐
│ 4. Pre-QA               │       Llama-3.2-11b-vision-instruct
│    Workers AI vision    │       checks each slide against a written
│                         │       rubric → flag broken / empty / off-brand
└──────┬──────────────────┘
       │
       ▼ scored carousel
┌─────────────────────────┐
│ 5. Store                │       R2 (PNGs) + D1 (metadata + status)
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ 6. Review page          │       /factory/runs/<id> — grid of carousels,
│    Cloudflare Pages     │       star / reject / note buttons
└─────────────────────────┘
       │
       ▼ user feedback
   ▶ stars → embed into Vectorize as positive exemplars
   ▶ rejects → fed back to planner prompt as anti-examples
```

## What's in this folder

```
carousel-factory/
├── README.md                   ← this file
├── layouts/                    ← typed-layout library
│   <layoutId>/
│     template.html             ← Mustache-style HTML with {{slot}}s
│     schema.ts                 ← TypeScript slot interface + defaults
│     preview.html              ← sample-content filled version (committed)
│     preview.png               ← rendered preview (committed for browsing)
├── lib/
│   compose.ts                  ← spec → HTML[]
│   plan.ts                     ← brief → spec (calls Workers AI Kimi)
│   qa.ts                       ← PNG → score (calls Workers AI vision)
│   render.mjs                  ← Playwright batch renderer (local dev)
│   workers-ai.ts               ← thin Workers AI client
├── briefs/
│   sample-briefs.json          ← test inputs (10 briefs across topics)
├── workflow/
│   factory.workflow.ts         ← CF Workflow class (production)
│   wrangler.toml               ← CF deployment config
│   review-ui/                  ← static review-page HTML
└── docs/
    layouts.md                  ← catalog of all registered layouts
    rubric.md                   ← what "premium quality" means (used by QA)
    integration.md              ← how to plug into existing marketing-swarm
```

## Models — all on Cloudflare Workers AI, all open-source

| Role | Model | License | Why |
|---|---|---|---|
| Planner | `@cf/moonshotai/kimi-k2.6` | Open-source (Modified MIT) | Best content quality, runs directly on Workers AI |
| Fallback planner | `@cf/openai/gpt-oss-120b` | **Open-source (Apache 2.0)** — OpenAI's first open-weight model since GPT-2 | 120B params; use if Kimi falls short on nuance |
| Pre-QA vision | `@cf/meta/llama-3.2-11b-vision-instruct` | Open-source (Llama 3 Community License) | Vision-capable, scores rendered PNGs against a written rubric |
| Human-tier QA | Claude Code session (Claude in this session) | — | Invoked by user when a batch needs nuanced review; reads PNGs directly |
| Final approval | Human via review page | — | Stars + rejects feed the loop |

**No proprietary closed-source models** in the loop. Cost stays inside the
Cloudflare bill — no Anthropic API, no OpenAI API, no third-party LLM
gateways. Sonnet and other closed-source models are explicitly avoided.

## Status

- [x] Layouts: 2 registered (`cover-display-cta`, `body-icon-centered`)
- [ ] Layouts: 8 more to extract from existing scraped exemplars
- [x] Composer
- [x] Local renderer (Playwright)
- [ ] Planner (Kimi K2.6 binding)
- [ ] Pre-QA (Llama vision binding)
- [ ] CF Workflow wrapper
- [ ] Review page (Cloudflare Pages)
- [ ] D1 schema
- [ ] R2 bucket (`carousel-factory-runs`)

## Connection to other extractions

This folder builds on:
- `_extracted/marketing-swarm-layouts/` — the 18 reference carousels +
  the 2 HTML/CSS templates I built. The factory's layouts are extracted
  from these.
- The auditing work in earlier sessions identifying the broken QA loop +
  generic content + weak models.
