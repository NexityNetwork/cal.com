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

## Aesthetic diversity is the goal

The factory is **NOT** locked to one brand aesthetic. The layout library
should hold dark + ember, light + paper, neon + glass, brutalist + black,
editorial + serif, photo-bg, illustration, and every other serious carousel
style. A brief comes with a vibe; the planner picks layouts matching that
vibe. The rubric judges *execution of the chosen vibe*, not match to a
single brand.

If 100 generated carousels all came out dark + orange, that's a bug — the
generator collapsed to one aesthetic. The reference library must reflect
variety to prevent that.

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

## Models — open-source where possible, EU-safe everywhere

| Role | Model | License | EU-safe | Why |
|---|---|---|---|---|
| Planner | `@cf/moonshotai/kimi-k2.6` | Open-source (Modified MIT) | ✅ | Best content quality, runs on Workers AI |
| Fallback planner | `@cf/openai/gpt-oss-120b` | **Open-source (Apache 2.0)** | ✅ | OpenAI's first open-weight model since GPT-2; 120B params |
| Spec validator | `@cf/moonshotai/kimi-k2.6` | Open-source | ✅ | Text-only structural checks before render |
| **Visual QA** | **`pixtral-12b-2409` via Mistral API** | **Open weights (Apache 2.0), EU-native provider** | ✅ | French (Paris) company; no Llama-style EU multimodal carve-out |
| Visual QA (premium) | `pixtral-large-latest` via Mistral API | Open weights, EU-native | ✅ | Larger model for nuanced critique; same API call |
| Human-tier QA | Claude Code session (this session) | — | ✅ | Sample-review per batch via Read tool |
| Final approval | Human via review page | — | — | Stars + rejects feed the loop |

### Why not Workers AI vision

We tested every vision option on Workers AI:

- `@cf/meta/llama-3.2-11b-vision-instruct` — Llama 3.2 Community License excludes
  EU for multimodal. **Not usable.**
- `@cf/meta/llama-4-scout-17b-16e-instruct` — Llama 4 license has the same EU
  multimodal carve-out. **Not usable.**
- `@cf/google/gemma-3-12b-it` — multimodal in the underlying weights, but the
  Workers AI binding only exposes text input today (tested — model hallucinated
  random content when sent an image). **Not plumbed.**
- `@cf/llava-hf/llava-1.5-7b-hf` — only Image-to-Text option; tested with a
  rendered slide and it hallucinated a "person" in the Notion slide and ignored
  the yes/no rubric format. **Too weak for structured QA.**

Mistral Pixtral is the smallest reliable EU-safe vision model that can grade
designs against a rubric. Cost is small (~$2 per 100-carousel batch with
pixtral-12b). It's the right call.

**No closed-source models in the loop.** Sonnet is explicitly excluded.
Cost goes either to CF (text + render) or to Mistral (vision QA only).

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
