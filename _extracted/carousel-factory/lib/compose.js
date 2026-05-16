// JS shim that imports compose.ts at runtime via tsx loader (production
// path) OR for local node-only run we transpile inline. Simplest: a
// transpiled-to-JS version of compose.ts. Keeping in sync manually for now;
// long-term, run lib/ through tsc.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as si from "simple-icons";

export async function compose(spec, opts) {
  const htmls = [];
  for (const slide of spec.slides) {
    htmls.push(await composeSlide(slide, opts));
  }
  return htmls;
}

async function composeSlide(slide, opts) {
  const templatePath = resolve(opts.layoutsDir, slide.layoutId, "template.html");
  let html = await readFile(templatePath, "utf8");

  const fills = { ...slide.slots };

  if (html.includes("{{iconSvgInline}}")) {
    fills.iconSvgInline = resolveIcon(
      slide.slots.iconSlug,
      slide.slots.iconSvg,
      slide.slots.iconColor || "#ffffff",
    );
  }

  html = html.replace(/\{\{(\w+)\}\}/g, (_, key) => fills[key] ?? "");
  return html;
}

function resolveIcon(slug, svg, color) {
  if (svg) return svg;
  if (slug) {
    const key = "si" + slug.charAt(0).toUpperCase() + slug.slice(1);
    const icon = si[key];
    if (icon) {
      return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="${icon.path}" fill="${color}"/></svg>`;
    }
  }
  return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" fill="${color}" opacity="0.2"/></svg>`;
}
