/**
 * Re-render every carousel in batch-output/ with identity slots stripped
 * (handle, brand, brandTag, domain, domainText). Uses cached *.spec.json
 * so no Kimi calls. Re-composes + re-renders only.
 *
 * Usage:
 *   node tools/strip-handles.mjs                  # all carousels
 *   node tools/strip-handles.mjs id1,id2,id3      # specific IDs
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { compose } from "../lib/compose.js";
import { renderAndQa } from "../lib/dom-qa.mjs";

const FACTORY = resolve(import.meta.dirname, "..");
const LAYOUTS = resolve(FACTORY, "layouts");
const OUT = resolve(FACTORY, "batch-output");

const KILL_SLOTS = [
  // identity
  "handle", "brand", "brandTag", "domain", "domainText",
  // author/byline
  "author", "authorName", "authorInitials", "authorQuote", "authorRole",
  "byLine", "avatarLetter",
  // pagination / swipe
  "pageOf", "pageNumber", "pageBadge", "pageLabel", "swipeLabel",
  // CTA button labels (containers stripped by compose.stripEmptyDecoratives)
  "buttonLabel", "btnPrimary", "btnGhost", "buttonLine",
];
const CONCURRENCY = Number(process.env.CONCURRENCY || 4);

const idFilter = process.argv[2]
  ? new Set(process.argv[2].split(",").map((s) => s.trim()))
  : null;

const specFiles = (await readdir(OUT))
  .filter((f) => f.endsWith(".spec.json"))
  .map((f) => f.replace(/\.spec\.json$/, ""))
  .filter((id) => !idFilter || idFilter.has(id));

console.log(`→ Re-rendering ${specFiles.length} carousels (handles killed), concurrency=${CONCURRENCY}`);

async function pmap(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const startedAt = Date.now();
let stripped = 0;
let skipped = 0;

const results = await pmap(specFiles, CONCURRENCY, async (id, idx) => {
  const tag = `[${idx + 1}/${specFiles.length}] ${id}`;
  try {
    const specPath = join(OUT, `${id}.spec.json`);
    const spec = JSON.parse(await readFile(specPath, "utf8"));

    for (const slide of spec.slides || []) {
      if (!slide.slots) continue;
      for (const key of KILL_SLOTS) {
        if (key in slide.slots) slide.slots[key] = "";
      }
    }

    // Always re-render: compose.stripEmptyDecoratives may have changed even
    // when slot values were already empty, so the output PNGs need refresh.
    await writeFile(specPath, JSON.stringify(spec, null, 2));
    const htmls = await compose(spec, { layoutsDir: LAYOUTS });
    const dir = join(OUT, id);
    await renderAndQa(htmls, dir, { concurrency: 2 });
    stripped++;
    console.log(`✓ ${tag} — handles/author/pagination/buttons stripped`);
    return { id, status: "ok" };
  } catch (e) {
    console.log(`✗ ${tag} — ${e.message}`);
    return { id, status: "err", error: e.message };
  }
});

const dur = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`\nDone in ${dur}s — stripped ${stripped}, skipped ${skipped} (no handles), errors ${results.filter((r) => r.status === "err").length}.`);
