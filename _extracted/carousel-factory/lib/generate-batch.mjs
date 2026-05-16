/**
 * Parallel batch generator. Kimi K2.6 plans + Playwright renders +
 * DOM-QA, with up to N concurrent briefs.
 *
 * Usage:
 *   CF_ACCOUNT_ID=... CF_AUTH_EMAIL=... CF_AUTH_KEY=... \
 *   CONCURRENCY=5 node lib/generate-batch.mjs
 */
import { compose } from "./compose.js";
import { renderAndQa } from "./dom-qa.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ACCT = process.env.CF_ACCOUNT_ID;
const CF_EMAIL = process.env.CF_AUTH_EMAIL;
const CF_KEY = process.env.CF_AUTH_KEY;
const CONCURRENCY = Number(process.env.CONCURRENCY || 5);
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

// ─── Layout families & prompts ─────────────────────────────────────────────

const FAMILY_LAYOUTS = {
  "ember-dark":       { cover: "cover-display-cta",     body: "body-icon-centered",   cta: "cta-display-cta" },
  "beige-paper":      { cover: "cover-beige-serif",     body: "body-beige-bubble",    cta: "cta-beige-serif" },
  "linkedin-pro":     { cover: "cover-linkedin-pro",    body: "body-linkedin-pro",    cta: "cta-linkedin-pro" },
  "noir-yellow":      { cover: "cover-noir-yellow",     body: "body-noir-yellow",     cta: "cta-noir-yellow" },
  "dark-green-serif": { cover: "cover-dark-green-serif",body: "body-dark-green-serif",cta: "cta-dark-green-serif" },
  "retro-groovy":     { cover: "cover-retro-groovy",    body: "body-retro-groovy",    cta: "cta-retro-groovy" },
  "minimal-beauty":   { cover: "cover-minimal-beauty",  body: "body-minimal-beauty",  cta: "cta-minimal-beauty" },
  "bold-split":       { cover: "cover-bold-split",      body: "body-bold-split",      cta: "cta-bold-split" },
};

// CTA slot conventions, shared by all families:
//   eyebrow: short uppercase line (e.g. "READY?" / "YOUR TURN" / "TAKE ACTION")
//   headline: short closing headline (3-6 words)
//   body: 1-3 sentences directing the reader (max 35 words)
//   buttonLabel: short CTA verb-phrase (2-4 words, e.g. "Save this post", "Follow @handle", "DM me 'go'")
//   handle: brand handle (e.g. "@brand")

const FAMILY_PROMPTS = {
  "ember-dark": `Layouts (dark ember theme):
COVER cover-display-cta: pageNumber "01", headlineLine1 (≤5 words), headlineLine2 (≤4 words), accentSuffix ("." or "!").
BODY  body-icon-centered: pageNumber ("02" etc), title ("N. Subject, the role", ≤7 words), body (1-3 sentences, ≤35 words, specific, no fluff), iconSlug (notion github stripe supabase cloudflare slack discord gmail googlemeet zoom instagram youtube tiktok x openai anthropic vercel nextdotjs react typescript postgresql redis docker figma linear raycast langchain airtable zapier calendly loom), iconColor (hex, optional).
CTA   cta-display-cta: pageNumber (final), eyebrow ("READY?"/"YOUR MOVE"), headline (3-6 words), subline (1-2 sentences ≤25 words), buttonLabel ("Save this post"/"Follow for more"/"DM 'stack'"), handle.`,
  "beige-paper": `Layouts (cream beige serif):
COVER cover-beige-serif: brand, headline (6-12 words), slideCountHero (single digit "6").
BODY  body-beige-bubble: brand, number ("01"), title (2-4 words), body (2-4 sentences ≤50 words editorial), handle "@x", domain "x.com".
CTA   cta-beige-serif: brand, eyebrow (uppercase 2-3 words), headline (3-6 words), body (1-2 sentences ≤30 words editorial), buttonLabel (2-4 word uppercase verb-phrase), handle "@x".`,
  "linkedin-pro": `Layouts (LinkedIn pro — white grid + bold sans + colored hero):
COVER cover-linkedin-pro: author (name), badgeText ("LINKEDIN CAROUSEL POST"/"SAVE THIS POST"), pageNumber "1", accentColor (vibrant hex: #4f3df5 #0a66c2 #e85d04 #10b981 #ec4899), headline (4-8 words), heroSymbol (1-2 chars), heroBg + heroBg2 (gradient hex pair), body (2-3 sentences ≤35 words).
BODY  body-linkedin-pro: same top-bar fields; pageNumber "2"+; title (3-6 words); body (≤35 words); heroSymbol; heroBg + heroBg2 (consistent with cover); labelText (short repeating bottom phrase).
CTA   cta-linkedin-pro: author, badgeText, pageNumber (final), accentColor (same as rest), eyebrow ("YOUR TURN?"/"ONE QUESTION"), headline (4-7 words), body (1-2 sentences ≤25 words), buttonLabel (primary CTA), secondaryLabel (e.g. "Repost"/"Share"), handle.`,
  "noir-yellow": `Layouts (dark noir + yellow editorial serif):
COVER cover-noir-yellow: brand, scriptPrefix (1 word handwritten), displayLine1/2/3 (3 ALL CAPS chunks), scriptTagline (5-9 word handwritten), handle, slideId "Slide 01".
BODY  body-noir-yellow: brand, scriptPrefix (1 word), displayLine1/2/3, body (2-4 sentences ≤45 words), handle, slideId.
CTA   cta-noir-yellow: brand, scriptPrefix (1 word like "Yours"/"Begin"/"Today"), headline (3-6 words ALL CAPS), scriptTagline (5-8 word handwritten line), buttonLabel (2-4 words), handle, slideId.`,
  "dark-green-serif": `Layouts (dark forest green + cream serif + mono accents):
COVER cover-dark-green-serif: brand (ALL CAPS), pageOf "01 OF 06", headline (3-6 words with optional question mark), subtitle (5-12 words casual), stickerText (2-3 words orange sticker), handle.
BODY  body-dark-green-serif: brand, pageOf, number ("01"), title (3-6 words), body (2-4 sentences ≤50 words mono typewriter feel), handle.
CTA   cta-dark-green-serif: brand, eyebrow (uppercase 2-3 words), headline (3-6 words), body (1-2 sentences ≤25 words mono), buttonLabel (2-4 words on the orange sticker), handle.`,
  "retro-groovy": `Layouts (cream + thin black grid + lime card + lavender pill — Y2K retro):
COVER cover-retro-groovy: title (2-4 words sentence case, fits LARGE in lime card), ctaText (4-7 word subtitle in lavender pill), handle.
BODY  body-retro-groovy: number ("01"), title (2-4 words capitalized), body (2-3 sentences ≤40 words casual), handle.
CTA   cta-retro-groovy: eyebrow (uppercase 2-3 words "FINAL TAKE"/"OVER TO YOU"), headline (3-5 words capitalized, fits in orange card), body (1-2 sentences ≤25 words), buttonLabel (2-4 word verb in lime pill), handle.`,
  "minimal-beauty": `Layouts (warm beige + ultra-thin Italiana display serif ALL CAPS — luxury beauty brand):
COVER cover-minimal-beauty: handle, author (full name), role (e.g. "SKIN SPECIALIST"), titleLine1/Line2/Line3 (3 ALL CAPS chunks of 1-3 words each), subtitle (4-8 words ALL CAPS spaced).
BODY  body-minimal-beauty: handle, author, number ("STEP 01"/"01 / 05"), title (ALL CAPS 2-4 words display), body (2-3 sentences ≤40 words sentence case calm).
CTA   cta-minimal-beauty: handle, author, role, eyebrow ("YOUR RITUAL"/"NEXT STEP"), headline (ALL CAPS 2-4 words), body (1-2 sentences ≤25 words sentence case), buttonLabel ("BOOK A CONSULT"/"SHOP NOW"/"FOLLOW").`,
  "bold-split": `Layouts (split canvas — cream + dark slate, massive condensed Oswald display):
COVER cover-bold-split: title (4-7 word ALL CAPS condensed, wraps 3-4 lines), handle.
BODY  body-bold-split: number ("01"), title (3-5 words ALL CAPS condensed), body (2-3 sentences ≤40 words), handle.
CTA   cta-bold-split: eyebrow (2-3 words uppercase "YOUR MOVE"/"DAY ONE"), headline (3-6 words ALL CAPS condensed), body (1-2 sentences ≤25 words), buttonLabel (2-4 words uppercase), handle.`,
};

const PROMPT_TEMPLATE = (brief, family) => `You are a carousel planner.
${FAMILY_PROMPTS[family]}

BRIEF: ${brief}

Generate an 8-slide carousel: 1 cover + 6 body + 1 cta. Output ONLY valid JSON, no fences.
Schema:
{
  "id":"<short-kebab>",
  "brand":"<name>",
  "brief":"${brief}",
  "theme":"${family}",
  "slides":[
    {"layoutId":"${FAMILY_LAYOUTS[family].cover}","slots":{...}},
    {"layoutId":"${FAMILY_LAYOUTS[family].body}","slots":{...}},
    {"layoutId":"${FAMILY_LAYOUTS[family].body}","slots":{...}},
    {"layoutId":"${FAMILY_LAYOUTS[family].body}","slots":{...}},
    {"layoutId":"${FAMILY_LAYOUTS[family].body}","slots":{...}},
    {"layoutId":"${FAMILY_LAYOUTS[family].body}","slots":{...}},
    {"layoutId":"${FAMILY_LAYOUTS[family].body}","slots":{...}},
    {"layoutId":"${FAMILY_LAYOUTS[family].cta}","slots":{...}}
  ]
}`;

// ─── Briefs (5 families × ~7 briefs each = ~35 carousels) ──────────────────

const BRIEFS = [
  // ember-dark (dev / startup / agents)
  { id: "claude-code-stack",      family: "ember-dark", text: "The Claude Code stack a one-person founder uses to ship like a 10-person team." },
  { id: "ai-replaces-saas",       family: "ember-dark", text: "5 SaaS categories AI agents are killing in 2026 — and what to build instead." },
  { id: "founder-mistakes",       family: "ember-dark", text: "8 mistakes I made as a first-time founder that cost me $250K." },
  { id: "internal-tools",         family: "ember-dark", text: "6 internal tools every AI startup ships in week 1 — concrete examples." },
  { id: "agent-orchestration",    family: "ember-dark", text: "How we orchestrate 12 agents in production. Tools, patterns, gotchas." },
  { id: "infra-stack-2026",       family: "ember-dark", text: "The new infra stack for AI startups in 2026 — bye Heroku, hello Cloudflare." },
  { id: "shipping-fast-stack",    family: "ember-dark", text: "7 tools that turn one engineer into a team. Names, urls, why each matters." },

  // beige-paper (editorial / mindful / writer-founder)
  { id: "productivity-tips",      family: "beige-paper", text: "6 productivity tips from a designer who built a 7-figure studio." },
  { id: "morning-rituals",        family: "beige-paper", text: "5 morning rituals that changed how I run my business." },
  { id: "writing-tips",           family: "beige-paper", text: "6 writing tips for founders who hate writing." },
  { id: "deep-work",              family: "beige-paper", text: "How to protect 4 hours of deep work in a calendar full of meetings." },
  { id: "saying-no",              family: "beige-paper", text: "5 lessons on saying no — from a founder who used to say yes to everything." },
  { id: "reading-list",           family: "beige-paper", text: "6 books that quietly changed how I run a company. Why each one mattered." },
  { id: "calm-company",           family: "beige-paper", text: "What it means to run a calm company in a hustle-culture world." },

  // linkedin-pro (B2B SaaS / leadership)
  { id: "ai-shaping-business",    family: "linkedin-pro", text: "How AI is shaping future business — 6 ways every founder should know." },
  { id: "remote-work",            family: "linkedin-pro", text: "The 6 habits of the highest-performing remote teams in 2026." },
  { id: "saas-pricing",           family: "linkedin-pro", text: "5 SaaS pricing models that print money in 2026. Tactical breakdown." },
  { id: "hiring-engineers",       family: "linkedin-pro", text: "What we look for when hiring engineers in 2026 (it's not coding tests)." },
  { id: "first-100-customers",    family: "linkedin-pro", text: "How we got our first 100 customers — no ads, no SEO, just 6 channels." },
  { id: "linkedin-content-loop",  family: "linkedin-pro", text: "The LinkedIn content loop that built a 50K following in 6 months." },
  { id: "selling-to-cios",        family: "linkedin-pro", text: "5 things that actually close enterprise deals — from a 7-figure sales leader." },

  // noir-yellow (editorial / literary / meditative)
  { id: "burnout",                family: "noir-yellow", text: "How to boost productivity without burnout. Editorial, lit-mag tone." },
  { id: "deep-work-noir",         family: "noir-yellow", text: "The 5 quiet rituals of writers who do their best work." },
  { id: "ambition",               family: "noir-yellow", text: "Why ambition is overrated — 6 reframes from people who burned out and started over." },
  { id: "craft-vs-hustle",        family: "noir-yellow", text: "Craft over hustle: 6 things makers know that hustlers don't." },
  { id: "quiet-confidence",       family: "noir-yellow", text: "The 5 marks of quiet confidence — from people who don't post." },
  { id: "slow-business",          family: "noir-yellow", text: "How to build a slow business that pays well and never burns out." },
  { id: "writer-rituals",         family: "noir-yellow", text: "The morning routines of 6 writers who shipped a book in 12 months." },

  // dark-green-serif (lifestyle / wellness / niche brand)
  { id: "matcha-why",             family: "dark-green-serif", text: "Why matcha — the green tea that's more than a trend. Lifestyle brand carousel." },
  { id: "wellness-stack",         family: "dark-green-serif", text: "My wellness stack — 5 things that actually moved the needle." },
  { id: "skincare-truth",         family: "dark-green-serif", text: "5 things the skincare industry doesn't want you to know." },
  { id: "supplements",            family: "dark-green-serif", text: "6 supplements I actually still take after 3 years of testing." },
  { id: "sleep-rituals",          family: "dark-green-serif", text: "The 5-step sleep ritual that fixed my insomnia." },
  { id: "kitchen-tools",          family: "dark-green-serif", text: "6 kitchen tools that replaced 30 — minimalist home cook edition." },
  { id: "morning-walk",           family: "dark-green-serif", text: "Why a 20-minute morning walk beat my $400 wearable." },

  // retro-groovy (Y2K marketing / fun brand)
  { id: "marketing-plan-groovy",  family: "retro-groovy", text: "A 6-step digital marketing plan that transforms clicks into customers." },
  { id: "brand-launch-groovy",    family: "retro-groovy", text: "How to launch a brand in 7 days — the no-BS playbook." },
  { id: "tiktok-growth-groovy",   family: "retro-groovy", text: "5 unhinged TikTok hooks that 10x'd our growth." },
  { id: "no-code-stack-groovy",   family: "retro-groovy", text: "The 6-tool no-code stack that runs my $30K/mo business." },
  { id: "side-hustle-groovy",     family: "retro-groovy", text: "The 5 side hustles printing money in 2026 — fun edition." },
  { id: "email-funnel-groovy",    family: "retro-groovy", text: "How to build an email funnel that converts at 9%." },
  { id: "viral-content-groovy",   family: "retro-groovy", text: "6 viral content formats every creator should steal." },

  // minimal-beauty (skincare / wellness / luxury)
  { id: "glow-skin-beauty",       family: "minimal-beauty", text: "How to have a perfect glow skin — 5 steps from a dermatologist." },
  { id: "anti-aging-beauty",      family: "minimal-beauty", text: "The 6 anti-aging habits actually backed by science." },
  { id: "sunscreen-beauty",       family: "minimal-beauty", text: "Why sunscreen is the only product that matters — and how to pick one." },
  { id: "minimal-routine-beauty", family: "minimal-beauty", text: "The 5-product skincare routine that replaced my 14-step regimen." },
  { id: "skincare-myths-beauty",  family: "minimal-beauty", text: "5 skincare myths a board-certified specialist wants you to stop believing." },
  { id: "luxury-self-care-beauty",family: "minimal-beauty", text: "6 luxurious self-care rituals that cost less than a coffee." },
  { id: "scalp-care-beauty",      family: "minimal-beauty", text: "The 5 scalp habits dermatologists wish you'd adopt this year." },

  // bold-split (confidence / self-development / loud)
  { id: "confidence-bold",        family: "bold-split", text: "How to boost your confidence every day — 6 hard truths." },
  { id: "kill-self-doubt-bold",   family: "bold-split", text: "5 ways to kill self-doubt before it kills you." },
  { id: "be-disliked-bold",       family: "bold-split", text: "Why you should aim to be disliked by 50% of your audience." },
  { id: "mindset-shifts-bold",    family: "bold-split", text: "6 mindset shifts that changed everything for me at 30." },
  { id: "boundaries-bold",        family: "bold-split", text: "How to set boundaries without losing the people you love." },
  { id: "quit-people-pleasing-bold", family: "bold-split", text: "5 signs you're a people pleaser and how to stop today." },
  { id: "discipline-over-motivation-bold", family: "bold-split", text: "Why discipline always beats motivation — 6 examples." },
];

// ─── Kimi planner with retry on JSON parse failure ─────────────────────────

async function plan(brief, family) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch(KIMI_URL, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        messages: [{ role: "user", content: PROMPT_TEMPLATE(brief, family) }],
        max_tokens: 8000,
        temperature: 0.7,
      }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(`Kimi err: ${JSON.stringify(data.errors).slice(0, 300)}`);
    let content = data.result?.choices?.[0]?.message?.content ?? data.result?.response ?? "";
    if (!content) {
      if (attempt === 2) throw new Error(`Empty Kimi response after retry (finish=${data.result?.choices?.[0]?.finish_reason})`);
      continue;
    }
    content = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
    try { return JSON.parse(content); } catch (e) {
      if (attempt === 2) throw new Error(`JSON parse failed: ${e.message}`);
    }
  }
}

// ─── Concurrency limiter ────────────────────────────────────────────────────

async function pmap(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ─── Run ───────────────────────────────────────────────────────────────────

await mkdir(OUT, { recursive: true });
console.log(`→ Generating ${BRIEFS.length} carousels with concurrency=${CONCURRENCY}`);
const startedAt = Date.now();

const results = await pmap(BRIEFS, CONCURRENCY, async ({ id, family, text }, idx) => {
  const tag = `[${idx + 1}/${BRIEFS.length}] ${id} [${family}]`;
  try {
    const spec = await plan(text, family);
    spec.id = id;
    await writeFile(resolve(OUT, `${id}.spec.json`), JSON.stringify(spec, null, 2));
    const htmls = await compose(spec, { layoutsDir: LAYOUTS });
    const dir = resolve(OUT, id);
    const r = await renderAndQa(htmls, dir, { concurrency: 2 });
    const pass = r.slides.filter((s) => s.qa.verdict === "pass").length;
    console.log(`✓ ${tag} — ${pass}/${r.slides.length} pass · ${r.carouselQa.verdict}`);
    return { id, status: "ok", pass, total: r.slides.length };
  } catch (e) {
    console.log(`✗ ${tag} — ${e.message}`);
    return { id, status: "err", error: e.message };
  }
});

const dur = ((Date.now() - startedAt) / 1000).toFixed(1);
const ok = results.filter((r) => r.status === "ok").length;
console.log(`\nDone in ${dur}s — ${ok}/${results.length} succeeded.`);
