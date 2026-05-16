/**
 * Combined render + DOM-QA pass. One Playwright session does both:
 *   1. Render HTML to PNG at 1080×1350
 *   2. Run deterministic DOM checks against the rubric (structural-only;
 *      aesthetic judgment is human, not measured here)
 *   3. Capture a compositional fingerprint for adjacency comparisons
 *
 * Why this exists:
 *   The Workers AI vision models can't reliably grade slides (tested:
 *   Llava 1.5 7B hallucinated a "person" in a Notion slide, uform-gen2
 *   read "Notion" as "Nonton the Bane"). Llama 3.2/4 vision are EU-
 *   restricted. Rather than ship a fuzzy QA layer that adds noise, we
 *   use the browser's actual layout engine — which gives ground-truth
 *   answers to every structural question.
 *
 * What this catches (deterministic, no LLM):
 *   - Empty / missing slots
 *   - Unfilled {{placeholder}} strings
 *   - Text overflowing its container
 *   - Elements clipped at slide edges
 *   - Icons that are 0x0 (failed to render)
 *   - Icons that are empty <svg> with no paths (broken icon resolution)
 *
 * What this does NOT catch (requires human / vision):
 *   - "Does this look premium?"
 *   - "Are accents tasteful or overused?"
 *   - "Is the composition interesting?"
 *   That's batch review by the Claude Code session, not this script.
 */

import { chromium } from "playwright";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const W = 1080;
const H = 1350;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Render an array of HTML strings to PNGs + collect DOM-QA results.
 *
 * @param {string[]} htmls — slide HTMLs in carousel order
 * @param {string} outDir — directory for PNGs + qa.json
 * @param {{concurrency?: number}} opts
 * @returns {Promise<{
 *   slides: Array<{
 *     index: number,
 *     pngPath: string,
 *     bytes: number,
 *     qa: SlideQAResult,
 *     fingerprint: SlideFingerprint
 *   }>,
 *   carouselQa: CarouselQAResult
 * }>}
 */
export async function renderAndQa(htmls, outDir, opts = {}) {
  const concurrency = opts.concurrency ?? 4;
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      viewport: { width: W, height: H },
      deviceScaleFactor: 1,
    });

    const renderOne = async (html, idx) => {
      const page = await ctx.newPage();
      try {
        await page.setContent(html, { waitUntil: "networkidle" });
        await page.evaluate(() => document.fonts.ready);

        // 1. Screenshot
        const name = `slide-${String(idx + 1).padStart(2, "0")}.png`;
        const pngPath = join(outDir, name);
        const png = await page.screenshot({
          type: "png",
          clip: { x: 0, y: 0, width: W, height: H },
        });
        await writeFile(pngPath, png);

        // 2. DOM-QA (runs in browser context, returns structured result)
        const { qa, fingerprint } = await page.evaluate(domQaInBrowser, { W, H });

        return { index: idx, pngPath, bytes: png.length, qa, fingerprint };
      } finally {
        await page.close();
      }
    };

    // Concurrency-limited fan-out
    const results = [];
    const inflight = new Set();
    for (let i = 0; i < htmls.length; i++) {
      const p = renderOne(htmls[i], i).then((r) => {
        inflight.delete(p);
        results.push(r);
      });
      inflight.add(p);
      if (inflight.size >= concurrency) await Promise.race(inflight);
    }
    await Promise.all(inflight);
    results.sort((a, b) => a.index - b.index);

    // Carousel-level checks (adjacency, pacing) — done after all slides
    const carouselQa = checkCarousel(results);

    // Persist qa.json alongside the PNGs
    await writeFile(
      join(outDir, "qa.json"),
      JSON.stringify({ slides: results, carouselQa }, null, 2),
    );

    return { slides: results, carouselQa };
  } finally {
    await browser.close();
  }
}

// ─── Browser-side DOM measurement ───────────────────────────────────────────
// Runs inside page.evaluate(). Returns plain JSON-serialisable objects.

/* eslint-disable */
function domQaInBrowser({ W, H }) {
  const TOLERANCE = 4; // px wiggle for sub-pixel rounding

  const issues = [];
  const checks = {};

  // ── No unfilled {{slot}} strings anywhere (hard fail) ────────────────────
  const allText = document.body.textContent || "";
  const unfilled = allText.match(/\{\{[^}]+\}\}/g);
  checks.no_unfilled_slots = !unfilled;
  if (unfilled) issues.push(`unfilled slots: ${unfilled.join(", ")}`);

  // ── Page badge bounds check (only if a .page-badge exists) ───────────────
  const badge = document.querySelector(".page-badge");
  if (badge) {
    const r = badge.getBoundingClientRect();
    checks.page_badge_in_bounds =
      r.left >= 0 && r.top >= 0 && r.right <= W && r.bottom <= H;
    if (!checks.page_badge_in_bounds) issues.push("page-badge out of slide bounds");
  }

  // ── Body-icon-centered layout: title + body + icon ───────────────────────
  const bodyTitle = document.querySelector(".body-title");
  const bodyText = document.querySelector(".body-text");
  const iconHero = document.querySelector(".icon-hero");

  if (bodyTitle) {
    const txt = bodyTitle.textContent.trim();
    checks.body_title_present = txt.length > 0;
    if (!txt) issues.push("body-title is empty");

    const r = bodyTitle.getBoundingClientRect();
    checks.body_title_in_bounds = r.right <= W - TOLERANCE && r.bottom <= H - TOLERANCE;
    if (!checks.body_title_in_bounds)
      issues.push(`body-title clipped: right=${r.right.toFixed(0)} bottom=${r.bottom.toFixed(0)}`);

    // scrollHeight vs clientHeight tells us if text overflowed its box
    checks.body_title_no_overflow = bodyTitle.scrollHeight <= bodyTitle.clientHeight + TOLERANCE;
    if (!checks.body_title_no_overflow) issues.push("body-title text overflows container");
  }

  if (bodyText) {
    const txt = bodyText.textContent.trim();
    checks.body_text_present = txt.length > 0;
    if (!txt) issues.push("body-text is empty");

    const r = bodyText.getBoundingClientRect();
    checks.body_text_in_bounds = r.right <= W - TOLERANCE && r.bottom <= H - TOLERANCE;
    if (!checks.body_text_in_bounds)
      issues.push(`body-text clipped: right=${r.right.toFixed(0)} bottom=${r.bottom.toFixed(0)}`);

    checks.body_text_no_overflow = bodyText.scrollHeight <= bodyText.clientHeight + TOLERANCE;
    if (!checks.body_text_no_overflow) issues.push("body-text overflows container");
  }

  if (iconHero) {
    const r = iconHero.getBoundingClientRect();
    checks.icon_hero_visible = r.width > 0 && r.height > 0;

    // Icon must contain an SVG with actual path content (not just placeholder rect)
    const svg = iconHero.querySelector("svg");
    if (svg) {
      const paths = svg.querySelectorAll("path, polygon, circle, rect");
      checks.icon_has_content = paths.length > 0;
      // Reject the placeholder fallback (single low-opacity rect)
      const onlyPlaceholder = paths.length === 1 &&
        paths[0].tagName === "rect" &&
        (paths[0].getAttribute("opacity") || "1") < "0.5";
      checks.icon_not_placeholder = !onlyPlaceholder;
      if (onlyPlaceholder) issues.push("icon is the placeholder fallback (icon slug failed to resolve)");
    } else {
      checks.icon_has_content = false;
      checks.icon_not_placeholder = false;
      issues.push("icon-hero has no <svg> child");
    }
  }

  // ── Cover layout: cover-title + play-stack ───────────────────────────────
  const coverTitle = document.querySelector(".cover-title");
  const playStack = document.querySelector(".play-stack");

  if (coverTitle) {
    const txt = coverTitle.textContent.trim();
    checks.cover_title_present = txt.length > 0;
    const r = coverTitle.getBoundingClientRect();
    checks.cover_title_in_bounds = r.right <= W - TOLERANCE;
    if (!checks.cover_title_in_bounds)
      issues.push(`cover-title clipped at right edge: ${r.right.toFixed(0)}`);
  }

  if (playStack) {
    const r = playStack.getBoundingClientRect();
    checks.play_stack_visible = r.width > 0 && r.height > 0;
  }

  // ── Compositional fingerprint ────────────────────────────────────────────
  // Capture bounding boxes of major content elements for adjacency comparison.
  const fingerprint = {
    layout: bodyTitle ? "body" : coverTitle ? "cover" : "unknown",
    elements: {},
  };
  const tracked = [
    ".page-badge",
    ".body-title",
    ".body-text",
    ".icon-hero",
    ".cover-title",
    ".play-stack",
  ];
  for (const sel of tracked) {
    const el = document.querySelector(sel);
    if (el) {
      const r = el.getBoundingClientRect();
      fingerprint.elements[sel] = {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    }
  }

  // Compute overall verdict
  const allPassed = Object.values(checks).every((v) => v === true);

  return {
    qa: {
      verdict: allPassed ? "pass" : "fail",
      checks,
      issues,
    },
    fingerprint,
  };
}
/* eslint-enable */

// ─── Carousel-level checks ──────────────────────────────────────────────────

/**
 * Compare consecutive slides for compositional repetition.
 * Two slides "look the same" if their element layouts are nearly identical.
 */
function checkCarousel(slides) {
  const issues = [];
  const adjacencyChecks = [];

  for (let i = 1; i < slides.length; i++) {
    const prev = slides[i - 1].fingerprint;
    const cur = slides[i].fingerprint;
    const sim = fingerprintSimilarity(prev, cur);
    adjacencyChecks.push({ between: [i, i + 1], similarity: sim });
    if (sim > 0.95) {
      issues.push(
        `slides ${i} and ${i + 1} have nearly identical composition (sim=${sim.toFixed(2)})`,
      );
    }
  }

  // Hook + CTA distinctness: slide 1 vs middle slides
  const slide1 = slides[0]?.fingerprint;
  const middleSlides = slides.slice(1, -1);
  if (slide1 && middleSlides.length > 0) {
    const avgSimToMiddle =
      middleSlides.reduce(
        (acc, s) => acc + fingerprintSimilarity(slide1, s.fingerprint),
        0,
      ) / middleSlides.length;
    if (avgSimToMiddle > 0.7) {
      issues.push(
        `slide 1 composition is too similar to body slides (avg sim=${avgSimToMiddle.toFixed(2)}); cover should stand out`,
      );
    }
  }

  return {
    verdict: issues.length === 0 ? "pass" : "needs-review",
    issues,
    adjacencyChecks,
  };
}

/**
 * 0..1 similarity score between two fingerprints (element bounding boxes).
 * Same layout type + close element positions = 1.0
 * Different layout or large position deltas = 0.0
 */
function fingerprintSimilarity(a, b) {
  if (a.layout !== b.layout) return 0;
  const keys = new Set([
    ...Object.keys(a.elements),
    ...Object.keys(b.elements),
  ]);
  if (keys.size === 0) return 0;

  let total = 0;
  let matched = 0;
  for (const k of keys) {
    total++;
    const ea = a.elements[k];
    const eb = b.elements[k];
    if (!ea || !eb) continue;
    // Element-level similarity: 1 minus normalized position+size delta
    const dx = Math.abs(ea.x - eb.x);
    const dy = Math.abs(ea.y - eb.y);
    const dw = Math.abs(ea.w - eb.w);
    const dh = Math.abs(ea.h - eb.h);
    const delta = (dx + dy + dw + dh) / (W + H + W + H);
    matched += Math.max(0, 1 - delta * 4); // amplify so 25% delta = 0 sim
  }
  return matched / total;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , htmlsJsonPath, outDir] = process.argv;
  if (!htmlsJsonPath || !outDir) {
    console.error("Usage: node dom-qa.mjs <htmls.json> <out-dir>");
    process.exit(1);
  }
  const htmls = JSON.parse(await readFile(htmlsJsonPath, "utf8"));
  const result = await renderAndQa(htmls, resolve(outDir));
  console.log(`✓ ${result.slides.length} slides rendered + checked`);
  for (const s of result.slides) {
    const v = s.qa.verdict === "pass" ? "✓" : "✗";
    console.log(`  ${v} slide-${String(s.index + 1).padStart(2, "0")}: ${s.qa.verdict}`);
    for (const issue of s.qa.issues) console.log(`      - ${issue}`);
  }
  console.log(`\nCarousel-level: ${result.carouselQa.verdict}`);
  for (const issue of result.carouselQa.issues) console.log(`  - ${issue}`);
}
