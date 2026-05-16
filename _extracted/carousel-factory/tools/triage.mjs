/**
 * Triage a synced Behance manifest into a review queue.
 *
 * Pipeline per project:
 *   1. Group manifest records by projectId
 *   2. Apply HARD-REJECT rules (definite-trash) → reject.json
 *   3. Run deterministic classifiers (color theme, complexity heuristics) →
 *      tag each project
 *   4. Emit pending-review.json with covers for human (me) to read
 *
 * After this script, run `tools/promote.mjs` once humans have marked
 * decisions in pending-review.json.
 *
 * Usage:
 *   node tools/triage.mjs
 *
 * Outputs:
 *   _extracted/carousel-factory/data/rejected.json      hard rejections + reasons
 *   _extracted/carousel-factory/data/pending-review.json projects awaiting human call
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const FACTORY_ROOT = resolve(import.meta.dirname, "..");
const DATA = resolve(FACTORY_ROOT, "data");

// ─── Load manifest ─────────────────────────────────────────────────────────

const text = await readFile(resolve(DATA, "manifest.jsonl"), "utf8");
const records = text.split("\n").filter(Boolean).map((l) => JSON.parse(l));

// Group by projectId
const byProject = new Map();
for (const r of records) {
  if (!byProject.has(r.projectId)) byProject.set(r.projectId, []);
  byProject.get(r.projectId).push(r);
}
// Within each project, sort by slideIndex
for (const slides of byProject.values()) slides.sort((a, b) => a.slideIndex - b.slideIndex);

console.log(`→ ${byProject.size} projects, ${records.length} slides`);

// ─── Classifiers ───────────────────────────────────────────────────────────

/** Hard-reject reasons. Definite trash, no human review needed. */
function hardReject(project, slides) {
  const reasons = [];

  // Too few slides for a real carousel
  if (slides.length < 4) reasons.push(`only ${slides.length} slides`);

  // Any slide auto-split — these are likely panel-style designs cropped,
  // not designed-as-carousel. Reject the whole project.
  const splits = slides.filter((s) => s.wasAutoSplit).length;
  if (splits > 0) reasons.push(`${splits}/${slides.length} slides were auto-split panels`);

  // Aspect ratio mismatch — should already be filtered upstream, but
  // belt-and-braces. We expect 0.70-0.85 (portrait-ish).
  const badAspect = slides.filter((s) => s.sourceAspectRatio < 0.65 || s.sourceAspectRatio > 0.95).length;
  if (badAspect > slides.length / 2) reasons.push("majority of slides have wrong aspect ratio");

  // Too "popular" can mean repost spam. Discard if appreciations is unreasonably high
  // (likely a viral non-carousel that got mis-categorised). Cap at 10k.
  if (project.appreciations > 10000) reasons.push(`suspiciously high appreciations: ${project.appreciations}`);

  return reasons;
}

/** Color theme classification from cover's dominant RGB.
 * DESCRIPTIVE only — this is for organizing the library by visual variety,
 * not for ranking. A dark carousel is not "better" than a light one. */
function classifyTheme(rgb) {
  if (!rgb) return "unknown";
  const { r, g, b } = rgb;
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;

  if (luma < 40) return "dark";
  if (luma < 80 && saturation < 0.3) return "dark-muted";
  if (luma > 200 && saturation < 0.1) return "light";
  if (luma > 180 && saturation < 0.3) return "light-muted";
  if (saturation > 0.5) return "colorful";
  return "mid";
}

/** Bucket appreciations into a quality tier — Behance community signal.
 * 100+ floor was already applied upstream by the scraper. */
function appreciationTier(n) {
  if (n >= 2000) return "viral";
  if (n >= 1000) return "popular";
  if (n >= 500) return "strong";
  if (n >= 200) return "decent";
  return "baseline";
}

// ─── Process projects ──────────────────────────────────────────────────────

const rejected = [];
const queued = [];

for (const [projectId, slides] of byProject.entries()) {
  const project = slides[0]; // any slide carries project-level metadata

  const reasons = hardReject(project, slides);
  if (reasons.length > 0) {
    rejected.push({
      projectId,
      projectName: project.projectName,
      designerHandle: project.designerHandle,
      slideCount: slides.length,
      reasons,
    });
    continue;
  }

  const cover = slides[0];
  const theme = classifyTheme(cover.colorRgb);
  const tier = appreciationTier(project.appreciations);

  queued.push({
    projectId,
    projectName: project.projectName,
    designerHandle: project.designerHandle,
    designerName: project.designerName,
    projectUrl: project.projectUrl,
    appreciations: project.appreciations,
    views: project.views,
    slideCount: slides.length,
    theme,           // descriptive: dark / light / colorful / etc.
    tier,            // Behance community signal: viral / popular / strong / decent / baseline
    coverColor: cover.colorRgb,
    discoveryQuery: project.discoveryQuery,
    discoveryTimeWindow: project.discoveryTimeWindow,
    coverPath: cover.localPath,
    slidePaths: slides.map((s) => s.localPath),
    decision: null,        // to be filled by human review
    decisionReason: null,
    layoutNotes: null,
  });
}

// Sort by appreciations DESC — let the Behance community signal drive priority.
// Theme is INFORMATION not preference; the library wants variety, not a single
// aesthetic. The human reviewer judges design quality on visual merit.
queued.sort((a, b) => b.appreciations - a.appreciations);

await writeFile(resolve(DATA, "rejected.json"), JSON.stringify(rejected, null, 2));
await writeFile(resolve(DATA, "pending-review.json"), JSON.stringify(queued, null, 2));

console.log(`✓ rejected ${rejected.length}  →  data/rejected.json`);
console.log(`✓ pending ${queued.length}  →  data/pending-review.json`);
console.log("");
console.log("Theme distribution (descriptive — variety is the goal):");
const themes = new Map();
for (const q of queued) themes.set(q.theme, (themes.get(q.theme) || 0) + 1);
for (const [t, n] of [...themes.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${t}: ${n}`);
}
console.log("");
console.log("Appreciation tier distribution:");
const tiers = new Map();
for (const q of queued) tiers.set(q.tier, (tiers.get(q.tier) || 0) + 1);
for (const t of ["viral", "popular", "strong", "decent", "baseline"]) {
  if (tiers.has(t)) console.log(`  ${t}: ${tiers.get(t)}`);
}
