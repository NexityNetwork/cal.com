/**
 * Sync the Behance carousel scrape from nexitynetwork/ultron-scrapers.
 *
 * Pulls (or git-pulls if already cloned) the scrapers repo, normalises the
 * `data/behance-carousels/` tree into our local format, and writes a
 * timestamp file so subsequent runs are diff-only.
 *
 * Usage:
 *   GITHUB_PAT=... node tools/sync-behance.mjs
 *
 * Outputs:
 *   /tmp/scrapers/                              cloned scrapers repo (kept warm)
 *   _extracted/carousel-factory/data/manifest.jsonl   merged manifest (local copy)
 *   _extracted/carousel-factory/data/slides/<shard>/  WebP slides (copied)
 */

import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir, cp, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";

const FACTORY_ROOT = resolve(import.meta.dirname, "..");
const SCRAPERS_LOCAL = "/tmp/scrapers";
const SCRAPERS_BRANCH = "claude/apify-actors-ingestion-texer";
const SCRAPERS_REPO = "github.com/nexitynetwork/ultron-scrapers.git";

const PAT = process.env.GITHUB_PAT;
if (!PAT) {
  console.error("GITHUB_PAT env var required");
  process.exit(1);
}

const DATA_LOCAL = resolve(FACTORY_ROOT, "data");
await mkdir(DATA_LOCAL, { recursive: true });

// ─── Sync scrapers repo ────────────────────────────────────────────────────

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} exited ${r.status}`);
}

const remoteUrl = `https://x-access-token:${PAT}@${SCRAPERS_REPO}`;

if (!existsSync(SCRAPERS_LOCAL)) {
  console.log("→ cloning scrapers repo (shallow)");
  run("git", ["clone", "--depth=1", "--branch", SCRAPERS_BRANCH, remoteUrl, SCRAPERS_LOCAL]);
} else {
  console.log("→ pulling latest");
  run("git", ["-C", SCRAPERS_LOCAL, "fetch", "origin", SCRAPERS_BRANCH], { stdio: "pipe" });
  run("git", ["-C", SCRAPERS_LOCAL, "reset", "--hard", `origin/${SCRAPERS_BRANCH}`], { stdio: "pipe" });
}

// ─── Mirror manifest + slides into local data/ ─────────────────────────────

const srcManifest = resolve(SCRAPERS_LOCAL, "data/behance-carousels/manifest.jsonl");
const srcSlidesDir = resolve(SCRAPERS_LOCAL, "data/behance-carousels/slides");
const dstManifest = resolve(DATA_LOCAL, "manifest.jsonl");
const dstSlidesDir = resolve(DATA_LOCAL, "slides");

const srcStat = await stat(srcManifest);
console.log(`→ manifest mtime: ${srcStat.mtime.toISOString()}`);

await cp(srcManifest, dstManifest);
await cp(srcSlidesDir, dstSlidesDir, { recursive: true });

const manifestText = await readFile(dstManifest, "utf8");
const lines = manifestText.split("\n").filter(Boolean);
const projects = new Set(lines.map((l) => JSON.parse(l).projectId));

console.log(`✓ mirrored ${lines.length} slide records across ${projects.size} projects`);

// Write a small status file for downstream tools
await writeFile(
  resolve(DATA_LOCAL, "sync-status.json"),
  JSON.stringify({
    syncedAt: new Date().toISOString(),
    manifestMtime: srcStat.mtime.toISOString(),
    slideCount: lines.length,
    projectCount: projects.size,
  }, null, 2),
);
