/**
 * Visual QA module — sends rendered PNGs to Mistral Pixtral via Mistral's
 * EU-native API. Returns structured per-slide scores against the rubric.
 *
 * Why Mistral:
 *   - EU-native company (Paris); GDPR-compliant by design
 *   - No EU multimodal carve-out like Llama 3.2 / Llama 4 Scout
 *   - Pixtral models are open weights (Apache 2.0)
 *
 * Models:
 *   - `pixtral-12b-2409` — fast + cheap, fine for pre-filter pass/fail
 *   - `pixtral-large-latest` — premium critique; use when human-tier judgment matters
 *
 * USE (programmatic):
 *   import { qaSlide } from "./lib/qa.js";
 *   const result = await qaSlide({
 *     pngBytes: await readFile("slide.png"),
 *     slideIndex: 2,
 *     model: "pixtral-12b-2409",
 *   });
 */

import type { Buffer } from "node:buffer";

// ─── Configuration ──────────────────────────────────────────────────────────

const MISTRAL_API_BASE = "https://api.mistral.ai/v1";

// Lazy-read env so we can import the module without crashing in environments
// that don't have a key yet.
function getApiKey(): string {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) {
    throw new Error(
      "MISTRAL_API_KEY env var not set. Get a key at https://console.mistral.ai/api-keys/",
    );
  }
  return key;
}

// ─── Rubric prompt — kept verbatim in sync with docs/rubric.md ──────────────

const RUBRIC_PROMPT = `You are an expert design critic evaluating a single slide from an Instagram carousel post.

The brand is Ultron. The design language is dark-ember:
- Background: near-black (#0a0a0a)
- Accent: ember orange (#ff5e1a)
- Type: Inter, bold weights for display, regular for body
- Vibe: minimalist, asymmetric, no decorative filler

Evaluate this slide against the rubric below. For each check, answer yes/no.

STRUCTURAL CHECKS
1. has_all_content: Does the slide have visible content (title + body or title + icon)? No empty/blank regions where content should be.
2. no_broken_slots: Are there no obviously broken elements — empty grey rectangles, "{{placeholder}}" text, missing-icon fallback boxes?
3. no_text_overflow: Is no text clipped at slide edges or overlapping other text?
4. text_legible: Is body text large enough to read on a phone (>=28px equivalent)?

BRAND CHECKS
5. theme_adherence: Is the slide consistent with dark-ember theme — black bg, restrained orange accent? (Brand-icon colors like green Supabase are fine.)
6. accent_restraint: Does accent color cover roughly 10% or less of the slide area?

ANTI-AI-TELL CHECKS (these are the #1 reason AI-generated carousels look generic)
7. no_radial_gradient_blobs: No soft colored circles fading to transparent in corners.
8. no_ghost_text: No giant faded word behind content as default decoration.
9. no_symmetric_stacking: NOT just eyebrow+title+body all centered — composition should have visual weight in specific area, not perfectly symmetric.
10. no_decorative_filler: No random circles, triangles, bubbles that don't tie to the content.

COMPOSITION CHECKS
11. clear_hierarchy: One dominant element + supporting elements, not 5 equal-weight elements competing.
12. intentional_negative_space: Empty areas read as breathing room, not as "I forgot to put content here".

For each check, return true (pass) or false (fail).

Also assign an overall_score from 1-10:
- 10: Indistinguishable from a top designer's Behance project
- 9: Would post without changes
- 8: Would post after one minor tweak
- 7: Would post after 2-3 tweaks
- 6: Needs re-render with different layout
- 5 or below: Scrap; start over

And a verdict: "pass" (8+), "tweak" (6-7), "scrap" (<=5).

Provide a short list of specific issues (what would you fix) and strengths (what works well).

Return ONLY valid JSON, no markdown fences, no commentary. Structure:
{
  "slide_index": <number>,
  "overall_score": <1-10>,
  "verdict": "pass" | "tweak" | "scrap",
  "checks": {
    "has_all_content": <bool>,
    "no_broken_slots": <bool>,
    "no_text_overflow": <bool>,
    "text_legible": <bool>,
    "theme_adherence": <bool>,
    "accent_restraint": <bool>,
    "no_radial_gradient_blobs": <bool>,
    "no_ghost_text": <bool>,
    "no_symmetric_stacking": <bool>,
    "no_decorative_filler": <bool>,
    "clear_hierarchy": <bool>,
    "intentional_negative_space": <bool>
  },
  "issues": [<short strings>],
  "strengths": [<short strings>]
}`;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SlideQA {
  slide_index: number;
  overall_score: number;
  verdict: "pass" | "tweak" | "scrap";
  checks: Record<string, boolean>;
  issues: string[];
  strengths: string[];
  /** Raw Pixtral response, kept for debugging. */
  _raw?: string;
}

export interface QaOptions {
  /** PNG bytes of the rendered slide. */
  pngBytes: Buffer;
  /** Position of this slide in the carousel (0-indexed or 1-indexed; passed through to result). */
  slideIndex: number;
  /** Model to use. Default: pixtral-12b-2409 (fast/cheap). */
  model?: "pixtral-12b-2409" | "pixtral-large-latest";
  /** Optional brand override. Defaults to "Ultron / dark-ember". */
  brand?: string;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function qaSlide(opts: QaOptions): Promise<SlideQA> {
  const model = opts.model ?? "pixtral-12b-2409";
  const apiKey = getApiKey();

  const b64 = opts.pngBytes.toString("base64");

  const body = {
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: RUBRIC_PROMPT },
          {
            type: "image_url",
            image_url: `data:image/png;base64,${b64}`,
          },
        ],
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 800,
    temperature: 0.1,
  };

  const res = await fetch(`${MISTRAL_API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mistral API ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? "";

  let parsed: Partial<SlideQA>;
  try {
    parsed = JSON.parse(content);
  } catch {
    // If the model returned text instead of JSON, surface the raw response.
    return {
      slide_index: opts.slideIndex,
      overall_score: 0,
      verdict: "scrap",
      checks: {},
      issues: ["QA model returned non-JSON response"],
      strengths: [],
      _raw: content,
    };
  }

  return {
    slide_index: opts.slideIndex,
    overall_score: parsed.overall_score ?? 0,
    verdict: parsed.verdict ?? "scrap",
    checks: parsed.checks ?? {},
    issues: parsed.issues ?? [],
    strengths: parsed.strengths ?? [],
    _raw: content,
  };
}

/**
 * Run QA over every slide of a rendered carousel in parallel (capped).
 */
export async function qaCarousel(
  slides: { pngBytes: Buffer; slideIndex: number }[],
  opts: {
    model?: QaOptions["model"];
    concurrency?: number;
  } = {},
): Promise<SlideQA[]> {
  const concurrency = opts.concurrency ?? 3;
  const results: SlideQA[] = [];
  const inflight = new Set<Promise<void>>();

  for (const slide of slides) {
    const p = qaSlide({ ...slide, model: opts.model }).then((r) => {
      results.push(r);
      inflight.delete(p);
    });
    inflight.add(p);
    if (inflight.size >= concurrency) await Promise.race(inflight);
  }
  await Promise.all(inflight);
  return results.sort((a, b) => a.slide_index - b.slide_index);
}
