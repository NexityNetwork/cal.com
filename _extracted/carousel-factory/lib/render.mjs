/**
 * Batch renderer: takes an array of HTML strings + an output dir, writes
 * one PNG per slide at exact 1080x1350.
 *
 * Uses a single Playwright browser + one new page per render. Pages can
 * render in parallel up to a configurable concurrency (default 4).
 *
 * USE (CLI):
 *   node render.mjs <spec.json> <output-dir>
 *
 * USE (programmatic):
 *   import { renderHtmlsToPngs } from "./lib/render.mjs";
 *   await renderHtmlsToPngs(htmls, "/tmp/out", { concurrency: 4 });
 */

import { chromium } from "playwright";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const W = 1080;
const H = 1350;

export async function renderHtmlsToPngs(htmls, outDir, opts = {}) {
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
        const png = await page.screenshot({
          type: "png",
          clip: { x: 0, y: 0, width: W, height: H },
        });
        const name = `slide-${String(idx + 1).padStart(2, "0")}.png`;
        await writeFile(join(outDir, name), png);
        return { idx, name, bytes: png.length };
      } finally {
        await page.close();
      }
    };

    // Simple semaphore for concurrency limiting.
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
    return results.sort((a, b) => a.idx - b.idx);
  } finally {
    await browser.close();
  }
}

// CLI entry — takes a JSON file containing an array of HTML strings.
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , specFile, outDir] = process.argv;
  if (!specFile || !outDir) {
    console.error("Usage: node render.mjs <htmls.json> <out-dir>");
    process.exit(1);
  }
  const htmls = JSON.parse(await readFile(specFile, "utf8"));
  const results = await renderHtmlsToPngs(htmls, resolve(outDir));
  console.log(`✓ rendered ${results.length} slides`);
  for (const r of results) console.log(`  ${r.name}: ${r.bytes} bytes`);
}
