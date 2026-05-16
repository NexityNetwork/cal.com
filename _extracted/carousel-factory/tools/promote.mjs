/**
 * Promote human-reviewed Behance carousels into the marketing-swarm-layouts
 * library.
 *
 * Reads `data/pending-review.json` after a human (the Claude Code session
 * or you directly) has filled in the `decision` field for each entry:
 *   - "keep"     → copy slides + meta.json into marketing-swarm-layouts
 *   - "extract"  → as 'keep' + flag for new-layout extraction
 *   - "reject"   → log to data/rejected-by-human.json, skip
 *   - null/undecided → leave alone, run promote again later
 *
 * Usage:
 *   node tools/promote.mjs
 *
 * Outputs:
 *   _extracted/marketing-swarm-layouts/carousels/behance--<projectId>/  per kept project
 *   _extracted/carousel-factory/data/rejected-by-human.json              the reject log
 */

import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
import { resolve, join, basename } from "node:path";

const FACTORY_ROOT = resolve(import.meta.dirname, "..");
const REPO_ROOT = resolve(FACTORY_ROOT, "..", "..");
const DATA = resolve(FACTORY_ROOT, "data");
const LAYOUTS_OUT = resolve(REPO_ROOT, "_extracted/marketing-swarm-layouts/carousels");
const EXTRACTED_FOR_LAYOUTS = resolve(FACTORY_ROOT, "data/extract-queue.json");

const pending = JSON.parse(await readFile(resolve(DATA, "pending-review.json"), "utf8"));

const kept = [];
const extractQueue = [];
const rejectedByHuman = [];
const stillPending = [];

for (const entry of pending) {
  if (entry.decision === "keep" || entry.decision === "extract") {
    // Create per-project directory under marketing-swarm-layouts
    const targetDir = resolve(LAYOUTS_OUT, `behance--${entry.projectId}`);
    await mkdir(join(targetDir, "pngs"), { recursive: true });

    // Copy each slide PNG (the scraped WebPs are pixel-correct 1080×1350)
    for (const localPath of entry.slidePaths) {
      const src = resolve(DATA, localPath);
      const filename = basename(localPath).replace(/\.webp$/, ".webp");
      const dst = join(targetDir, "pngs", filename);
      await cp(src, dst);
    }

    // Write meta.json — same shape as the existing scraped--* dirs
    const meta = {
      type: "scraped-reference",
      source: `Behance @${entry.designerHandle} (${entry.designerName})`,
      sourceUrl: entry.projectUrl,
      slideCount: entry.slideCount,
      title: entry.projectName,
      theme: entry.theme,
      brandFitForUltron: ["none", "low", "medium", "high"][entry.brandFit] || "unknown",
      appreciations: entry.appreciations,
      views: entry.views,
      discoveryQuery: entry.discoveryQuery,
      humanNotes: entry.layoutNotes ?? null,
      promotedAt: new Date().toISOString(),
    };
    await writeFile(join(targetDir, "meta.json"), JSON.stringify(meta, null, 2));

    kept.push({ projectId: entry.projectId, targetDir });

    if (entry.decision === "extract") {
      extractQueue.push({
        projectId: entry.projectId,
        projectName: entry.projectName,
        layoutNotes: entry.layoutNotes,
        targetDir,
      });
    }
  } else if (entry.decision === "reject") {
    rejectedByHuman.push({
      projectId: entry.projectId,
      projectName: entry.projectName,
      reason: entry.decisionReason ?? "(no reason given)",
    });
  } else {
    stillPending.push(entry);
  }
}

// Rewrite pending-review.json with only the still-pending entries
await writeFile(resolve(DATA, "pending-review.json"), JSON.stringify(stillPending, null, 2));

// Append rejected-by-human (don't overwrite — accumulate across runs)
let prevReject = [];
try {
  prevReject = JSON.parse(await readFile(resolve(DATA, "rejected-by-human.json"), "utf8"));
} catch {}
await writeFile(
  resolve(DATA, "rejected-by-human.json"),
  JSON.stringify([...prevReject, ...rejectedByHuman], null, 2),
);

await writeFile(EXTRACTED_FOR_LAYOUTS, JSON.stringify(extractQueue, null, 2));

console.log(`✓ promoted ${kept.length} projects → marketing-swarm-layouts/carousels/behance--*`);
console.log(`✓ ${extractQueue.length} flagged for layout extraction → data/extract-queue.json`);
console.log(`✓ ${rejectedByHuman.length} rejected by human → data/rejected-by-human.json`);
console.log(`  ${stillPending.length} still awaiting decision`);
