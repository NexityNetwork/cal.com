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

  // Multi-icon support: iconSvg1..iconSvg9 resolved from iconSlug1..iconSlug9 + iconColor1..iconColor9
  // If iconColor not given, auto-derive from simple-icons brand color or BRAND_FALLBACK.
  for (let i = 1; i <= 9; i++) {
    if (html.includes(`{{iconSvg${i}}}`)) {
      fills[`iconSvg${i}`] = resolveIcon(
        slide.slots[`iconSlug${i}`],
        slide.slots[`iconSvg${i}Raw`],
        slide.slots[`iconColor${i}`] || autoBrandColor(slide.slots[`iconSlug${i}`]) || "#1d1d1d",
      );
    }
  }
  // Auto-derive toolName<N> from iconSlug<N> if not provided (title-case)
  for (let i = 1; i <= 9; i++) {
    if (html.includes(`{{toolName${i}}}`) && !fills[`toolName${i}`] && slide.slots[`iconSlug${i}`]) {
      fills[`toolName${i}`] = displayNameFromSlug(slide.slots[`iconSlug${i}`]);
    }
  }
  if (html.includes("{{toolName}}") && !fills.toolName && slide.slots.iconSlug1) {
    fills.toolName = displayNameFromSlug(slide.slots.iconSlug1);
  }

  html = html.replace(/\{\{(\w+)\}\}/g, (_, key) => fills[key] ?? "");
  return html;
}

// Brand-color fallbacks for slugs not in simple-icons (often big brands due to trademark policy)
const BRAND_FALLBACK = {
  openai: { color: "#10A37F", glyph: "ai" },
  chatgpt: { color: "#10A37F", glyph: "GPT" },
  gemini: { color: "#1A73E8", glyph: "G" },
  linkedin: { color: "#0A66C2", glyph: "in" },
  salesforce: { color: "#00A1E0", glyph: "SF" },
  slack: { color: "#4A154B", glyph: "S" },
  apollo: { color: "#311C87", glyph: "AP" },
  lovable: { color: "#FF6B6B", glyph: "Lv" },
  bolt: { color: "#0077FF", glyph: "Bo" },
  v0: { color: "#000000", glyph: "v0" },
  spline: { color: "#5C4DFE", glyph: "Sp" },
  googlemaps: { color: "#34A853", glyph: "GM" },
  whatsapp: { color: "#25D366", glyph: "W" },
};

function autoBrandColor(slug) {
  if (!slug) return null;
  const normalized = String(slug).toLowerCase().replace(/[^a-z0-9]/g, "");
  const key = "si" + normalized.charAt(0).toUpperCase() + normalized.slice(1);
  const icon = si[key];
  if (icon) return "#" + icon.hex;
  const fb = BRAND_FALLBACK[normalized];
  if (fb) return fb.color;
  return null;
}

const SLUG_DISPLAY_OVERRIDES = {
  nextdotjs: "Next.js",
  n8n: "n8n",
  chatgpt: "ChatGPT",
  openai: "OpenAI",
  googlemaps: "Google Maps",
  googlemeet: "Google Meet",
  langchain: "LangChain",
  hubspot: "HubSpot",
  whatsapp: "WhatsApp",
  v0: "v0",
  github: "GitHub",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  airtable: "Airtable",
  postgresql: "PostgreSQL",
  typescript: "TypeScript",
};

function displayNameFromSlug(slug) {
  if (!slug) return "";
  const normalized = String(slug).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (SLUG_DISPLAY_OVERRIDES[normalized]) return SLUG_DISPLAY_OVERRIDES[normalized];
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function resolveIcon(slug, svg, color) {
  if (svg) return svg;
  if (slug) {
    const normalized = String(slug).toLowerCase().replace(/[^a-z0-9]/g, "");
    const key = "si" + normalized.charAt(0).toUpperCase() + normalized.slice(1);
    const icon = si[key];
    if (icon) {
      return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="${icon.path}" fill="${color}"/></svg>`;
    }
    // Fallback monogram for known big brands not in simple-icons
    const fb = BRAND_FALLBACK[normalized];
    if (fb) {
      return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="4" fill="${fb.color}"/><text x="12" y="16" text-anchor="middle" font-family="Inter,sans-serif" font-weight="800" font-size="${fb.glyph.length === 1 ? 14 : 10}" fill="#fff">${fb.glyph}</text></svg>`;
    }
  }
  return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="4" fill="${color}" opacity="0.25"/></svg>`;
}
