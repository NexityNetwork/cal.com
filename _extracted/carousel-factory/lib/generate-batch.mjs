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
  "linkedin-pro": `Available layouts (LinkedIn pro — white grid + bold sans + colored hero card):

LAYOUT cover-linkedin-pro — FIRST slide only.
  author: full name (e.g. "Avery Davis", "Maya Chen")
  badgeText: e.g. "LINKEDIN CAROUSEL POST" or "SAVE THIS POST"
  pageNumber: "1"
  accentColor: hex for the page-number circle + sparkle badge. Vibrant colors: "#4f3df5" purple, "#0a66c2" linkedin blue, "#e85d04" warm orange, "#10b981" green.
  headline: 4-8 word punchy hook
  heroSymbol: a single emoji or 1-2 character symbol to put inside the hero card, e.g. "AI", "$", "✦", "→"
  heroBg: hex for hero card gradient start (lighter, suggests the topic)
  heroBg2: hex for hero card gradient end (slightly darker)
  body: 2-3 sentence supporting paragraph at bottom, max 35 words

LAYOUT body-linkedin-pro — body slides.
  author: same as cover
  badgeText: same as cover
  pageNumber: "2", "3", ... (1-digit)
  accentColor: same hex as cover
  title: 3-6 word title, big bold centered
  body: 2-3 sentence supporting paragraph, max 35 words
  heroSymbol: short symbol in hero card
  heroBg / heroBg2: same gradient colors as cover (consistency)
  labelText: a short repeating phrase at the bottom pill (e.g. "Artificial Intelligence", "Future of Work")`,
  "noir-yellow": `Available layouts (dark noir + yellow editorial serif):

LAYOUT cover-noir-yellow — FIRST slide only.
  brand: brand name in serif (e.g. "Salford & Co.", "Atlas Field", "House of Echo")
  scriptPrefix: tiny script word, often a connector like "How", "Why", "On", "The" — handwritten cursive feel
  displayLine1: ALL CAPS first chunk (5-8 chars)
  displayLine2: ALL CAPS second chunk (5-12 chars)
  displayLine3: ALL CAPS third chunk + ending punctuation (5-12 chars)
  scriptTagline: full short tagline in script (5-9 words), e.g. "work smarter, not harder"
  handle: "@<handle>"
  slideId: "Slide 01"

LAYOUT body-noir-yellow — body slides.
  brand: same as cover
  scriptPrefix: small script intro word (e.g. "Focus", "Begin", "Try")
  displayLine1: ALL CAPS chunk
  displayLine2: ALL CAPS chunk
  displayLine3: ALL CAPS chunk
  body: 2-4 sentence editorial paragraph, max 45 words
  handle: same as cover
  slideId: e.g. "Slide 02"`,
};

const FAMILY_LAYOUTS = {
  "ember-dark":  { cover: "cover-display-cta",   body: "body-icon-centered" },
  "beige-paper": { cover: "cover-beige-serif",   body: "body-beige-bubble" },
  "linkedin-pro":{ cover: "cover-linkedin-pro",  body: "body-linkedin-pro" },
  "noir-yellow": { cover: "cover-noir-yellow",   body: "body-noir-yellow" },
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
    {"layoutId":"${FAMILY_LAYOUTS[family].cover}","slots":{...}},
    {"layoutId":"${FAMILY_LAYOUTS[family].body}","slots":{...}},
    ...
  ]
}`;

// ─── Briefs paired with layout families ────────────────────────────────────

const BRIEFS = [
  // ember-dark (already had 3)
  { id: "claude-code-stack",        family: "ember-dark",   text: "The Claude Code stack a one-person founder uses to ship like a 10-person team." },
  { id: "ai-agents-replace-saas",   family: "ember-dark",   text: "5 SaaS categories AI agents are killing in 2026 — and what to build instead." },
  { id: "founder-mistakes",         family: "ember-dark",   text: "8 mistakes I made as a first-time founder that cost me $250K." },
  // beige-paper
  { id: "productivity-tips-beige",  family: "beige-paper",  text: "6 simple productivity tips from a designer who built a 7-figure studio. Calm, editorial tone." },
  { id: "morning-rituals-beige",    family: "beige-paper",  text: "5 morning rituals that changed how I run my business. Quiet, mindful, specific." },
  { id: "writing-tips-beige",       family: "beige-paper",  text: "6 writing tips for founders who hate writing." },
  // linkedin-pro
  { id: "ai-shaping-business-li",   family: "linkedin-pro", text: "How AI is shaping future business — 6 ways every founder should know. LinkedIn audience." },
  { id: "remote-work-li",           family: "linkedin-pro", text: "The 6 habits of the highest-performing remote teams in 2026." },
  { id: "saas-pricing-li",          family: "linkedin-pro", text: "5 SaaS pricing models that print money in 2026. LinkedIn tactical breakdown." },
  // noir-yellow
  { id: "burnout-noir",             family: "noir-yellow",  text: "How to boost productivity without burnout. Editorial, premium, lit-mag tone." },
  { id: "deep-work-noir",           family: "noir-yellow",  text: "The 5 quiet rituals of writers who do their best work. Slow, deliberate voice." },
  { id: "ambition-noir",            family: "noir-yellow",  text: "Why ambition is overrated — 6 reframes from people who burned out and started over." },
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
