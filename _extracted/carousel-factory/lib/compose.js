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

// Brand-color fallbacks for slugs not in simple-icons (often big brands due to trademark policy
// or newer/niche tools that haven't been added).
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
  // Data + analytics
  dbt: { color: "#FF694B", glyph: "dbt" },
  hightouch: { color: "#FFC247", glyph: "Ht" },
  metabase: { color: "#509EE3", glyph: "Mb" },
  posthog: { color: "#F9BD2B", glyph: "Ph" },
  amplitude: { color: "#1F45FC", glyph: "Am" },
  mixpanel: { color: "#7856FF", glyph: "Mx" },
  fivetran: { color: "#0073E6", glyph: "Fv" },
  segment: { color: "#52BD95", glyph: "Sg" },
  snowflake: { color: "#29B5E8", glyph: "SF" },
  databricks: { color: "#FF3621", glyph: "Db" },
  airbyte: { color: "#615EFF", glyph: "Ab" },
  // Design + collab
  penpot: { color: "#E5F65C", glyph: "Pp" },
  coolors: { color: "#5C9EE5", glyph: "Co" },
  unsplash: { color: "#1A1A1A", glyph: "Un" },
  inkscape: { color: "#000000", glyph: "Ik" },
  rive: { color: "#FF5722", glyph: "Rv" },
  // AI / agents
  perplexityai: { color: "#1FB8CD", glyph: "Px" },
  anthropic: { color: "#D97757", glyph: "An" },
  crewai: { color: "#FF6B35", glyph: "Cr" },
  dify: { color: "#1B68FF", glyph: "Df" },
  langgraph: { color: "#7FC8FF", glyph: "Lg" },
  langsmith: { color: "#7FC8FF", glyph: "Ls" },
  llamaindex: { color: "#1F45FC", glyph: "Li" },
  replicate: { color: "#000000", glyph: "Rp" },
  midjourney: { color: "#5865F2", glyph: "Mj" },
  // Dev infra
  sentry: { color: "#362D59", glyph: "Sn" },
  datadog: { color: "#632CA6", glyph: "Dd" },
  newrelic: { color: "#00AC69", glyph: "Nr" },
  grafana: { color: "#F46800", glyph: "Gf" },
  prometheus: { color: "#E6522C", glyph: "Pr" },
  jaeger: { color: "#60D0E4", glyph: "Jg" },
  cloudflare: { color: "#F38020", glyph: "Cf" },
  fly: { color: "#7B3FE4", glyph: "Fly" },
  flyio: { color: "#7B3FE4", glyph: "Fly" },
  railway: { color: "#0B0D0E", glyph: "Rw" },
  render: { color: "#46E3B7", glyph: "Rn" },
  netlify: { color: "#00C7B7", glyph: "Nt" },
  fastly: { color: "#FF282D", glyph: "Ft" },
  modal: { color: "#7FEE64", glyph: "Md" },
  upstash: { color: "#00E9A3", glyph: "Up" },
  planetscale: { color: "#000000", glyph: "Ps" },
  neon: { color: "#00E599", glyph: "Nn" },
  turso: { color: "#4FF8D2", glyph: "Tu" },
  // CLI tools / dev
  fzf: { color: "#FF6B35", glyph: "FZF" },
  ag: { color: "#9C27B0", glyph: "AG" },
  bat: { color: "#3A7EE0", glyph: "BAT" },
  eza: { color: "#FF7A3C", glyph: "EZA" },
  zoxide: { color: "#5C4DFE", glyph: "ZX" },
  starship: { color: "#FE5722", glyph: "St" },
  warp: { color: "#01A4FF", glyph: "Wp" },
  ghostty: { color: "#7833AB", glyph: "Gh" },
  // SaaS / ops
  resend: { color: "#000000", glyph: "Rs" },
  postman: { color: "#FF6C37", glyph: "Pm" },
  bisect: { color: "#F05032", glyph: "Bs" },
  wireshark: { color: "#1679A7", glyph: "Ws" },
  devtools: { color: "#4285F4", glyph: "Dt" },
  deepgram: { color: "#13EF93", glyph: "Dg" },
  elevenlabs: { color: "#000000", glyph: "El" },
  // Catch common variants
  chatgptai: { color: "#10A37F", glyph: "GPT" },
  google: { color: "#4285F4", glyph: "G" },
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

// Deterministic color from slug hash (so the same slug always gets the same fallback color)
function colorFromSlug(slug) {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) | 0;
  const hues = [212, 26, 350, 168, 280, 45, 200, 305, 132, 12];
  const hue = hues[Math.abs(h) % hues.length];
  return `hsl(${hue} 78% 48%)`;
}

function monogramFromSlug(slug) {
  // Take the first 2 letters and title-case (e.g. "metabase" -> "Mb", "n8n" -> "n8")
  const normalized = String(slug).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalized.length === 0) return "?";
  if (normalized.length === 1) return normalized.toUpperCase();
  return normalized.charAt(0).toUpperCase() + normalized.charAt(1);
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
    // No simple-icons match → render nothing rather than a placeholder
    // monogram. Empty SVG lets the DOM stripper collapse the chip.
  }
  return "";
}
