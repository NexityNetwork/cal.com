# marketing-swarm-layouts

Asset bundles built from `nexitynetwork/assets-claude`, structured for direct
ingestion into the marketing-swarm Cloudflare worker (R2 + Vectorize).

## What's here

```
carousels/
  how-to-move-like-a-20-person-team/    ← brand-owned, full DSL spec
    spec.ts                              CarouselSpec (typed-slide + freeform)
    meta.json                            metadata + design signatures
    pngs/slide-01.png … slide-10.png    page-ordered Figma exports
  scraped--*/                            17 scraped IG references
    meta.json                            metadata + design signatures
    pngs/slide-01.* … slide-NN.*        page-ordered scrape outputs
```

**18 carousels total**: 1 brand-owned + 17 scraped references.

## Source attribution

| Folder | Source | Theme | Brand-fit |
|---|---|---|---|
| `how-to-move-like-a-20-person-team` | Ultron Figma | dark-ember | brand-aligned |
| `scraped--300k-sales-team` | IG @leadgenman | dark-ember | high |
| `scraped--cold-email` | IG @leadgenman | dark-ember | high |
| `scraped--video-agency` | IG @leadgenman-style | dark-ember | high |
| `scraped--emails-clients-deck` | IG (unknown) | dark-mono | high |
| `scraped--multi-agent-patterns` | IG @techwith.ram | light-editorial | high |
| `scraped--claude-skills` | IG @leadgenman-style | dark-textured | high |
| `scraped--4-pillars-agents` | IG (unknown) | dark-minimal | medium |
| `scraped--claude-prompts` | IG @leadgenman | dark-warm | medium |
| `scraped--claude-code-templates` | IG @aiwithanushka | light-paper | medium |
| `scraped--claude-folder-structure` | IG @manthan_patel | light-paper | low |
| `scraped--free-claude-courses` | IG @leadgenman | warm-paper | low |
| `scraped--bad-good-great` | IG @leadgenman | light-paper | low-medium |
| `scraped--marketing-team` | IG @divyannshisharma | light-white | low |
| `scraped--sales-rep-team` | IG @divyannshisharma | light-white | low |
| `scraped--my-claude-skills` | IG @leadgenman-style | light-grid-paper | low |
| `scraped--second-brain` | IG @artem.novitckii | warm-paper | low |
| `scraped--claude-code.md` | IG @leadgenman-style | light-paper | low |

## Ingestion path (for the marketing-swarm worker)

The marketing-swarm has two retrieval surfaces. Each exemplar needs to land
in both:

### 1. R2 — visual exemplars
Bucket: `carousel-engine-exemplars`, prefix `library/` for typed categorization.
Each scraped slide becomes one R2 object the planner can fetch as a multimodal
reference image.

```
library/
  cover/         ← slide-01.* from every carousel
  body-stat/     ← slides with data viz (cold-email, multi-agent-patterns)
  body-list/     ← slides with numbered or bulleted items
  body-icon/     ← slides with hero icon (how-to-move 02-09)
  body-grid/     ← slides with multi-icon grids (how-to-move 10)
  body-mockup/   ← slides with product screenshots (emails-clients-deck)
  body-diagram/  ← slides with flow/tree diagrams
  body-folder/   ← skeumorphic folder hero slides
  cta/           ← final slides
```

Categorization can be done post-ingestion via `qa.ts` (vision model) tagging,
or by hand using each carousel's `meta.json` `designSignatures` field.

### 2. Vectorize — semantic exemplars
Index: `carousel-briefs`. For each carousel, embed:
- The carousel's `brief` field (or `title` + `narrativeShape` for scraped)
- Top design signatures from `meta.json`

The planner queries this index when generating a new carousel and retrieves
the K closest matches by topic-similarity.

### 3. D1 — exemplar registry (optional but recommended)
Table: `carousels` (schema: `carousel-engine/schema.sql`). Insert each
exemplar with `status='active'` so it's promoted into the planner's
reference pool immediately (bypasses the broken QA loop entirely).

## What's intentionally not here

- **`body and ctas/` and `carousel-titles/`** (61 Figma layout primitives) —
  these are *typed-layout primitives*, not carousels. They belong in a
  separate `primitives/` library and require coding each as a DSL element
  template. That work is phase 2.

- **`second_brain/` (artem.novitckii) raw scrapes** — already captured as
  the `scraped--second-brain/` reference. Other raw scrapes in the source
  repo's `second_brain/` folder are duplicates of carousels already here.

- **`viral_captions.docx`, `viral_hooks_factory.json`, topic .md files** —
  written content assets, not carousels. Live elsewhere.

## Next steps (proposed)

1. **Ingest the 18 carousels** — upload PNGs + meta to R2, embed into
   Vectorize. Mark all 18 as `active` in D1. Estimated effort: small worker
   script, ~30 min including testing.
2. **Generate 10 test carousels** with the same briefs that produced the
   current "garbage" outputs. Compare visually. Document the lift (or lack).
3. **If lift is real** — proceed to phase 2 (typed-layout primitives from
   `body and ctas/` + `carousel-titles/`).
4. **If lift isn't real** — phase 3a (swap director/planner/narrator to Kimi
   K2.6 + Claude Sonnet 4.6 for vision QA) before more exemplar work.

The hypothesis being tested: exemplar quality alone moves the needle. The
fallback: model quality must change first. The audit data (every QA = 0.5,
zero starred, zero promoted) suggests both are broken, but exemplar swap is
cheaper to test first.
