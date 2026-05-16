# Carousel QA Rubric — brand-agnostic, design-quality first

The carousel factory produces **variety**. The library should reflect every
serious carousel aesthetic — dark, light, paper, neon, bold-color, editorial,
brutalist, glass, etc. There is **no single "Ultron brand" the rubric
validates against**.

Per-carousel theme is chosen by the *generator* (brief + requested vibe),
not by the *judge*. The judge asks: "is this design well-executed?"

## Per-slide pass/fail checks

Each is a binary yes/no. Slide passes only if ALL are yes.

### Structural (theme-agnostic)
1. **Has all expected content** — title visible, body visible (if layout requires), graphic visible (if layout requires).
2. **No broken slots** — no empty grey rectangles, no `{{placeholder}}` strings, no missing-icon fallback boxes.
3. **No text overflow** — no clipped letters at edges, no text overlapping other text.
4. **Text legibility** — body text ≥28px equivalent, sufficient contrast against background.

### Aesthetic execution (theme-agnostic)
5. **Color discipline** — slide uses 1-3 hues plus neutrals. Not a rainbow. The chosen palette is consistent across the carousel.
6. **Accent restraint** — whatever accent color the design uses appears on 1-3 elements at most, not as wallpaper.

### Anti-AI-tell (theme-agnostic; these are universal slop indicators)
7. **No radial gradient blobs in corners.**
8. **No giant ghost-text wallpaper** behind content as default decoration.
9. **No purely symmetric centered stacking** as the slide's only composition.
10. **No decorative shapes** (circles, triangles, sparkles) with no concept tie to the content.

### Composition (theme-agnostic)
11. **Clear visual hierarchy** — one dominant element + supporting elements.
12. **Negative space is intentional** — empty areas read as breathing room, not as "I forgot to put content here".

## Per-carousel checks

13. **Adjacency variety** — no two adjacent slides with the same composition.
14. **Pacing** — at least one "breathing slide" between two information-dense slides.
15. **Hook and CTA stand out** — slide 1 and last slide are the most visually distinct.
16. **Tone consistency** — all slides feel like the same brand/aesthetic family, not 8 different designers.

## What is explicitly NOT in the rubric

- ❌ "Slide must be dark themed"
- ❌ "Slide must use orange accent"
- ❌ "Slide must match Ultron's brand"
- ❌ Any single-aesthetic constraint

The library should hold dark + ember carousels, light + paper carousels,
neon + glass carousels, brutalist + black carousels, editorial + serif
carousels, etc. The generator picks a vibe per brief; the judge rates
that vibe's execution.

## Scoring (1-10 scale)

- **10**: indistinguishable from a top designer's Behance Project of the Day
- **9**: would post this without changes
- **8**: would post after one minor tweak
- **7**: would post after 2-3 tweaks
- **6**: needs a re-render with a different layout
- **5 or below**: scrap; planner needs to start over

## Output format (machine-readable)

```json
{
  "slide_index": 2,
  "overall_score": 8,
  "verdict": "pass",
  "detected_aesthetic": "dark-editorial",
  "checks": {
    "has_all_content": true,
    "no_broken_slots": true,
    "no_text_overflow": true,
    "text_legible": true,
    "color_discipline": true,
    "accent_restraint": true,
    "no_radial_gradient_blobs": true,
    "no_ghost_text": true,
    "no_symmetric_stacking": true,
    "no_decorative_filler": true,
    "clear_hierarchy": true,
    "intentional_negative_space": true
  },
  "issues": ["..."],
  "strengths": ["..."]
}
```

`detected_aesthetic` is metadata only — it does NOT affect the score.
A "dark-ember-minimal" 9/10 and a "light-paper-editorial" 9/10 are equally
valid. The library benefits from both.

## How this rubric is used

1. **Spec validator** (text-only, runs on Workers AI Kimi K2.6) — catches checks #1-4 + #13-16 from the spec, before render.
2. **Visual QA** — the Claude Code session (me) sample-reviews per batch using this rubric.
3. **Human approval** — you star / reject per carousel; stars feed Vectorize as positive exemplars *of whatever aesthetic was generated*; rejects feed planner anti-examples.

No automated vision model is currently part of the loop (Workers AI vision
options were tested and rejected — see README "Why not Workers AI vision").
