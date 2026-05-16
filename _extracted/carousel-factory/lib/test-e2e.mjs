/**
 * End-to-end factory test (local, no LLM, no CF):
 *   1. Build a sample CarouselSpec by hand
 *   2. compose() → HTML strings
 *   3. renderHtmlsToPngs() → PNGs on disk
 *
 * Validates the typed-layout pipeline works before we wire the planner.
 */

import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

// Compile compose.ts at runtime via tsx OR import the compiled .js.
// For simplicity here we just inline the imports and run the JS-equivalent.
import { compose } from "./compose.js"; // expects tsc compiled output
import { renderHtmlsToPngs } from "./render.mjs";

const FACTORY_ROOT = resolve(import.meta.dirname, "..");
const LAYOUTS_DIR = resolve(FACTORY_ROOT, "layouts");
const OUT_DIR = resolve(FACTORY_ROOT, "test-output");

await mkdir(OUT_DIR, { recursive: true });

// Sample spec: the full "How to move like a 20-person team" carousel
// rebuilt using the typed-layout library.
const spec = {
  id: "test-e2e",
  brand: "Ultron",
  brief: "How to move like a 20-person team — the AI stack that replaced our org chart.",
  theme: "ember-dark",
  slides: [
    {
      layoutId: "cover-display-cta",
      slots: {
        pageNumber: "01",
        headlineLine1: "How to move like a",
        headlineLine2: "20-person team",
        accentSuffix: ".",
      },
    },
    {
      layoutId: "body-icon-centered",
      slots: {
        pageNumber: "02",
        title: "1. Notion, the brain",
        body: "Every thought, client, project, content idea, transcript, SOP, and conversation in one place.",
        iconSlug: "notion",
        iconColor: "#ffffff",
      },
    },
    {
      layoutId: "body-icon-centered",
      slots: {
        pageNumber: "03",
        title: "2. Claude Code, the builder",
        body: "10 AI departments, CFO, CMO, Chief of staff, etc. On both my Macbook Pro & Cloud server.",
        iconSlug: "claude",
        iconColor: "#ff5e1a",
      },
    },
    {
      layoutId: "body-icon-centered",
      slots: {
        pageNumber: "04",
        title: "3. Ultron, the growth engine",
        body: "Five specialized AI agents splitting the go-to-market work in parallel for 10x speed.",
        // No icon slug — would need a custom Ultron SVG
        iconSvg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" fill="none" stroke="#ff5e1a" stroke-width="1.5"/><circle cx="12" cy="12" r="5" fill="#ff5e1a"/></svg>',
      },
    },
    {
      layoutId: "body-icon-centered",
      slots: {
        pageNumber: "05",
        title: "4. Apify, the scraper",
        body: "Automated data extraction to feed the AI agents with fresh leads, competitor intel, and market signals 24/7.",
        // Apify isn't in simple-icons — placeholder
        iconSvg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><polygon points="12,3 21,19 3,19" fill="#ff8c00"/></svg>',
      },
    },
    {
      layoutId: "body-icon-centered",
      slots: {
        pageNumber: "06",
        title: "5. Supabase, the vault",
        body: "The backend database securely storing every scraped lead, user interaction, and agent output in real-time.",
        iconSlug: "supabase",
        iconColor: "#3FCF8E",
      },
    },
    {
      layoutId: "body-icon-centered",
      slots: {
        pageNumber: "07",
        title: "6. Stripe, the bank",
        body: "Payment processing, invoicing, and subscription management handling the revenue without an accounting team.",
        iconSlug: "stripe",
        iconColor: "#635BFF",
      },
    },
    {
      layoutId: "body-icon-centered",
      slots: {
        pageNumber: "08",
        title: "7. Github, the codebase",
        body: "The company's core operating system, controlling the logic, automations, and code.",
        iconSlug: "github",
        iconColor: "#ffffff",
      },
    },
    {
      layoutId: "body-icon-centered",
      slots: {
        pageNumber: "09",
        title: "8. Cloudflare, the infra",
        body: "Security, global routing, and bot protection ensuring the entire infrastructure stays unhackable.",
        iconSlug: "cloudflare",
        iconColor: "#F38020",
      },
    },
    {
      layoutId: "body-icon-centered",
      slots: {
        pageNumber: "10",
        title: "9. Channels, the distribution",
        body: "The automated distribution network publishing campaigns on Instagram, YouTube, TikTok, and LinkedIn.",
        // Could be a multi-icon variant — for now a placeholder for slot 10
        iconSvg: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" fill="none" stroke="#ff5e1a" stroke-width="1.5"/></svg>',
      },
    },
  ],
};

console.log("→ composing");
const htmls = await compose(spec, { layoutsDir: LAYOUTS_DIR });
console.log(`  ${htmls.length} HTML strings`);

console.log("→ rendering");
const results = await renderHtmlsToPngs(htmls, OUT_DIR, { concurrency: 4 });
console.log(`  ${results.length} PNGs written to ${OUT_DIR}`);
for (const r of results) console.log(`  ${r.name}: ${(r.bytes / 1024).toFixed(1)} KB`);
