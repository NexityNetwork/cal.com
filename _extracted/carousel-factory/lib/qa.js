// Runtime JS twin of qa.ts. Manual sync until lib/ is built via tsc.

const MISTRAL_API_BASE = "https://api.mistral.ai/v1";

function getApiKey() {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) {
    throw new Error(
      "MISTRAL_API_KEY env var not set. Get a key at https://console.mistral.ai/api-keys/",
    );
  }
  return key;
}

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
5. theme_adherence: Is the slide consistent with dark-ember theme — black bg, restrained orange accent?
6. accent_restraint: Does accent color cover roughly 10% or less of the slide area?

ANTI-AI-TELL CHECKS
7. no_radial_gradient_blobs: No soft colored circles fading to transparent in corners.
8. no_ghost_text: No giant faded word behind content as default decoration.
9. no_symmetric_stacking: NOT just eyebrow+title+body all centered.
10. no_decorative_filler: No random circles, triangles, bubbles that don't tie to the content.

COMPOSITION CHECKS
11. clear_hierarchy: One dominant element + supporting elements, not 5 equal-weight elements competing.
12. intentional_negative_space: Empty areas read as breathing room.

Return ONLY valid JSON, no markdown fences. Structure:
{
  "slide_index": <number>,
  "overall_score": <1-10>,
  "verdict": "pass" | "tweak" | "scrap",
  "checks": {
    "has_all_content": <bool>, "no_broken_slots": <bool>, "no_text_overflow": <bool>,
    "text_legible": <bool>, "theme_adherence": <bool>, "accent_restraint": <bool>,
    "no_radial_gradient_blobs": <bool>, "no_ghost_text": <bool>, "no_symmetric_stacking": <bool>,
    "no_decorative_filler": <bool>, "clear_hierarchy": <bool>, "intentional_negative_space": <bool>
  },
  "issues": [<short strings>],
  "strengths": [<short strings>]
}`;

export async function qaSlide(opts) {
  const model = opts.model ?? "pixtral-12b-2409";
  const apiKey = getApiKey();
  const b64 = opts.pngBytes.toString("base64");

  const body = {
    model,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: RUBRIC_PROMPT },
        { type: "image_url", image_url: `data:image/png;base64,${b64}` },
      ],
    }],
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
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content ?? "";

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return {
      slide_index: opts.slideIndex, overall_score: 0, verdict: "scrap",
      checks: {}, issues: ["QA model returned non-JSON response"], strengths: [],
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

export async function qaCarousel(slides, opts = {}) {
  const concurrency = opts.concurrency ?? 3;
  const results = [];
  const inflight = new Set();
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
