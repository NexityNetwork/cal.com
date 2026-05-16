# Carousel QA Rubric

The exact criteria a slide is judged against. Used by Mistral Pixtral for
automated vision QA AND by the Claude Code reviewer (me) for nuanced
batch review. Same rubric, two judges, results compared.

## Per-slide pass/fail checks

Each is a binary yes/no. Slide passes only if ALL are yes.

### Structural
1. **Has all expected content** — title visible, body visible (if layout requires), icon/graphic visible (if layout requires).
2. **No broken slots** — no empty grey rectangles, no `{{placeholder}}` strings, no missing-icon fallback boxes.
3. **No text overflow** — no clipped letters at edges, no text overlapping other text.
4. **Text legibility** — body text ≥28px equivalent, sufficient contrast against background.

### Brand
5. **Theme adherence** — for dark theme: bg ≈ #0a0a0a, accent ≈ #ff5e1a. No off-palette colors leaking in (unless brand-icon-required, e.g. green Supabase).
6. **Accent restraint** — accent color covers ≤10% of slide area, applied to 1-3 elements maximum.

### Anti-AI-tell
7. **No radial gradient blobs in corners** (the #1 AI tell).
8. **No ghost text wallpaper** behind content as default decoration.
9. **No symmetric vertical stacking** as the slide's only composition (eyebrow + title + body all centered).
10. **No decorative bubbles/circles/triangles** with no concept tie to the content.

### Composition
11. **Clear visual hierarchy** — one dominant element + supporting elements, not 5 equal-weight elements competing.
12. **Negative space is intentional** — empty areas read as breathing room, not as "missing content".

## Per-carousel checks (whole-carousel review)

13. **Adjacency variety** — no two adjacent slides with the same composition.
14. **Pacing** — at least one "breathing slide" (number, stats, quote, big-statement) between two information-dense slides.
15. **Hook and CTA stand out** — slide 1 and last slide are the most visually distinct.
16. **Tone consistency** — all slides feel like the same brand, not 8 different designers.

## Scoring (1-10 scale)

After yes/no checks, an overall score:

- **10**: indistinguishable from a top designer's Behance carousel project
- **9**: would post this without changes
- **8**: would post after one minor tweak
- **7**: would post after 2-3 tweaks
- **6**: needs a re-render with a different layout
- **5 or below**: scrap; planner needs to start over

## Output format (machine-readable)

The QA model returns this JSON shape for every slide:

```json
{
  "slide_index": 2,
  "overall_score": 8,
  "verdict": "pass",                    // pass | tweak | scrap
  "checks": {
    "has_all_content": true,
    "no_broken_slots": true,
    "no_text_overflow": true,
    "text_legible": true,
    "theme_adherence": true,
    "accent_restraint": true,
    "no_radial_gradient_blobs": true,
    "no_ghost_text": true,
    "no_symmetric_stacking": true,
    "no_decorative_filler": true,
    "clear_hierarchy": true,
    "intentional_negative_space": true
  },
  "issues": [
    "Body text wraps to 4 lines, exceeding the 3-line guideline",
    "Notion logo could be 10% larger to match other tool-stack slides"
  ],
  "strengths": [
    "Title-to-body spacing is clean",
    "Icon circle stroke weight is appropriate"
  ]
}
```

For a carousel-level review (after all slides):

```json
{
  "carousel_id": "...",
  "overall_score": 7,
  "verdict": "tweak",
  "adjacency_check": "pass",
  "pacing_check": "tweak — slides 5-7 are all info-dense, need a breather",
  "hook_distinct": "pass",
  "tone_consistent": "pass",
  "summary": "Solid execution overall. The middle stretch lacks visual rhythm — insert a quote or big-statement slide at position 6."
}
```

## How this rubric is used

1. **Stage 1 — Spec validator** (text-only, runs on Workers AI Kimi K2.6):
   - Catches checks #1-4 (structural) by inspecting the spec before render
   - Catches #5-6 (brand) by inspecting slot values
   - Catches #13-16 (per-carousel) by analyzing the slide sequence
   - No image input needed

2. **Stage 2 — Visual QA** (Mistral Pixtral via Mistral API or CF AI Gateway):
   - Catches all checks 1-16 on rendered PNG
   - Returns structured JSON per above

3. **Stage 3 — Claude Code review** (me, this session):
   - Samples 10-20% of batch
   - Reviews against same rubric
   - Compared with Pixtral's verdicts — agreement = trust automation, disagreement = recalibrate rubric

4. **Stage 4 — Human approval** (you, via review page):
   - Star/reject final decision
   - Stars feed into Vectorize as positive exemplars
   - Rejects feed into planner prompt as anti-examples for next batch
