/**
 * Build a static HTML gallery of all carousels in batch-output/.
 * Each carousel shows 8 slide thumbnails + brief + theme.
 * Usage: node tools/build-gallery.mjs
 * Writes: batch-output/index.html
 */
import { readdir, stat, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const FACTORY = resolve(import.meta.dirname, "..");
const OUT = resolve(FACTORY, "batch-output");

const dirEntries = (await readdir(OUT, { withFileTypes: true })).filter((d) => d.isDirectory());
const withMtimes = await Promise.all(
  dirEntries.map(async (d) => {
    const st = await stat(join(OUT, d.name));
    return { name: d.name, mtimeMs: st.mtimeMs };
  })
);
// Newest first
const dirs = withMtimes.sort((a, b) => b.mtimeMs - a.mtimeMs).map((d) => d.name);

const cards = [];
for (const id of dirs) {
  const dir = join(OUT, id);
  const specPath = join(OUT, `${id}.spec.json`);
  let spec = null;
  try { spec = JSON.parse(await readFile(specPath, "utf8")); } catch {}
  const files = (await readdir(dir)).filter((f) => f.endsWith(".png")).sort();
  if (!files.length) continue;
  const brief = spec?.brief ?? "—";
  const theme = spec?.theme ?? "—";
  const brand = spec?.brand ?? id;
  const slides = files.map((f) => `<img loading="lazy" src="${id}/${f}" alt="${f}">`).join("");
  cards.push(`
    <article class="card">
      <header>
        <div class="theme">${theme}</div>
        <h2>${brand}</h2>
        <p>${brief}</p>
      </header>
      <div class="slides">${slides}</div>
    </article>`);
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Carousel Factory — Gallery (${dirs.length})</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0d0d0f;color:#e6e6e6;padding:32px;}
  h1{font-size:28px;margin-bottom:24px;font-weight:700;}
  .stats{color:#999;margin-bottom:32px;font-size:14px;}
  .card{background:#17171a;border:1px solid #2a2a2e;border-radius:14px;padding:22px;margin-bottom:32px;}
  .card header{margin-bottom:18px;}
  .theme{display:inline-block;padding:4px 10px;background:#2a2a2e;color:#b7e84a;border-radius:6px;font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:10px;}
  .card h2{font-size:18px;font-weight:700;margin-bottom:6px;}
  .card p{font-size:14px;color:#999;line-height:1.4;}
  .slides{display:grid;grid-template-columns:repeat(8,1fr);gap:8px;}
  .slides img{width:100%;aspect-ratio:1080/1350;object-fit:cover;border-radius:6px;background:#222;border:1px solid #2a2a2e;cursor:zoom-in;}
  .slides img:hover{border-color:#b7e84a;}
  @media (max-width: 1400px) { .slides { grid-template-columns: repeat(4, 1fr); } }
</style>
</head>
<body>
  <h1>Carousel Factory</h1>
  <div class="stats">${dirs.length} carousels · ${cards.length} rendered · click thumbnails to open full size</div>
  ${cards.join("\n")}
  <script>
    document.querySelectorAll(".slides img").forEach((img) => {
      img.addEventListener("click", () => window.open(img.src, "_blank"));
    });
  </script>
</body>
</html>`;

await writeFile(join(OUT, "index.html"), html);
console.log(`✓ Gallery: ${dirs.length} carousels, ${cards.length} cards → batch-output/index.html`);
