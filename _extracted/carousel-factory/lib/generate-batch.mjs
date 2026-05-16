/**
 * Generate N carousels using Kimi K2.6 on Workers AI + the existing
 * compose → render → dom-qa pipeline. Each brief is paired with a
 * layout *family* (ember-dark or beige-paper); the planner sees only
 * the layouts in that family.
 */
import { compose } from "./compose.js";
import { renderAndQa } from "./dom-qa.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ACCT = process.env.CF_ACCOUNT_ID;
const CF_EMAIL = process.env.CF_AUTH_EMAIL;
const CF_KEY = process.env.CF_AUTH_KEY;
if (!ACCT || !CF_EMAIL || !CF_KEY) {
  throw new Error("Set CF_ACCOUNT_ID, CF_AUTH_EMAIL, CF_AUTH_KEY env vars");
}
const AUTH = {
  "X-Auth-Email": CF_EMAIL,
  "X-Auth-Key": CF_KEY,
  "Content-Type": "application/json",
};
const KIMI_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCT}/ai/run/@cf/moonshotai/kimi-k2.6`;

const FACTORY = resolve(import.meta.dirname, "..");
const LAYOUTS = resolve(FACTORY, "layouts");
const OUT = resolve(FACTORY, "batch-output");

// ─── Layout families ───────────────────────────────────────────────────────

const FAMILY_PROMPTS = {
  "ember-dark": `Available layouts (dark ember theme):

LAYOUT cover-display-cta — FIRST slide only.
  pageNumber: "01"
  headlineLine1: first half, max 5 words
  headlineLine2: second half, max 4 words
  accentSuffix: typically "." or "!" — orange after line 2

LAYOUT body-icon-centered — body slides.
  pageNumber: "02", "03", ... (2-digit)
  title: "N. Subject, the role" works well. Max 7 words.
  body: 1-3 sentences, max 35 words. Specific concrete language. No filler ("elevate", "leverage", "transform", "unleash").
  iconSlug: simple-icons slug. Valid: notion, github, stripe, supabase, cloudflare, slack, discord, gmail, googlemeet, zoom, instagram, youtube, tiktok, x, openai, anthropic, vercel, nextdotjs, react, typescript, postgresql, redis, docker, figma, framer, linear, raycast, langchain, mongodb, airtable, zapier, calendly, loom, miro
  iconColor: hex, optional, defaults to white.`,
  "beige-paper": `Available layouts (cream/beige serif theme):

LAYOUT cover-beige-serif — FIRST slide only.
  brand: brand name (e.g. "Studio Atlas", "Salford & Co.", "Ultron")
  headline: full headline, 6-12 words. Cormorant Garamond serif at 78px.
  slideCountHero: the body-slide count as a single digit, e.g. "6"

LAYOUT body-beige-bubble — body slides.
  brand: same brand name as cover
  number: "01", "02", ... (2-digit)
  title: short tip name, 2-4 words, serif looks elegant
  body: 2-4 sentence supporting paragraph, max 50 words. Editorial tone.
  handle: "@<brand-handle>"
  domain: "<brand-domain>.com"`,
};

const PROMPT_TEMPLATE = (brief, family) => `You are a carousel planner.

${FAMILY_PROMPTS[family]}

BRIEF: ${brief}

Generate a 7-slide carousel: 1 cover + 6 body slides. Output ONLY valid JSON,
no markdown fences, no thinking out loud.

Schema:
{
  "id": "<short-kebab>",
  "brand": "<brand-name>",
  "brief": "<the brief>",
  "theme": "${family}",
  "slides": [
    {"layoutId":"${family === 'ember-dark' ? 'cover-display-cta' : 'cover-beige-serif'}","slots":{...}},
    {"layoutId":"${family === 'ember-dark' ? 'body-icon-centered' : 'body-beige-bubble'}","slots":{...}},
    ...
  ]
}`;

// ─── Briefs paired with layout families ────────────────────────────────────

const BRIEFS = [
  { id: "claude-code-stack",    family: "ember-dark",  text: "The Claude Code stack a one-person founder uses to ship like a 10-person team. Each tool, what it does, why it matters." },
  { id: "ai-agents-replace-saas", family: "ember-dark", text: "5 SaaS categories AI agents are killing in 2026 — and what to build instead." },
  { id: "founder-mistakes",     family: "ember-dark",  text: "8 mistakes I made as a first-time founder that cost me $250K." },
  { id: "productivity-tips-beige",  family: "beige-paper", text: "6 simple productivity tips from a designer who built a 7-figure studio. Calm, editorial tone. No bullshit." },
  { id: "morning-rituals-beige",    family: "beige-paper", text: "5 morning rituals that changed how I run my business. Quiet, mindful, specific." },
  { id: "writing-tips-beige",       family: "beige-paper", text: "6 writing tips for founders who hate writing. Editorial voice, gentle but pointed." },
];

// ─── Kimi planner ──────────────────────────────────────────────────────────

async function plan(brief, family) {
  const res = await fetch(KIMI_URL, {
    method: "POST",
    headers: AUTH,
    body: JSON.stringify({
      messages: [{ role: "user", content: PROMPT_TEMPLATE(brief, family) }],
      max_tokens: 8000,
      temperature: 0.6,
    }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(`Kimi err: ${JSON.stringify(data.errors).slice(0, 300)}`);
  let content =
    data.result?.choices?.[0]?.message?.content ??
    data.result?.response ??
    "";
  if (!content) {
    const finish = data.result?.choices?.[0]?.finish_reason;
    throw new Error(`Empty Kimi response (finish=${finish})`);
  }
  content = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(content);
}

// ─── Run ───────────────────────────────────────────────────────────────────

await mkdir(OUT, { recursive: true });

for (const { id, family, text } of BRIEFS) {
  console.log(`\n→ ${id}  [${family}]`);
  try {
    console.log("  planning...");
    const spec = await plan(text, family);
    spec.id = id;
    await writeFile(resolve(OUT, `${id}.spec.json`), JSON.stringify(spec, null, 2));

    console.log("  composing + rendering...");
    const htmls = await compose(spec, { layoutsDir: LAYOUTS });
    const dir = resolve(OUT, id);
    const result = await renderAndQa(htmls, dir, { concurrency: 3 });

    const pass = result.slides.filter((s) => s.qa.verdict === "pass").length;
    console.log(`  ✓ ${pass}/${result.slides.length} slides pass  ·  carousel ${result.carouselQa.verdict}`);
  } catch (err) {
    console.error(`  ✗ ${err.message}`);
  }
}

console.log(`\nAll outputs in ${OUT}/`);
