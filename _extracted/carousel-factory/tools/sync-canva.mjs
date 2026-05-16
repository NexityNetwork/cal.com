/**
 * Sync the Canva carousel scrape from nexitynetwork/ultron-scrapers.
 *
 * Pulls (or git-pulls if already cloned) the scrapers repo, normalises the
 * `data/canva-carousels/` tree into our local format. Reuses the same
 * /tmp/scrapers checkout that sync-behance.mjs uses.
 *
 * Usage:
 *   GITHUB_PAT=... node tools/sync-canva.mjs
 *
 * Outputs:
 *   _extracted/carousel-factory/data/canva-manifest.jsonl
 *   _extracted/carousel-factory/data/canva-slides/<shard>/<id>_NN.webp
 */
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const PAT = process.env.GITHUB_PAT;
if (!PAT) throw new Error("Set GITHUB_PAT env var (PAT with repo scope)");

const SCRAPERS_BRANCH = "claude/apify-actors-ingestion-texer";
const SCRAPERS_REPO = "github.com/nexitynetwork/ultron-scrapers.git";
const SCRAPERS_LOCAL = "/tmp/scrapers";
const FACTORY_ROOT = resolve(import.meta.dirname, "..");
const DATA_LOCAL = resolve(FACTORY_ROOT, "data");
const remoteUrl = `https://x-access-token:${PAT}@${SCRAPERS_REPO}`;

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} → ${r.status}`);
}

if (!existsSync(SCRAPERS_LOCAL)) {
  run("git", ["clone", "--depth=1", "--branch", SCRAPERS_BRANCH, remoteUrl, SCRAPERS_LOCAL]);
} else {
  run("git", ["-C", SCRAPERS_LOCAL, "fetch", "origin", SCRAPERS_BRANCH], { stdio: "pipe" });
  run("git", ["-C", SCRAPERS_LOCAL, "reset", "--hard", `origin/${SCRAPERS_BRANCH}`], { stdio: "pipe" });
}

const srcManifest = resolve(SCRAPERS_LOCAL, "data/canva-carousels/manifest.jsonl");
const srcSlidesDir = resolve(SCRAPERS_LOCAL, "data/canva-carousels/slides");
const dstManifest = resolve(DATA_LOCAL, "canva-manifest.jsonl");
const dstSlidesDir = resolve(DATA_LOCAL, "canva-slides");

await mkdir(DATA_LOCAL, { recursive: true });
await cp(srcManifest, dstManifest);
await cp(srcSlidesDir, dstSlidesDir, { recursive: true });

const manifest = (await readFile(dstManifest, "utf8")).trim().split("\n");
const uniq = new Set(manifest.map((l) => JSON.parse(l).templateId));
await writeFile(
  resolve(DATA_LOCAL, "canva-sync-status.json"),
  JSON.stringify({ syncedAt: new Date().toISOString(), slideCount: manifest.length, templateCount: uniq.size }, null, 2)
);
console.log(`✓ Canva sync: ${manifest.length} slides across ${uniq.size} templates → data/canva-{manifest.jsonl,slides/}`);
