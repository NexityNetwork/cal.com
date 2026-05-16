/**
 * Generate N carousels using Kimi K2.6 on Workers AI + the existing
 * compose → render → dom-qa pipeline. No more planning. Just output.
 *
 * Usage: node lib/generate-batch.mjs
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

// ─── Briefs ────────────────────────────────────────────────────────────────
const BRIEFS = [
  { id: "ai-marketing-team", text: "I built an AI marketing team that replaced a $300K hire. 7 agents, one orchestrator. Breakdown of each agent and what they do." },
  { id: "claude-code-stack", text: "The Claude Code stack a one-person founder uses to ship like a 10-person team. Each tool, what it does, why it matters." },
  { id: "ai-agents-replace-saas", text: "5 SaaS categories AI agents are killing in 2026 — and what to build instead. Concrete examples per category." },
  { id: "growth-loop-2026", text: "The 6-step content growth loop that took us from 0 to 100K followers in 90 days. Each step explained with the actual tools." },
  { id: "founder-mistakes", text: "8 mistakes I made as a first-time founder that cost me $250K. What I'd do differently — concrete, no generic advice." },
];

// ─── Kimi planner ──────────────────────────────────────────────────────────
const PROMPT_TEMPLATE = (brief) => `You are a carousel planner.

Available layouts:

LAYOUT cover-display-cta — use for the FIRST slide only.
  Slots:
    pageNumber: "01"
    headlineLine1: first half of the headline, max 5 words
    headlineLine2: second half, max 4 words
    accentSuffix: typically "." or "!" — appears in orange after line 2

LAYOUT body-icon-centered — use for ALL OTHER slides.
  Slots:
    pageNumber: "02", "03", ... (2-digit)
    title: "N. Subject, the role" format works great. Max 7 words.
    body: 1-3 sentences, max 35 words total. Use specific concrete language. No filler like "elevate" "leverage" "transform" "unleash".
    iconSlug: a simple-icons slug. Valid: notion, github, stripe, supabase, cloudflare, slack, discord, gmail, googlemeet, zoom, linkedin, instagram, youtube, tiktok, x, openai, anthropic, replicate, vercel, nextdotjs, react, typescript, postgresql, redis, kubernetes, docker, figma, framer, linear, raycast, arc, perplexity, langchain, mongodb, supabase, airtable, zapier, calendly, loom, miro
    iconColor: hex string, optional. Defaults to white. Use brand color when known (e.g. "#635BFF" for Stripe).

BRIEF: ${brief}

Generate a carousel of 7 slides (1 cover + 6 body) covering the brief.

CRITICAL: Output ONLY valid JSON, no markdown fences, no commentary, no thinking out loud.

Schema:
{
  "id": "<short-kebab>",
  "brand": "Ultron",
  "brief": "<the brief>",
  "theme": "ember-dark",
  "slides": [
    {"layoutId":"cover-display-cta","slots":{...}},
    {"layoutId":"body-icon-centered","slots":{...}},
    ...
  ]
}`;

async function plan(brief) {
  const res = await fetch(KIMI_URL, {
    method: "POST",
    headers: AUTH,
    body: JSON.stringify({
      messages: [{ role: "user", content: PROMPT_TEMPLATE(brief) }],
      max_tokens: 8000, // reasoning model — needs room for thinking + output
      temperature: 0.6,
    }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(`Kimi err: ${JSON.stringify(data.errors).slice(0, 300)}`);
  // Kimi K2.6 returns OpenAI-style choices[].message.content
  let content =
    data.result?.choices?.[0]?.message?.content ??
    data.result?.response ??
    "";
  if (!content) {
    const finish = data.result?.choices?.[0]?.finish_reason;
    throw new Error(`Empty Kimi response (finish=${finish})`);
  }
  // Strip markdown fences if Kimi included them despite instructions
  content = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(content);
}

// ─── Run ───────────────────────────────────────────────────────────────────
await mkdir(OUT, { recursive: true });

for (const { id, text } of BRIEFS) {
  console.log(`\n→ ${id}`);
  try {
    console.log("  planning...");
    const spec = await plan(text);
    spec.id = id;
    await writeFile(resolve(OUT, `${id}.spec.json`), JSON.stringify(spec, null, 2));

    console.log("  composing...");
    const htmls = await compose(spec, { layoutsDir: LAYOUTS });

    console.log("  rendering...");
    const dir = resolve(OUT, id);
    const result = await renderAndQa(htmls, dir, { concurrency: 3 });

    const pass = result.slides.filter((s) => s.qa.verdict === "pass").length;
    console.log(`  ✓ ${pass}/${result.slides.length} slides pass DOM-QA  ·  carousel ${result.carouselQa.verdict}`);
  } catch (err) {
    console.error(`  ✗ ${err.message}`);
  }
}

console.log(`\nAll outputs in ${OUT}/`);
