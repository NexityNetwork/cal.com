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

/** Color theme classification from cover's dominant RGB. */
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

/** Estimate brand-fit for Ultron (dark + orange). 0-3 scale. */
function brandFitScore(theme, rgb) {
  if (!rgb) return 1;
  // Ultron palette: dark bg + ember orange accent (~#ff5e1a → r=255, g=94, b=26)
  const isDark = theme === "dark" || theme === "dark-muted";
  const isOrangeFamily = rgb.r > rgb.g && rgb.g > rgb.b && rgb.r - rgb.b > 60;
  if (isDark && isOrangeFamily) return 3;
  if (isDark) return 2;
  if (theme === "mid" || theme === "light-muted") return 1;
  return 0;
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
  const brandFit = brandFitScore(theme, cover.colorRgb);

  queued.push({
    projectId,
    projectName: project.projectName,
    designerHandle: project.designerHandle,
    designerName: project.designerName,
    projectUrl: project.projectUrl,
    appreciations: project.appreciations,
    views: project.views,
    slideCount: slides.length,
    theme,
    brandFit,
    coverColor: cover.colorRgb,
    discoveryQuery: project.discoveryQuery,
    discoveryTimeWindow: project.discoveryTimeWindow,
    coverPath: cover.localPath,
    slidePaths: slides.map((s) => s.localPath),
    decision: null, // to be filled by human review
    decisionReason: null,
    layoutNotes: null,
  });
}

// Sort queued by brandFit DESC, appreciations DESC — most promising first
queued.sort((a, b) => (b.brandFit - a.brandFit) || (b.appreciations - a.appreciations));

await writeFile(resolve(DATA, "rejected.json"), JSON.stringify(rejected, null, 2));
await writeFile(resolve(DATA, "pending-review.json"), JSON.stringify(queued, null, 2));

console.log(`✓ rejected ${rejected.length}  →  data/rejected.json`);
console.log(`✓ pending ${queued.length}  →  data/pending-review.json`);
console.log("");
console.log("Theme breakdown:");
const themes = new Map();
for (const q of queued) themes.set(q.theme, (themes.get(q.theme) || 0) + 1);
for (const [t, n] of [...themes.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${t}: ${n}`);
}
console.log("");
console.log("Brand-fit breakdown (Ultron dark+ember):");
const fits = new Map();
for (const q of queued) fits.set(q.brandFit, (fits.get(q.brandFit) || 0) + 1);
for (const [f, n] of [...fits.entries()].sort((a, b) => b[0] - a[0])) {
  console.log(`  ${f === 3 ? "high" : f === 2 ? "med" : f === 1 ? "low" : "none"} (${f}): ${n}`);
}
