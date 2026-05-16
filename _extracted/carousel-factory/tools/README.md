# carousel-factory/tools

Ingestion + triage pipeline for scraped carousel references.

## Workflow

```
nexitynetwork/ultron-scrapers      (scraper runs, updates continuously)
  │
  ▼ sync-behance.mjs
data/manifest.jsonl + data/slides/*.webp
  │
  ▼ triage.mjs (deterministic filters + classifiers)
data/rejected.json     ← hard rejects (auto-split, wrong aspect, too few slides)
data/pending-review.json   ← awaiting human (Claude Code session) review
  │
  ▼ Claude Code reviewer fills in `decision` field per entry
  │  ("keep" | "extract" | "reject")
  │
  ▼ promote.mjs
_extracted/marketing-swarm-layouts/carousels/behance--<id>/  ← kept references
data/rejected-by-human.json  ← human rejections + reasons
data/extract-queue.json  ← projects flagged for new-layout extraction
```

## Run order

```bash
# 1. Pull latest from scrapers repo (run whenever new scrape data lands)
GITHUB_PAT=ghp_... node tools/sync-behance.mjs

# 2. Auto-classify + filter (deterministic, no LLM)
node tools/triage.mjs

# 3. Claude Code session reads data/pending-review.json, looks at covers,
#    fills in `decision` and optional `layoutNotes` per entry.
#    See "Review protocol" below.

# 4. Promote approved projects into the library
node tools/promote.mjs
```

## Review protocol (for the Claude Code session — me)

When invoked, I:

1. Read `data/pending-review.json` (already sorted by brand-fit DESC + appreciations DESC)
2. For each entry where `decision === null`, view the cover (`coverPath`)
3. Make a snap call:
   - **`keep`** — usable as visual reference, brand-adjacent
   - **`extract`** — has a layout pattern we don't have yet; flag for new-layout work
   - **`reject`** — off-brand, low quality, or wrong genre (story-style, illustration-heavy)
4. Optionally check 1-2 body slides for `extract` candidates to confirm the pattern repeats
5. Write the decision back to `pending-review.json`:
   ```json
   {
     ...existing fields...,
     "decision": "keep",
     "decisionReason": "dark + orange palette, type-driven, 6 slides with clean variety",
     "layoutNotes": "slide-04 has a 3-stat layout we haven't built — extract as body-stat-triple"
   }
   ```
6. Run `node tools/promote.mjs`

Time budget: ~30 seconds per cover for `keep/reject`, ~2 minutes for `extract`.

## Hard-reject rules (no human time spent on these)

Applied in `triage.mjs`:

| Rule | Why |
|---|---|
| `slideCount < 4` | Not a carousel; usually a single-image post |
| Any slide `wasAutoSplit=true` | Was a panel cropped to look like a carousel; not designed-as-carousel |
| Majority of slides with `aspectRatio < 0.65 \|\| > 0.95` | Not portrait-IG format |
| `appreciations > 10000` | Almost always viral non-carousel mis-categorised |

## Classifier outputs

For each project that survives hard-reject, triage tags:

- **theme**: `dark` / `dark-muted` / `light` / `light-muted` / `mid` / `colorful` / `unknown`
  - Derived from cover's dominant RGB luma + saturation
- **brandFit**: 0-3 for Ultron's dark + ember palette
  - 3 = dark + orange-family cover
  - 2 = dark theme
  - 1 = mid / light-muted
  - 0 = colorful / light

This sort biases me toward reviewing the most-likely-to-keep projects first.

## Data structure

```
_extracted/carousel-factory/data/
├── sync-status.json           ← when we last synced, slide/project counts
├── manifest.jsonl             ← merged copy of scraper manifest
├── slides/                    ← local mirror of WebPs (organized by /<shard>/)
├── rejected.json              ← hard-rejected projects + reasons
├── pending-review.json        ← awaiting human review
├── rejected-by-human.json     ← reviewed-then-rejected (kept for audit)
└── extract-queue.json         ← flagged for layout-extraction work
```
