/**
 * Re-render existing spec.json files with current templates.
 * Skips Kimi entirely — only re-composes + re-renders PNGs.
 *
 * USE:
 *   node tools/rerender.mjs <id1> [<id2> ...]
 *   node tools/rerender.mjs --family edu-bright
 */

import { readFile, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { compose } from "../lib/compose.js";
import { renderHtmlsToPngs } from "../lib/render.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(ROOT, "batch-output");
const LAYOUTS = resolve(ROOT, "layouts");

const args = process.argv.slice(2);
let ids = [];
const familyIdx = args.indexOf("--family");
if (familyIdx >= 0) {
  const family = args[familyIdx + 1];
  const all = await readdir(OUT);
  const specs = all.filter((f) => f.endsWith(".spec.json"));
  for (const f of specs) {
    const s = JSON.parse(await readFile(resolve(OUT, f), "utf8"));
    if (s.theme === family) ids.push(s.id);
  }
  console.log(`→ matched ${ids.length} carousels in family "${family}"`);
} else {
  ids = args;
}

if (!ids.length) {
  console.error("Usage: node tools/rerender.mjs <id...> | --family <name>");
  process.exit(1);
}

const startedAt = Date.now();
for (const id of ids) {
  const specPath = resolve(OUT, `${id}.spec.json`);
  try {
    const spec = JSON.parse(await readFile(specPath, "utf8"));
    const htmls = await compose(spec, { layoutsDir: LAYOUTS });
    const dir = resolve(OUT, id);
    const r = await renderHtmlsToPngs(htmls, dir, { concurrency: 2 });
    console.log(`✓ ${id} — ${r.length} slides re-rendered`);
  } catch (e) {
    console.log(`✗ ${id} — ${e.message}`);
  }
}
const dur = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`\nDone in ${dur}s.`);
