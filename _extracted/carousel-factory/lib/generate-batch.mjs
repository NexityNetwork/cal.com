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
  "condensed-pill":   { cover: "cover-condensed-pill",  body: "body-condensed-pill",  cta: "cta-condensed-pill" },
  "photo-split":      { cover: "cover-photo-split",     body: "body-photo-split",     cta: "cta-photo-split" },
  "y2k-window":       { cover: "cover-y2k-window",      body: "body-y2k-window",      cta: "cta-y2k-window" },
  "purple-mist":      { cover: "cover-purple-mist",     body: "body-purple-mist",     cta: "cta-purple-mist" },
  "paper-fold":       { cover: "cover-paper-fold",      body: "body-paper-fold",      cta: "cta-paper-fold" },
  "blue-italic":      { cover: "cover-blue-italic",     body: "body-blue-italic",     cta: "cta-blue-italic" },
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
  "condensed-pill": `Layouts (light cream textured bg + huge black Oswald-condensed pill + DM Serif italic accents):
COVER cover-condensed-pill: brand, preLine (1-3 italic-serif words like "How I", "The 5", "Why I"), pillText (1-2 ALL CAPS chunky words that fit one line in giant black pill, e.g. "MANAGE", "LAUNCH", "QUIT"), postLine (3-6 italic-serif words completing the sentence, e.g. "side hustles & a job"), author (full name).
BODY  body-condensed-pill: brand, number ("01"-"06" inside black circle), numberLabel (italic-serif label like "Tip No.", "Step", "Rule"), title (1-2 ALL CAPS chunky words for pill), body (1-2 italic-serif sentences ≤35 words centered), author.
CTA   cta-condensed-pill: brand, eyebrow (2-3 words uppercase letter-spaced "YOUR TURN"/"START TODAY"), headline (1-2 ALL CAPS chunky words for pill, e.g. "GO", "BUILD IT"), body (1-2 italic-serif sentences ≤25 words), buttonLabel (3-5 words like "Save this post"), author.`,
  "photo-split": `Layouts (top half: photo-placeholder dark gradient panel; bottom half: lime green #dff5b6 panel with dark green ink — editorial magazine):
COVER cover-photo-split: brand, headline (5-9 words sentence case, fits in 2-3 lines), swipeNote (short instruction, 5-9 words like "Swipe to see the 7 lies brands still believe").
BODY  body-photo-split: brand, number ("01"-"06"), eyebrow (2-3 words uppercase letter-spaced like "LIE NUMBER" or "STEP" or "TRUTH"), title (3-6 words sentence case), body (2-3 sentences ≤45 words editorial).
CTA   cta-photo-split: brand, quote (5-9 word punchy quote overlaid on top photo), eyebrow (2-3 words uppercase "YOUR MOVE"/"READY?"), headline (4-7 words sentence case), buttonLabel (2-4 words like "Save this post"), author.`,
  "y2k-window": `Layouts (peach background, browser-window white card with lime tab + purple drop shadow + chunky black borders — Y2K creator):
COVER cover-y2k-window: authorInitials (2 letters), authorName, handle, number (digit like "5"), firstWord (1 word, e.g. "Time"), secondLine (1-2 words in purple, e.g. "Management"), thirdLine (1-2 words in purple, e.g. "Tips"), subtitle (3-6 words on small peach chip, e.g. "For Busy Professionals"), websiteUrl (domain like "reallygreatsite.com").
BODY  body-y2k-window: authorInitials, authorName, handle, number ("1"-"6" plain), title (2-4 words, purple accent, e.g. "Prioritize Important Tasks"), body (1-2 sentences ≤30 words), websiteUrl.
CTA   cta-y2k-window: authorInitials, authorName, handle, eyebrow (uppercase 2-3 words like "YOUR TURN"), headlineMain (1-2 ALL CAPS words black), accentLine (1-2 ALL CAPS words purple), body (1-2 sentences ≤30 words), buttonLabel (2-4 words like "Save this post"), websiteUrl.`,
  "purple-mist": `Layouts (radial purple-to-pink gradient bg, floating white pill cards, italic Cormorant serif, thin white lines — calming wellness):
COVER cover-purple-mist: brand (ALL CAPS letter-spaced), handle, pageOf "1 / 7", searchQuery (5-8 word italic-serif "search bar" phrasing of the topic, e.g. "How to relax when stressed").
BODY  body-purple-mist: brand, handle, pageOf, stepLabel (uppercase "STEP ONE:" / "STEP TWO:" style), body (1-2 italic-serif sentences ≤30 words centered).
CTA   cta-purple-mist: brand, handle, eyebrow (uppercase 2-3 words spaced "YOUR RITUAL"), headline (3-5 italic words like "Begin again, gently"), body (1-2 italic-serif sentences ≤30 words), buttonLabel (2-4 uppercase words like "Save This Ritual").`,
  "paper-fold": `Layouts (cream paper bg with faint horizontal fold + vertical creases, bold sans-serif, orange marker pill highlight, handwritten Caveat accents, hand-drawn orange doodle arrow — editorial entrepreneurship):
COVER cover-paper-fold: eyebrow (1 uppercase category word like "ENTREPRENEURSHIP" or "PRODUCTIVITY"), headline (6-12 words 3-4 lines bold), ctaText (2-3 handwritten words like "Check details"), author (studio/brand name).
BODY  body-paper-fold: eyebrow (uppercase category), pageOf, number ("01"-"06"), numberLabel (handwritten 1-2 words like "Tip" or "Step"), title (3-5 words), body (2-3 sentences ≤50 words; include 2-3 words wrapped in <span class="highlight">…</span> for orange marker highlight), author.
CTA   cta-paper-fold: eyebrow (uppercase 2-3 words like "YOUR TURN"), headline (4-7 bold words), body (1-2 sentences ≤30 words), buttonLabel (2-4 handwritten words like "Get the guide"), author.`,
  "blue-italic": `Layouts (off-white background, slate-blue Fraunces italic display + slate-blue Inter body + lavender strip highlight + half-circle accent + author chip — content strategist / consultant):
COVER cover-blue-italic: handle, websiteUrl ("www.x.com" italic), accentLine (1-3 italic-serif words like "3 Tips" / "5 Steps"), sub1 (3-5 words continuing the sentence, e.g. "For becoming"), sub2 (3-5 words, e.g. "a content creator"), strip (3-6 ALL CAPS spaced words, e.g. "IN TODAY'S WORLD"), authorInitials (2 letters), authorName, authorRole (e.g. "Content Strategist").
BODY  body-blue-italic: handle, websiteUrl, number (italic-serif "1"-"6"), numberLabel (1-2 words like "Step" or "Tip"), title (4-7 words), stripText (2-4 ALL CAPS words), body (2-3 sentences ≤40 words), authorInitials, authorName, authorRole.
CTA   cta-blue-italic: handle, websiteUrl, eyebrow (uppercase 2-3 spaced words "YOUR TURN"), headline (3-5 italic-serif words), body (1-2 sentences ≤30 words), buttonLabel (2-4 words like "Book a call"), authorInitials, authorName, authorRole.`,
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

  // condensed-pill (side hustles / personal finance / creator economy)
  { id: "side-hustle-stack-pill",     family: "condensed-pill", text: "How I manage 3 side hustles & a full-time job — without losing my mind." },
  { id: "launch-a-product-pill",      family: "condensed-pill", text: "How to launch a product in 7 days from zero audience." },
  { id: "quit-the-9-to-5-pill",       family: "condensed-pill", text: "Why I quit my 9-to-5 — and what I'd do differently if I started over." },
  { id: "build-an-audience-pill",     family: "condensed-pill", text: "How to build an audience of 10K real fans in 90 days." },
  { id: "save-50k-pill",              family: "condensed-pill", text: "How I saved $50K on a $70K salary — 6 boring habits." },
  { id: "creator-mistakes-pill",      family: "condensed-pill", text: "6 creator mistakes that cost me 2 years and $40K." },
  { id: "first-1k-month-pill",        family: "condensed-pill", text: "How I made my first $1K/month online — the unsexy version." },

  // photo-split (editorial marketing / brand strategy / agency)
  { id: "7-lies-marketing-split",     family: "photo-split", text: "7 lies you still believe about digital marketing in 2026." },
  { id: "brand-positioning-split",    family: "photo-split", text: "How to position a brand so customers can't ignore you — 6 lessons." },
  { id: "agency-pricing-split",       family: "photo-split", text: "How we 3x'd our agency pricing without losing a single client." },
  { id: "design-system-split",        family: "photo-split", text: "Why every brand needs a design system in 2026 — and how to build one." },
  { id: "rebrand-mistakes-split",     family: "photo-split", text: "6 rebrand mistakes that cost startups their best customers." },
  { id: "content-strategy-split",     family: "photo-split", text: "The content strategy that took a B2B brand from 0 to 1M views/year." },
  { id: "client-onboarding-split",    family: "photo-split", text: "The 6-step client onboarding flow that cut churn by 40%." },

  // y2k-window (productivity / time management / creator tips for busy professionals)
  { id: "time-mgmt-y2k",          family: "y2k-window", text: "5 Time Management Tips for busy professionals who hate calendars." },
  { id: "deep-focus-y2k",         family: "y2k-window", text: "5 Deep Focus rituals to ship more in fewer hours." },
  { id: "notion-stack-y2k",       family: "y2k-window", text: "5 Notion Templates every creator uses to run their business." },
  { id: "morning-stack-y2k",      family: "y2k-window", text: "5 Morning Habits that quietly 10x your week." },
  { id: "creator-tools-y2k",      family: "y2k-window", text: "5 Free Tools every creator uses to ship daily content." },

  // purple-mist (calming / wellness / mindfulness rituals)
  { id: "relax-mist",             family: "purple-mist", text: "How to relax when stressed — 5 mindful steps from a therapist." },
  { id: "sleep-mist",             family: "purple-mist", text: "5 steps to fall asleep faster on anxious nights." },
  { id: "morning-mist",           family: "purple-mist", text: "5 gentle morning rituals to start the day grounded." },
  { id: "self-talk-mist",         family: "purple-mist", text: "How to rewrite negative self-talk — 5 calm practices." },
  { id: "boundaries-mist",        family: "purple-mist", text: "5 soft boundaries that protect your peace without losing people." },

  // paper-fold (founder editorial — checklists, frameworks, entrepreneurial)
  { id: "founder-checklist-paper",  family: "paper-fold", text: "The Founder's Daily Checklist: how I stay focused and sane." },
  { id: "first-hire-paper",         family: "paper-fold", text: "The first 5 hires that change everything in your startup." },
  { id: "raise-money-paper",        family: "paper-fold", text: "How to raise your first round — 6 lessons from a 2nd-time founder." },
  { id: "validate-idea-paper",      family: "paper-fold", text: "How to validate a startup idea in 14 days — 6 concrete tests." },
  { id: "weekly-review-paper",      family: "paper-fold", text: "The weekly review framework every founder needs (and most skip)." },

  // blue-italic (consultant / content strategist / B2B professional)
  { id: "content-creator-blue",     family: "blue-italic", text: "3 Tips for becoming a content creator in today's world." },
  { id: "consultant-pricing-blue",  family: "blue-italic", text: "How to price consulting work — 5 frameworks that get you paid." },
  { id: "personal-brand-blue",      family: "blue-italic", text: "5 mistakes killing your personal brand — and what to do instead." },
  { id: "linkedin-strategy-blue",   family: "blue-italic", text: "The LinkedIn strategy that built me a 6-figure consulting pipeline." },
  { id: "discovery-call-blue",      family: "blue-italic", text: "How to run a discovery call that closes — 6 questions to ask." },
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
// FAMILIES env var (comma-separated) optionally filters BRIEFS down to those families only.
const FAMILY_FILTER = process.env.FAMILIES ? new Set(process.env.FAMILIES.split(",").map((s) => s.trim())) : null;
const RUN_BRIEFS = FAMILY_FILTER ? BRIEFS.filter((b) => FAMILY_FILTER.has(b.family)) : BRIEFS;
console.log(`→ Generating ${RUN_BRIEFS.length} carousels with concurrency=${CONCURRENCY}${FAMILY_FILTER ? ` (families: ${[...FAMILY_FILTER].join(",")})` : ""}`);
const startedAt = Date.now();

const results = await pmap(RUN_BRIEFS, CONCURRENCY, async ({ id, family, text }, idx) => {
  const tag = `[${idx + 1}/${RUN_BRIEFS.length}] ${id} [${family}]`;
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
