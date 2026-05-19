# carousel-factory

Batch generator for 1080×1350 social-media carousels.

A brief (one sentence) becomes 8 PNGs through: an LLM planner that fills
typed templates → Playwright that renders + scrubs → a static gallery
deployed to Cloudflare Pages.

Current state: **54 layout families, 170 templates, 450+ rendered carousels,
2 fallback planner models.** Production output lives at
`carousel-factory.pages.dev`.

---

## 1. Pipeline

```
            BRIEF (id, family, text)
                  │
                  ▼
   ┌─ Planner ──────────────────────────────┐
   │  Kimi K2.6 (primary)                   │
   │  gpt-oss-120b (fallback on capacity)   │
   │  Workers AI, JSON output                │
   └──────────────────┬─────────────────────┘
                      ▼
            SPEC JSON {slides:[{layoutId, slots}]}
                      │
   ┌─ Identity scrub ─┴──────────────────────┐
   │  KILL_SLOTS = handle, brand, author*,   │
   │  pageOf, pageNumber, swipeLabel,        │
   │  btnPrimary, btnGhost, buttonLabel, …   │
   │  → those slot values forced to ""        │
   └──────────────────┬──────────────────────┘
                      ▼
   ┌─ Composer (lib/compose.js) ─────────────┐
   │  Reads layouts/<layoutId>/template.html │
   │  Substitutes {{slot}} with slot value    │
   │  Resolves {{iconSvgN}} via simple-icons  │
   │  No simple-icons match → empty string    │
   └──────────────────┬──────────────────────┘
                      ▼
            HTML strings (one per slide, 8)
                      │
   ┌─ Render + DOM scrub (lib/dom-qa.mjs) ───┐
   │  Playwright chromium @ 1080×1350         │
   │  setContent + fonts.ready                 │
   │  stripEmptyDecorativesDom():              │
   │    • remove empty .handle/.btn/.page-num  │
   │      /.author/.byline/.swipe/.arr/…       │
   │    • collapse empty row containers        │
   │      (.top-row/.bottom-row/.btn-row/…)    │
   │    • collapse chip rows with no svg path  │
   │    • rebalance: kill flex-grow, drop      │
   │      margin-top:auto on pushed footers,    │
   │      re-center content on .frame          │
   │  page.screenshot() → PNG buffer            │
   └──────────────────┬──────────────────────┘
                      ▼
            slide-01..08.png + qa.json
                      │
                      ▼
        build-gallery.mjs → batch-output/index.html
                      │
                      ▼
        wrangler pages deploy → CF Pages
```

---

## 2. Directory layout

```
_extracted/carousel-factory/
├── DOCS.md                ← this file
├── README.md              ← original design doc (aspirational, partly stale)
├── package.json           ← deps: playwright, simple-icons
│
├── layouts/               ← 170 typed HTML templates, grouped by family
│   <family>-<role>/
│     template.html        ← Mustache-style HTML with {{slot}}s
│     schema.ts            ← slot interface + defaults (some layouts only)
│     preview.html         ← optional sample-content preview
│
├── lib/
│   generate-batch.mjs     ← main batch runner: briefs → specs → PNGs
│   compose.js             ← spec.slides[].slots → rendered HTML strings
│   dom-qa.mjs             ← Playwright render + DOM scrubber + QA fingerprint
│   render.mjs             ← thin render-only helper (no QA)
│   test-e2e.mjs           ← single-brief end-to-end smoke test
│
├── tools/
│   build-gallery.mjs      ← scans batch-output/ → writes index.html gallery
│   strip-handles.mjs      ← re-renders cached specs with current scrub rules
│   rerender.mjs           ← re-render a single id (no Kimi) — alt to strip
│   promote.mjs            ← move human-reviewed Behance refs to layouts repo
│   sync-behance.mjs       ← pull Behance scrape from ultron-scrapers repo
│   sync-canva.mjs         ← Canva mirror (similar to sync-behance)
│   triage.mjs             ← apply hard-reject rules + classifiers to scrape
│
├── batch-output/          ← all generated artifacts (450+ carousels)
│   <id>/
│     slide-01.png … slide-08.png
│     qa.json              ← DOM measurements + verdict per slide
│   <id>.spec.json         ← the planner output (cached, replayable)
│   index.html             ← gallery (rebuilt by build-gallery.mjs)
│
├── briefs/                ← legacy sample briefs (briefs now live in code)
├── data/                  ← Behance scrape inputs, pending-review queue
├── docs/                  ← legacy design docs (layouts.md, rubric.md)
├── workflow/              ← stubs for future CF Workflow port
└── test-output/           ← scratch dir for lib/test-e2e.mjs
```

---

## 3. The two key files

### `lib/generate-batch.mjs` (1188 lines, the heart)

Three things live in this file:

**a) `FAMILY_LAYOUTS`** — maps 54 family names to their `{cover, body, cta}` template
triples. Example:
```js
"mag-editorial": { cover: "cover-mag-editorial", body: "body-mag-editorial", cta: "cta-mag-editorial" }
```

**b) `FAMILY_PROMPTS`** — per-family Kimi prompts. Each tells the model:
- What slots exist in this family's cover/body/cta templates
- The shape/length of values to fill them with
- The vibe / tone for the family
- Constraints like word counts, allowed icon slugs

**c) `BRIEFS`** — the brief catalog (450+ entries). Each:
```js
{ id: "fdr-vc-no-thanks", family: "personal-essay", text: "I turned down VC money twice. The freedom math, …" }
```

**d) Runtime constants:**
- `CONCURRENCY` — workers (env, default 5)
- `KILL_SLOTS` — slot names whose values get blanked post-Kimi
- `BRIEF_IDS` env — filter to specific ids
- `FAMILIES` env — filter to specific families
- `KIMI_URL` + `FALLBACK_URL` — CF Workers AI endpoints

**e) `plan(brief, family)`** — calls Kimi up to 2×; if Kimi errors with
capacity/internal-error, falls back to gpt-oss-120b up to 2×. Returns parsed
JSON spec.

### `lib/compose.js` (209 lines, the slot engine)

- Loads `layouts/<layoutId>/template.html`
- For each slide: `html.replace(/\{\{(\w+)\}\}/g, key => slots[key] ?? "")`
- Resolves icon slots:
  - `{{iconSvgInline}}` from `{iconSlug, iconSvg, iconColor}`
  - `{{iconSvg1}}..{{iconSvg9}}` from `iconSlug1..iconSlug9` + `iconColor1..iconColor9`
  - `{{toolName1}}..` auto-derived from `iconSlug1..` if missing
- `resolveIcon(slug, svg, color)` — looks up `si["si" + Capitalized(slug)]` in
  `simple-icons`. Found → real SVG path. Not found → empty string. **No
  placeholder monograms.** That's how we kill the "Lc/Ic/Bo" boxes.

### `lib/dom-qa.mjs` (461 lines, the DOM scrubber + QA)

In `renderAndQa()` for each HTML string:
1. `page.setContent(html)`, wait for `document.fonts.ready`
2. `page.evaluate(stripEmptyDecorativesDom)` — runs the scrubber in the browser
3. `page.screenshot()` to `<id>/slide-NN.png`
4. `page.evaluate(domQaInBrowser)` — bounding-box checks → verdict per slide

`stripEmptyDecorativesDom()` runs inside the browser. Multi-pass inside-out:

```
LEAF_CLASSES (removed when empty)
  handle, handle-text, brand, brand-pill, brand-tag, tag,
  btn, btn-ghost, btn-primary, button, button-label, cta-btn,
  page-num, pg, pagination, page-of, page-label, page-badge,
  swipe, swipe-label,
  byline, author-name, author-role, avatar, avatar-letter,
  arr

CHIP_CLASSES (removed when no <svg path>)
  chip, chips, tile, tile-row, icons, icon-row, icon-grid

ROW_CLASSES (removed when text-empty AND no svg/img/picture/canvas)
  top-row, bottom-row, bottom-bar, header-bar, footer-bar,
  btn-row, author-bar, author-sticky-row, author-info, author-card
```

Then layout rebalance (only when root `.frame` is `display:flex; flex-direction:column`):
- Any descendant with `flex-grow > 0` → reset to `flex: 0 0 auto`
- Any descendant with `justify-content: center` → switch to `flex-start`
- Any direct child of root pushed below halfway with a >120px gap from prev
  sibling (typically `margin-top:auto` footers) → reset `margin-top: 0`
- `root.style.justifyContent = "center"` — re-center the remaining group

This is what stops content from floating in the middle of half-empty slides
after the decoratives are stripped.

---

## 4. Slot system

Templates use Mustache-style `{{slotName}}` placeholders. The planner returns
JSON specs in this shape:

```json
{
  "brand": "...",
  "brief": "...",
  "theme": "personal-essay",
  "id": "fdr-vc-no-thanks",
  "slides": [
    {
      "layoutId": "cover-personal-essay",
      "slots": {
        "brandTag": "",       // killed post-Kimi
        "handle": "",         // killed post-Kimi
        "eyebrow": "the freedom math no one",
        "title": "I turned down",
        "titleAccent": "VC money twice",
        "iconSlug1": "notion",
        "pageOf": ""          // killed post-Kimi
      }
    },
    { "layoutId": "body-personal-essay", "slots": { … } },
    …
    { "layoutId": "cta-personal-essay", "slots": { … } }
  ]
}
```

Always 8 slides: 1 cover + 6 body + 1 cta.

---

## 5. Identity stripping (the "kill handles" system)

Originally the planner generated handles like `@brand`, `@growthstack`, plus
author bylines, swipe labels, page indicators, button labels. The user wanted
all of these gone everywhere.

Two-layer kill:

**Spec-level** (`KILL_SLOTS` in `generate-batch.mjs` and `strip-handles.mjs`)
— forces these slot values to `""` after the planner returns:

```
handle, brand, brandTag, domain, domainText,
author, authorName, authorInitials, authorQuote, authorRole, byLine, avatarLetter,
pageOf, pageNumber, pageBadge, pageLabel, swipeLabel,
buttonLabel, btnPrimary, btnGhost, buttonLine
```

**DOM-level** (`stripEmptyDecorativesDom` in `dom-qa.mjs`) — removes the now-
empty container elements from the rendered DOM before screenshot, then
rebalances the layout (see §3).

The two layers compose: spec-level empties the text, DOM-level removes the
empty bubbles and reflows.

---

## 6. CLI workflows

### Generate a fresh batch

```bash
cd _extracted/carousel-factory

CF_ACCOUNT_ID=9329dd27959dfe8804ff27e1d5d50b29 \
CF_AUTH_EMAIL=catalin@nexitynetwork.org \
CF_AUTH_KEY=<key> \
CONCURRENCY=5 \
node lib/generate-batch.mjs
```

Filter the batch:
- `FAMILIES=mag-editorial,personal-essay` — only those families
- `BRIEF_IDS=fdr-vc-no-thanks,fdr-1m-solo` — only these IDs

Outputs: `batch-output/<id>/slide-NN.png` + `batch-output/<id>.spec.json`.

### Re-render existing carousels (no Kimi)

```bash
# All cached specs
node tools/strip-handles.mjs

# Specific ids
node tools/strip-handles.mjs id1,id2,id3
```

Reads `batch-output/*.spec.json`, applies current `KILL_SLOTS`, re-composes,
re-renders PNGs. Used after changes to templates or `dom-qa.mjs`.

### Rebuild gallery

```bash
node tools/build-gallery.mjs
# writes batch-output/index.html
```

### Deploy

```bash
CLOUDFLARE_API_TOKEN=<token> \
CLOUDFLARE_ACCOUNT_ID=9329dd27959dfe8804ff27e1d5d50b29 \
npx wrangler pages deploy batch-output \
  --project-name=carousel-factory \
  --branch=main
```

Static deploy. Live at `carousel-factory.pages.dev`.

---

## 7. Adding things

### Add a new brief
Append to `BRIEFS` array in `lib/generate-batch.mjs`:
```js
{ id: "my-new-brief", family: "mag-editorial", text: "One-sentence brief, no fluff." },
```
Then `BRIEF_IDS=my-new-brief node lib/generate-batch.mjs`.

### Add a new layout family

1. Create three templates: `layouts/cover-<family>/template.html`,
   `layouts/body-<family>/template.html`, `layouts/cta-<family>/template.html`.
   1080×1350 fixed dimensions. Use `{{slotName}}` placeholders.
2. Register in `FAMILY_LAYOUTS` in `lib/generate-batch.mjs`.
3. Add a prompt to `FAMILY_PROMPTS` describing each layout's slots.
4. (Optional) Write a `schema.ts` next to each template documenting slots.

### Add a new icon

Either:
- Use a slug from `simple-icons` (just put it in `iconSlug1: "stripe"`)
- Or pass raw inline SVG: `iconSvg1Raw: "<svg>...</svg>"`

If the slug isn't in `simple-icons`, the icon renders empty and the chip
disappears via DOM scrub. No placeholder boxes.

---

## 8. Models

| Role | Model | Why |
|------|-------|-----|
| Primary planner | `@cf/moonshotai/kimi-k2.6` | Best content quality on Workers AI |
| Fallback planner | `@cf/openai/gpt-oss-120b` | Activates when Kimi returns 3040 (capacity) or 3044 (internal) |

Both invoked through `https://api.cloudflare.com/client/v4/accounts/<ACCT>/ai/run/<model>`
with `X-Auth-Email` + `X-Auth-Key` headers. Max tokens: 32000 (Kimi),
16000 (fallback).

Vision QA (Pixtral / Mistral) is described in `README.md` as planned but is
not currently wired into the pipeline. DOM-based bounding-box checks in
`domQaInBrowser` are the only QA today.

---

## 9. Environment variables

| Var | Required | Used by |
|-----|----------|---------|
| `CF_ACCOUNT_ID` | yes (generate) | generate-batch.mjs |
| `CF_AUTH_EMAIL` | yes (generate) | generate-batch.mjs |
| `CF_AUTH_KEY` | yes (generate) | generate-batch.mjs |
| `CONCURRENCY` | no | generate-batch.mjs, strip-handles.mjs |
| `FAMILIES` | no | generate-batch.mjs |
| `BRIEF_IDS` | no | generate-batch.mjs |
| `CLOUDFLARE_API_TOKEN` | yes (deploy) | wrangler |
| `CLOUDFLARE_ACCOUNT_ID` | yes (deploy) | wrangler |
| `GITHUB_PAT` | yes (sync-behance) | tools/sync-behance.mjs |

---

## 10. File-by-file reference

### Library
- **`lib/generate-batch.mjs`** — main entry point. `BRIEFS` array + `FAMILY_LAYOUTS`
  + `FAMILY_PROMPTS` + `plan()` + `pmap()` concurrency. Calls `compose()` + `renderAndQa()`.
- **`lib/compose.js`** — `compose(spec, {layoutsDir})` → HTML string[]. Slot
  substitution, icon resolution from `simple-icons`, auto-derivation of
  `toolName` from `iconSlug`.
- **`lib/dom-qa.mjs`** — `renderAndQa(htmls, outDir, {concurrency})` → screenshots
  + QA verdicts. Hosts `stripEmptyDecorativesDom()` and `domQaInBrowser()` (both
  run inside the page).
- **`lib/render.mjs`** — `renderHtmlsToPngs()` — lighter helper without QA,
  used by `tools/rerender.mjs`.
- **`lib/test-e2e.mjs`** — smoke test for one brief.

### Tools
- **`tools/build-gallery.mjs`** — scans `batch-output/`, sorts dirs by mtime,
  emits `index.html`. Gallery groups by carousel: thumbnail strip + theme
  badge + brand + brief copy.
- **`tools/strip-handles.mjs`** — re-render every cached spec with current
  `KILL_SLOTS`. CLI accepts comma-separated IDs. Used after any change to
  `KILL_SLOTS` or `dom-qa.mjs`.
- **`tools/rerender.mjs`** — like strip-handles but for a single id, no QA pass.
- **`tools/sync-behance.mjs`** — pulls `nexitynetwork/ultron-scrapers` and copies
  the Behance carousel manifest + WebP slides into `data/`.
- **`tools/triage.mjs`** — applies hard-reject rules + classifiers to the synced
  manifest, emits `data/pending-review.json`.
- **`tools/promote.mjs`** — after a human marks decisions in `pending-review.json`,
  copies kept references into `_extracted/marketing-swarm-layouts/carousels/`
  (no file duplication; only `meta.json` + upstream pointer).
- **`tools/sync-canva.mjs`** — Canva-side equivalent of sync-behance.

---

## 11. Known limitations

- **Spec quality varies by model.** When Kimi hits capacity and gpt-oss-120b
  takes over, copy quality drops and icon slugs are more likely to be
  hallucinated (no `simple-icons` match → chip vanishes silently, which
  sometimes leaves a slide looking empty in the icon row area).
- **Layout rebalance is heuristic.** It assumes the root container is
  `.frame` or `.slide` and that `flex-grow` + `margin-top:auto` are the only
  layout devices used. Templates that use absolute positioning or grid for
  major regions don't get rebalanced and may show empty space.
- **No visual QA in the loop.** `domQaInBrowser` checks bounding-box overflow
  + text density but doesn't evaluate brand fit, typography balance, or
  whether the icons chosen match the brief topic. The Pixtral/Mistral hook
  described in README.md is unwired.
- **Some prompt entries are stale.** `FAMILY_PROMPTS` for older families
  (`ember-dark`, `beige-paper`, etc.) reference slots like `handle`, `brand`
  that are now killed post-Kimi. The model still generates them, the scrubber
  blanks them, but it's wasted tokens.
- **No persistent storage.** `batch-output/` is the only state. The CF Pages
  deploy is the only "publish." No R2 bucket, no D1 database, no Workflow
  wrapper despite the README describing one.

---

## 12. Recent changes (chronological)

1. **mag-editorial body deadspace fix** — replaced 3 separate `flex:1` beige
   insight cards with one dark unified content card (`flex:1`,
   `justify-content:space-evenly`) so dark backgrounds eliminate perception
   of empty space.
2. **`BRIEF_IDS` filter** added to `generate-batch.mjs` (paired with existing
   `FAMILIES` filter) for selective re-runs.
3. **Identity scrub system** — `KILL_SLOTS` in both `generate-batch.mjs` and
   `strip-handles.mjs`; `stripEmptyDecorativesDom` runs in Playwright before
   screenshot.
4. **Row + chip collapse** — empty `.top-row`/`.bottom-row`/`.btn-row`/
   `.author-bar` removed; chip containers without real SVG paths collapsed.
5. **Layout rebalance** — flex-grow reset, margin-top:auto detection,
   re-center on `.frame` so reduced content doesn't float in mid-slide gaps.
6. **gpt-oss-120b fallback** in `plan()` — kicks in on Kimi capacity (3040)
   or internal-error (3044) responses.
7. **Strict icon resolution** — `resolveIcon` returns empty string when slug
   not in `simple-icons`; placeholder monogram boxes ("Lc", "Ic", "Bo")
   removed from compose.js.
