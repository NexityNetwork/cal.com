/**
 * Composer: spec → HTML strings, one per slide.
 *
 * Substitutes {{slot}} placeholders in the layout template with the slot
 * values from the spec. For icon slots, resolves simple-icons slugs to
 * inline SVG. No HTML sanitization on slots — the planner is trusted to
 * produce safe content (carousels are not user-input rendered to other
 * users; output goes straight to PNG via Playwright).
 *
 * USE:
 *   import { compose } from "./lib/compose";
 *   const htmls = await compose(spec, { layoutsDir: "./layouts" });
 *
 * EXPECTS:
 *   layoutsDir/
 *     <layoutId>/
 *       template.html
 *       schema.ts (TypeScript export — not consumed at runtime, doc-only)
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as si from "simple-icons";

export interface CarouselSpec {
  /** Stable id for this carousel (used as R2 prefix). */
  id: string;
  /** Brand name — drives palette overrides if we add them later. */
  brand: string;
  /** Brief that produced this carousel, for the audit trail. */
  brief: string;
  /** Theme — currently only "ember-dark". */
  theme: "ember-dark";
  /** Ordered slides. */
  slides: SlideSpec[];
}

export interface SlideSpec {
  /** Which layout in the library to use. */
  layoutId: string;
  /** Slot fills — shape depends on the layout's schema. */
  slots: Record<string, string>;
}

export interface ComposeOptions {
  /** Absolute or relative path to the carousel-factory/layouts/ directory. */
  layoutsDir: string;
}

/**
 * Compose a CarouselSpec into per-slide HTML strings ready for Playwright.
 */
export async function compose(
  spec: CarouselSpec,
  opts: ComposeOptions,
): Promise<string[]> {
  const htmls: string[] = [];
  for (const slide of spec.slides) {
    htmls.push(await composeSlide(slide, opts));
  }
  return htmls;
}

async function composeSlide(
  slide: SlideSpec,
  opts: ComposeOptions,
): Promise<string> {
  const templatePath = resolve(opts.layoutsDir, slide.layoutId, "template.html");
  let html = await readFile(templatePath, "utf8");

  // Build slot value map. For icon slots, resolve to inline SVG.
  const fills: Record<string, string> = { ...slide.slots };

  // If the layout uses an iconSvgInline placeholder, resolve from iconSlug
  // or iconSvg slots.
  if (html.includes("{{iconSvgInline}}")) {
    fills.iconSvgInline = resolveIcon(
      slide.slots.iconSlug,
      slide.slots.iconSvg,
      slide.slots.iconColor || "#ffffff",
    );
  }

  // Mustache-style substitution. No conditionals, no loops — keep simple.
  // If a placeholder has no value, replace with empty string (so empty
  // accent suffixes don't show up as literal "{{accentSuffix}}").
  html = html.replace(/\{\{(\w+)\}\}/g, (_, key) => fills[key] ?? "");

  return html;
}

/**
 * Resolve an icon to an inline SVG element.
 * Priority: explicit iconSvg > iconSlug (via simple-icons) > placeholder.
 */
function resolveIcon(
  slug: string | undefined,
  svg: string | undefined,
  color: string,
): string {
  if (svg) {
    // Trust the caller — they're providing custom SVG (e.g. for LinkedIn,
    // Apify, or other icons not in simple-icons).
    return svg;
  }
  if (slug) {
    const key = "si" + slug.charAt(0).toUpperCase() + slug.slice(1);
    // @ts-expect-error — simple-icons typings export each icon as a property
    const icon = (si as Record<string, { path: string }>)[key];
    if (icon) {
      return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="${icon.path}" fill="${color}"/></svg>`;
    }
  }
  // Fallback: empty rectangle marker so a missing icon is obvious in QA.
  return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" fill="${color}" opacity="0.2"/></svg>`;
}
