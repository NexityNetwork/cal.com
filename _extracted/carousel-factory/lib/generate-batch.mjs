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
  "neon-dark":        { cover: "cover-neon-dark",       body: "body-neon-dark",       cta: "cta-neon-dark" },
  "terracotta":       { cover: "cover-terracotta",      body: "body-terracotta",      cta: "cta-terracotta" },
  "coral-mag":        { cover: "cover-coral-mag",       body: "body-coral-mag",       cta: "cta-coral-mag" },
  "pastel-soft":      { cover: "cover-pastel-soft",     body: "body-pastel-soft",     cta: "cta-pastel-soft" },
  "dark-navy":        { cover: "cover-dark-navy",       body: "body-dark-navy",       cta: "cta-dark-navy" },
  "cream-gold":       { cover: "cover-cream-gold",      body: "body-cream-gold",      cta: "cta-cream-gold" },
  "claude-target":    { cover: "cover-claude-target",   body: "body-claude-target",   cta: "cta-claude-target" },
  "black-mindmap":    { cover: "cover-black-mindmap",   body: "body-black-mindmap",   cta: "cta-black-mindmap" },
  "grid-italic":      { cover: "cover-grid-italic",     body: "body-grid-italic",     cta: "cta-grid-italic" },
  "second-brain":     { cover: "cover-second-brain",    body: "body-second-brain",    cta: "cta-second-brain" },
  "mono-pattern":     { cover: "cover-mono-pattern",    body: "body-mono-pattern",    cta: "cta-mono-pattern" },
  "rounded-card":     { cover: "cover-rounded-card",    body: "body-rounded-card",    cta: "cta-rounded-card" },
  "dark-blob":        { cover: "cover-dark-blob",       body: "body-dark-blob",       cta: "cta-dark-blob" },
  "mint-condensed":   { cover: "cover-mint-condensed",  body: "body-mint-condensed",  cta: "cta-mint-condensed" },
  "cream-best":       { cover: "cover-cream-best",      body: "body-cream-best",      cta: "cta-cream-best" },
  "black-warning":    { cover: "cover-black-warning",   body: "body-black-warning",   cta: "cta-black-warning" },
  "cream-3d":         { cover: "cover-cream-3d",        body: "body-cream-3d",        cta: "cta-cream-3d" },
  "typo-sample":      { cover: "cover-typo-sample",     body: "body-typo-sample",     cta: "cta-typo-sample" },
  "data-table":       { cover: "cover-data-table",      body: "body-data-table",      cta: "cta-data-table" },
  "tool-list":        { cover: "cover-tool-list",       body: "body-tool-list",       cta: "cta-tool-list" },
  "flowchart":        { cover: "cover-flowchart",       body: "body-flowchart",       cta: "cta-flowchart" },
  "design-tile":      { cover: "cover-design-tile",     body: "body-design-tile",     cta: "cta-design-tile" },
  "agent-lineup":     { cover: "cover-agent-lineup",    body: "body-agent-lineup",    cta: "cta-agent-lineup" },
  "stack-tour":       { cover: "cover-stack-tour",      body: "body-stack-tour",      cta: "cta-stack-tour" },
  "before-after":     { cover: "cover-before-after",    body: "body-before-after",    cta: "cta-before-after" },
  "dark-pill-glow":   { cover: "cover-dark-pill-glow",  body: "body-dark-pill-glow",  cta: "cta-dark-pill-glow" },
  "shout-orange":     { cover: "cover-shout-orange",    body: "body-shout-orange",    cta: "cta-shout-orange" },
  "leak-dark":        { cover: "cover-leak-dark",       body: "body-leak-dark",       cta: "cta-leak-dark" },
  "cream-claude":     { cover: "cover-cream-claude",    body: "body-cream-claude",    cta: "cta-cream-claude" },
  "tech-stack-grid":  { cover: "cover-tech-stack-grid", body: "body-tech-stack-grid", cta: "cta-tech-stack-grid" },
  "lime-accent":      { cover: "cover-lime-accent",     body: "body-lime-accent",     cta: "cta-lime-accent" },
  "pixel-block":      { cover: "cover-pixel-block",     body: "body-pixel-block",     cta: "cta-pixel-block" },
  "cream-table":      { cover: "cover-cream-table",     body: "body-cream-table",     cta: "cta-cream-table" },
  "photo-tag":        { cover: "cover-photo-tag",       body: "body-photo-tag",       cta: "cta-photo-tag" },
  "highlight-box":    { cover: "cover-highlight-box",   body: "body-highlight-box",   cta: "cta-highlight-box" },
  "stencil-stamp":    { cover: "cover-stencil-stamp",   body: "body-stencil-stamp",   cta: "cta-stencil-stamp" },
  "edu-bright":       { cover: "cover-edu-bright",      body: ["body-edu-bright-chart", "body-edu-bright-flow", "body-edu-bright-table"], cta: "cta-edu-bright" },
  "terminal-glow":    { cover: "cover-terminal-glow",   body: "body-terminal-glow",   cta: "cta-terminal-glow" },
  "personal-essay":   { cover: "cover-personal-essay",  body: "body-personal-essay",  cta: "cta-personal-essay" },
  "mag-editorial":    { cover: "cover-mag-editorial",   body: "body-mag-editorial",   cta: "cta-mag-editorial" },
  "swiss-grid":       { cover: "cover-swiss-grid",      body: "body-swiss-grid",      cta: "cta-swiss-grid" },
  "neon-cyber":       { cover: "cover-neon-cyber",      body: "body-neon-cyber",      cta: "cta-neon-cyber" },
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

  "neon-dark": `Layouts (near-black bg + pink grid glow + neon pink + teal accents, Space Grotesk + Space Mono — cyberpunk AI creator):
COVER cover-neon-dark: handle ("@handle"), badgeLabel (2-3 words uppercase, e.g. "SAVED POST" / "AI TOOLS"), tag (1 word uppercase mono label, e.g. "THREAD" / "BREAKDOWN"), neonWord (1 ALL CAPS word in neon pink, e.g. "STOP"), headlineLine2 (1-3 words in white, e.g. "wasting"), tealLine (1-2 words in neon teal, e.g. "time"), subline (1-2 sentences ≤25 words, punchy), ctaLabel (2-4 words like "Read the thread"), totalSlides ("7").
BODY  body-neon-dark: handle, pageOf ("02 / 07" etc), number (ghost numeral "1"-"6"), titleLabel (1-3 words mono teal, e.g. "THE TOOL" / "MISTAKE"), titleMain (2-4 words white), titleAccent (1-2 words in neon pink, e.g. "kills flow"), body (2-3 sentences ≤35 words, direct), slideNum ("02"-"07"), totalSlides ("7").
CTA   cta-neon-dark: handle, pageOf ("08 / 07"), eyebrow (2-3 words uppercase mono teal, e.g. "YOUR MOVE"), headlineNeon (1-2 ALL CAPS words pink, e.g. "SAVE"), headlineWhite (1-2 words white, e.g. "this post"), body (1-2 sentences ≤25 words), buttonLabel (2-4 words, e.g. "Save this post"), secondaryLabel (mono text like "// follow @handle").`,

  "terracotta": `Layouts (warm cream bg, terracotta/rust arch + Playfair serif italic, earthy dividers — grounded lifestyle & entrepreneurship):
COVER cover-terracotta: eyebrow (1-2 uppercase words, e.g. "LIFESTYLE" / "FOUNDER"), titleLine1 (1-2 words serif bold, e.g. "Slow"), titleLine2 (1-2 words italic terracotta, e.g. "Down,"), titleLine3 (1-2 words, e.g. "Build"), subtitle (10-18 word italic serif sentence describing the topic), ctaLabel (2-3 words, e.g. "Read below"), handle ("@handle"), author (brand/studio name), slideCount (digit "5" or "6").
BODY  body-terracotta: author, pageOf ("1/6" etc), number ("01"-"06"), numberLabel (1-2 words italic, e.g. "Insight" / "Truth"), titleMain (2-4 words, e.g. "Protect Your"), titleItalic (1-3 italic words in terracotta, e.g. "Deep Work"), body (2-3 sentences ≤45 words, warm editorial), handle.
CTA   cta-terracotta: author, pageOf, eyebrow (2-3 uppercase words, e.g. "YOUR TURN"), headlineMain (2-3 serif words, e.g. "Begin"), headlineItalic (1-3 italic words in cream, e.g. "right now"), body (1-2 sentences ≤30 words warm), buttonLabel (2-4 words, e.g. "Save this post"), handle.`,

  "coral-mag": `Layouts (coral #ff5a36 + white + black, Bebas Neue condensed magazine — bold editorial agency/marketing):
COVER cover-coral-mag: brand (studio/brand name), issueLabel (e.g. "ISSUE 01" / "CAROUSEL POST"), issueTag (2-3 uppercase words, e.g. "DEEP DIVE"), headWord1 (1 ALL CAPS word big, e.g. "THE"), headWord2 (1 ALL CAPS word outline, e.g. "TRUTH"), headWord3 (1 ALL CAPS word, e.g. "ABOUT"), subEyebrow (2-3 uppercase words, e.g. "MARKETING" / "TODAY'S TOPIC"), subtitle (6-10 words sentence-case summary of the carousel), handle.
BODY  body-coral-mag: brand, pageLabel (e.g. "P.02" / "LIE 01"), number ("01"-"06"), eyebrow (2-3 words uppercase, e.g. "THE LIE" / "TRUTH"), titleWord1 (1-2 words Bebas), titleWord2 (1 word in coral accent), titleWord3 (0-2 words), body (2-3 sentences ≤40 words editorial), handle.
CTA   cta-coral-mag: brand, pageOf, tag (2-3 words uppercase black on coral, e.g. "YOUR MOVE"), headWord1 (1 ALL CAPS word, e.g. "SAVE"), headWord2 (1 ALL CAPS word outline on coral, e.g. "THIS"), body (1-2 sentences ≤25 words), buttonLabel (2-4 words, e.g. "Follow for more"), handle.`,

  "pastel-soft": `Layouts (soft lavender-white bg + white rounded cards, purple-blue gradient badges, DM Sans — personal growth / wellness):
COVER cover-pastel-soft: authorInitials (2 letters), authorName, handle, tagBlue (1-3 words like "Self Growth"), tagPink (1-3 words like "Mindset"), titleLine1 (1-3 words, e.g. "How to"), titleLine2 (1-3 italic words in blue, e.g. "actually"), titleLine3 (1-3 words, e.g. "heal"), subtitle (1-2 sentences ≤25 words, warm), ctaLabel (2-4 words like "Read below"), slideCount ("6" or "7").
BODY  body-pastel-soft: authorName, pageOf ("2 / 7" etc), number (digit "1"-"6"), numberLabel (1-2 words like "Insight" or "Step"), titleMain (2-3 words), titleItalic (1-2 italic words in blue, e.g. "deeply"), body (2-3 sentences ≤40 words, warm compassionate), handle.
CTA   cta-pastel-soft: authorName, pageOf, eyebrow (2-3 uppercase words "YOUR TURN"), headlineMain (2-3 words), headlineItalic (1-2 italic words in blue), body (1-2 sentences ≤25 words warm), buttonLabel (2-4 words like "Save this"), secondaryLabel (e.g. "Share with a friend"), handle.`,

  "dark-navy": `Layouts (deep navy #0d1b2a + orange #f97316 accents + IBM Plex Mono terminal aesthetic — B2B SaaS / technical founders):
COVER cover-dark-navy: brand (product/company name), versionLabel (e.g. "v2.0" / "2026 Edition"), prompt (5-10 word terminal command style, e.g. "run startup.sh --mode=founder"), headLine1 (1-2 words white, e.g. "The"), headLine2 (1-2 words orange, e.g. "Stack"), headLine3 (1-2 words dim-white, e.g. "That Scales"), subline (1-2 sentences ≤25 words, technical tone), stat1Num/Num2/Num3 (metric like "6x" / "4hrs" / "99%"), stat1Label/Label2/Label3 (3-5 word labels), ctaLabel (2-4 words like "Read the thread"), totalSlides ("7").
BODY  body-dark-navy: brand, pageOf ("02/07" etc), stepLabel (5-10 words mono comment style, e.g. "the deployment step"), number ("1"-"6"), titleMain (2-3 words white, e.g. "Ship"), titleOrange (1-2 words orange, e.g. "faster"), body (2-3 sentences ≤35 words, technical direct), codePill (a short inline code snippet or command, e.g. "npm run deploy" or "git push origin main"), handle.
CTA   cta-dark-navy: brand, pageOf, terminalTag (5-8 word terminal style, e.g. "deploy --to=your-feed"), headLine1 (1-2 words white), headLine2 (1-2 words orange), body (1-2 sentences ≤25 words), buttonLabel (2-4 words), secondaryNote (mono note like "follow for more threads"), handle.`,

  "cream-gold": `Layouts (warm cream/ivory bg + charcoal text + gold #b8960c accents + Cormorant Garamond italic serif — luxury consulting / finance / high-end personal brand):
COVER cover-cream-gold: brand (name in uppercase), issueLabel (e.g. "No. 01" / "A Reflection"), eyebrow (2-4 uppercase spaced words, e.g. "ON MONEY & POWER"), titleLine1 (1-2 words Cormorant bold, e.g. "The"), titleLine2 (1-2 italic words in gold, e.g. "Quiet"), titleLine3 (1-2 words, e.g. "Rules"), subtitle (10-16 word italic sentence), handle, slideCount ("6").
BODY  body-cream-gold: brand, pageOf ("ii / vii" roman or "2 / 7"), number (roman or numeral "I"-"VI"), numberLabel (1-2 words like "Rule" or "Lesson"), titleMain (2-4 serif words), titleItalic (1-3 italic gold words), body (2-3 sentences ≤45 words, measured literary), handle.
CTA   cta-cream-gold: brand, pageOf, eyebrow (2-3 uppercase words, e.g. "A FINAL WORD"), headlineMain (2-3 serif words), headlineItalic (1-2 italic gold words), body (1-2 sentences ≤30 words, measured), buttonLabel (2-4 words uppercase like "SAVE THIS POST"), handle.`,

  "claude-target": `Layouts (dark #1a1612 dot-grid + outlined rounded cards + orange #ff5a28 + chunky pixelated brick wordmark center + radial clock target — Claude-Code agent/sales founder ref: 300k_Sales_team):
COVER cover-claude-target: topLine1 (1-3 words white, e.g. "I replaced a"), topLine2 (2-4 words orange accent, e.g. "$300K Sales Team"), topLine3 (1-3 words white, e.g. "with Claude Code"), brickLine1 (1 ALL CAPS chunky word like "CLAUDE"), brickLine2 (1 ALL CAPS chunky word like "CODE"), subLine (3-5 white words, e.g. "Here's the"), subAccent (1-2 orange words, e.g. "exact system,"), subTail (2-3 white words, e.g. "step by step"), note (3-6 words italic, e.g. "free breakdown included").
BODY  body-claude-target: titleMain (2-4 words, e.g. "Claude builds your"), titleAccent (1-2 orange words like "prospect list"), titleTail (1-3 words, e.g. "for you"), step1Title/step2Title/step3Title (3-7 word sub-step titles), step1Sub/step2Sub/step3Sub (1-sentence tactical descriptions ≤15 words), tool1/tool2/tool3/tool4 (single uppercase tool names like "OPENROUTER" "APOLLO" "HUNTER" "DB"), progressPct (number 14-86 increasing per slide).
CTA   cta-claude-target: eyebrow (2-3 uppercase words like "READY TO SHIP"), headlineMain (3-5 words), headlineAccent (1-2 orange words), body (1-2 sentences ≤30 words), targetLine1 (1 ALL CAPS short word like "FREE"), targetLine2 (1 ALL CAPS word like "GUIDE"), buttonLine (3-5 words like "Comment 'SHIP' for the guide"), handle ("@handle").`,

  "black-mindmap": `Layouts (pure #000 bg + huge white Inter sans + magenta dashed arrow + colored neon mind-map pills, ref: 4_pillars_agents):
COVER cover-black-mindmap: handle ("@handle"), pageLabel ("01 / 08"), eyebrow (2-3 uppercase words like "SAVE THIS"), headlineLine1 (1-4 words, e.g. "The 4 Pillars of"), headlineLine2 (1-3 words, e.g. "AI Agents"), swipeNote (3-6 words like "swipe to see all 4").
BODY  body-black-mindmap: handle, pageLabel, number ("1"-"6"), title (1-2 words, e.g. "Prompt"), pill1 (2-3 words green pill, e.g. "Vague prompts"), pill2 (2-3 words orange pill, e.g. "No constraints"), pill3 (2-3 words purple pill, e.g. "Passive language"), pill4 (1-2 small purple words like "Over-explaining"), pill5 (1-2 small purple words like "No focus").
CTA   cta-black-mindmap: handle, pageLabel, eyebrow (2-3 magenta uppercase words like "YOUR MOVE"), headlineLine1 (2-4 words), headlineLine2 (2-4 words), body (1-2 sentences ≤30 words), buttonLabel (3-5 words like "Save this post"), closing (3-5 word footer note).`,

  "grid-italic": `Layouts (off-white #f5f5f2 with faint pencil grid + Cormorant Garamond italic display + Claude orange #ff5a28 starburst icon, ref: bad_good_great + claude_folder_structure):
COVER cover-grid-italic: topic (2-4 words like "Claude Prompts" / "AI Agents"), preLine (3-6 words italic, e.g. "What separates"), word1 (1 ALL CAPS italic word like "BAD"), word2 (1 italic word like "Good"), word3 (1 italic word in orange like "Great"), authorInitials (2 letters), authorName, authorRole (e.g. "AI Engineer"), handle ("@handle").
BODY  body-grid-italic: number (digit "1"-"6"), preLabel (2-4 italic words like "Tip No."), titleMain (2-4 serif words), titleAccent (1-2 orange italic words), titleUnderline (1-2 underlined italic words), body (2-3 italic-serif sentences ≤40 words), note (1-2 sans sentences ≤25 words pragmatic), authorInitials, authorName, pageOf ("2 / 8" italic).
CTA   cta-grid-italic: eyebrow (3-6 italic words like "Now the only question is"), headlineMain (2-4 serif words), headlineAccent (1-3 italic orange words), body (1-2 italic sentences ≤30 words), buttonLabel (2-4 words like "Save this post"), authorInitials, authorName, handle.`,

  "second-brain": `Layouts (cream #f3ede0 + connected-node network bg + 3D terracotta folder + JetBrains Mono italic ".sys" header + tan cards with folder icons + bottom box-indicators, ref: second_brain):
COVER cover-second-brain: filename (UPPERCASE mono italic like "SECOND_BRAIN.sys" or "CLAUDE_STACK.sys"), bigNumber (digit "3" or "5" — number of folders), bigLabel (1-2 word label like "Folders"), folderDesc (3-6 italic words like "raw + wiki + outputs"), headlineMain (2-3 words, e.g. "I Built My"), headlineAccent (1-3 orange underlined words like "Second Brain"), headlineLine2 (3-5 words, e.g. "With 3 Folders"), subLine1 (1 short sentence ≤8 words like "It's not an app. It's not a plugin."), subLine2 (2-4 words, e.g. "It's just"), subAccent (1-2 orange bold words like "3 folders"), subTail (2-4 words, e.g. "on your computer.").
BODY  body-second-brain: eyebrow (uppercase mono label like "STEP" or "SYSTEM"), number ("01"-"06"), title (2-4 words like "Three Folders"), terminalPath (e.g. "~/my-second-brain"), term1Cmd/term2Cmd/term3Cmd (each "mkdir" or similar), term1Arg/term2Arg/term3Arg (folder names like "raw/" "wiki/" "outputs/"), quote (5-9 italic words like "That's the entire architecture."), card1Key/card2Key/card3Key (1-word keys like "raw/" "wiki/" "outputs/"), card1Desc/card2Desc/card3Desc (1-sentence descriptions ≤12 words), nextNote (3-7 words next-slide tease).
CTA   cta-second-brain: filename, eyebrow (uppercase mono 2-3 words like "YOUR TURN"), headlineMain (2-3 words), headlineAccent (1-3 orange underlined words), body (1-2 sentences ≤30 words), buttonLabel (3-5 words like "Save this post"), handle.`,

  "mono-pattern": `Layouts (off-white #f5f0e8 + IBM Plex Mono huge uppercase display + orange #c4541f accent + black pattern-pill + dark callout cards + page numbers, ref: multi_agent_patterns):
COVER cover-mono-pattern: pageOf ("01 / 10"), handle (e.g. "techwith.ram"), patternLabel (e.g. "PATTERN 01" / "INTRO"), word1 (1 ALL CAPS mono word like "THE"), word2 (1-2 ALL CAPS orange mono word like "SHARED"), word3 (1-2 ALL CAPS mono words like "MEMORY"), body (1-3 mono sentences ≤45 words technical), ctaText (3-5 mono words like "Swipe to Read More"), rightNote (2-4 mono words like "8 patterns inside"), footerLeft (short mono note like "carousel · 01"), footerRight (mono URL or @handle).
BODY  body-mono-pattern: pageOf ("02 / 10"), handle, patternLabel (e.g. "PATTERN 01"), titleWord1 (1 ALL CAPS mono word like "THE"), titleWord2 (1-3 ALL CAPS orange mono words like "FEEDBACK LOOP"), body (1-2 mono sentences ≤40 words), flow1/flow2/flow3 (3 short mono flow steps, e.g. "User Goal" / "Generator Agent — produces draft" / "Critic Agent — scores quality"), card1Key (uppercase mono label "BEST FOR"), card1Body (1-2 mono sentences ≤25 words), card2Key (uppercase mono label "KEY INSIGHT"), card2Body (1-2 mono sentences ≤25 words), footerLeft, footerRight.
CTA   cta-mono-pattern: pageOf ("10 / 10"), handle, patternLabel (e.g. "WRAP" / "OVER TO YOU"), word1 (1 ALL CAPS mono word like "PICK"), word2 (1-2 ALL CAPS orange mono words like "ONE PATTERN"), body (1-2 mono sentences ≤30 words), quote (5-9 word mono insight overlaid on dark card), buttonLabel (3-5 words like "Save this post"), rightNote (2-4 words), footerLeft, footerRight.`,

  "rounded-card": `Layouts (pure #000 bg + giant outlined rounded card 36px-radius + orange #ff7a3f page badge + Inter sans 800 + circular icon bubbles, ref: how to grow like a 20-person team + 4_pillars_agents):
COVER cover-rounded-card: pageBadge (e.g. "01" or "01 of 10"), headlineLine1 (2-4 words, e.g. "How to grow"), headlineLine2 (3-5 orange words, e.g. "like a 20-person team"), body (1-2 sentences ≤22 words sets context), bodyAccent (3-6 orange words, e.g. "without a 20-person budget.").
BODY  body-rounded-card: pageBadge (e.g. "02"), handle ("@handle"), number ("01"-"08"), title (2-4 words), titleAccent (1-3 orange words like "the distribution"), body (2-3 sentences ≤40 words concrete), ico1/ico2/ico3/ico4 (single-char glyphs or emoji for the 4 icon bubbles, e.g. "📷" / "▶" / "♪" / "in" — use platform-appropriate glyphs), nextNote (3-6 words orange teaser), pageOf ("02 / 10").
CTA   cta-rounded-card: pageBadge ("10"), handle, eyebrow (2-3 uppercase orange spaced words like "YOUR TURN"), headlineLine1 (2-4 words), headlineLine2 (2-4 orange words), body (1-2 sentences ≤30 words), buttonLabel (3-5 words), secondaryLabel (2-4 words ghost like "Follow @handle"), footerLeft, footerRight (short text).`,

  "dark-blob": `Layouts (deep #131313 + minimalist Inter 100/600 huge title + blurry layered red+purple gradient blobs + small author chip + simple back/forward nav — Figma ref carousel_01 Help Center, MINIMAL aesthetic).
ALL families use an author chip: gradient circle with 2-letter initials + bold name + @handle. Provide authorInitials (2 letters of authorName), authorName (real-sounding first+last, e.g. "Manthan Patel"), handle ("@username" lowercase), avatarBg1 (vibrant hex), avatarBg2 (complementary darker hex).
KEEP THIS FAMILY MINIMAL — no extra cards, no takeaway boxes, no accent eyebrows. Just text + author + nav.
COVER cover-dark-blob: subline (3-5 lowercase words like "post topic here…" — short subject), titleLine1/Line2/Line3 (3 lines of huge Inter 100px semibold title, 2-4 words each, e.g. "Your nice" / "and attractive" / "title here"), authorInitials, authorName, handle, avatarBg1, avatarBg2.
BODY  body-dark-blob: subline (3-5 lowercase words on top-right, e.g. "post topic here…"), titleLine1/Line2/Line3 (3 lines of huge title text-right, 2-4 words each, e.g. "Swipe and" / "explore" / "find your way"), authorInitials, authorName, handle, avatarBg1, avatarBg2.
CTA   cta-dark-blob: headline (1-3 words centered, e.g. "Thank You"), subline (5-9 words follow-CTA, e.g. "Follow @handle for design tips"), authorInitials, authorName, handle, avatarBg1, avatarBg2.`,

  "mint-condensed": `Layouts (mint #e2ffed cover + light-gray #f1f1f1 body slides + Barlow Condensed Light huge title + slate #37474f text + dark slate pills — Figma ref carousel_14 "Ultimate Guide" Help Center).
COVER cover-mint-condensed: titleLine1 (2-3 condensed-light words like "The Ultimate"), titleLine2 (1-2 condensed-light words like "Guide to"), titleBold (EXACTLY 1 single noun in BOLD ALL CAPS-condensed — the topic word, e.g. "PROXIMITY" or "FOCUS" or "HIRING" — NEVER more than one word), authorInitials, authorName, handle, avatarBg1, avatarBg2, pageOf ("01 - 10").
BODY  body-mint-condensed: bodyLine1/Line2/Line3/Line4/Line5 (5 lines of large Inter 88px regular body, each 2-4 words, flow as a single thought broken across 5 lines like "Every new / designer / struggles / with creating / good designs."). Leave a line blank ("") if shorter. pageOf ("02 - 10").
CTA   cta-mint-condensed: authorInitials, authorName, handle, avatarBg1, avatarBg2, pageOf ("10 - 10"), tagline (1-2 sentences ≤25 words framing the brand, e.g. "Strategic goal driven web design."), ctaQuestion (4-7 words like "Want to learn more ?" or "Like what you read ?").`,

  "cream-best": `Layouts (mint #e2ffed cover + light-gray #f1f1f1 body + Barlow Condensed Light huge title + green #1acd8a topic-logo + numbered insights with image cards + green pills — Figma ref carousel_09 from Help Center, same author as mint-condensed but with numbered+image body slides).
COVER cover-cream-best: titleLine1 (2-3 condensed-light words like "9 things you"), titleLine2 (2-3 condensed-light words like "need to know about"), topic (EXACTLY 1 topic word in big bold green, e.g. "WEBFLOW" or "FIGMA" or "REACT"), authorInitials, authorName, handle, avatarBg1, avatarBg2, pageOf ("01 - 10").
BODY  body-cream-best: number ("01"-"08" — the slide number), titleLine1 (2-4 green Inter words), titleLine2 (2-4 green Inter words), body (1-2 sentences ≤30 words explanation in slate gray), tileLabel (uppercase 1-2 words like "PRO TIP" or "REMEMBER"), tileKey (3-6 words key takeaway, e.g. "Replace Zendesk in a weekend"), tileValue (1 sentence ≤15 words supporting detail), tileGlyph (1 char glyph like "★" or "F"), pageOf ("02 - 10").
CTA   cta-cream-best: authorInitials, authorName, handle, avatarBg1, avatarBg2, pageOf ("10 - 10"), tagline (1-2 sentences ≤25 words about the brand voice), ctaQuestion (4-7 words like "Want to learn more ?" or "Like this breakdown ?").`,

  "black-warning": `Layouts (light #fafafa bg + blue #3457d5 number badge top-left + @handle Geist top-right + Inter 64-104px clean editorial — Figma ref carousel_10 @usevisuals editorial template).
COVER cover-black-warning: number ("01"-"06"), handle ("@usevisuals" or similar Geist-style handle), eyebrow (2-4 uppercase blue pill words like "DESIGN PRINCIPLE" or "STARTUP LESSON"), titleLine1 (3-5 Inter bold words like "Define the Site's"), titleAccent (1-3 blue Inter words like "Purpose"), body (1-2 sentences ≤30 words), ctaLabel (3-5 words like "Read more").
BODY  body-black-warning: number ("02"-"07"), handle, title (3-6 Inter 64 bold words), body (1-2 sentences ≤30 words in 48px medium gray), calloutLabel (uppercase 2-3 words like "KEY INSIGHT" or "DO THIS"), calloutBody (1 sentence ≤22 words actionable), pageOf ("Slide 03").
CTA   cta-black-warning: number ("07"-"08"), handle, eyebrow (2-3 uppercase words like "YOUR MOVE"), headlineLine1 (2-3 Inter 700 words), headlineAccent (1-3 blue words), body (1-2 sentences ≤30 words), buttonLabel (3-5 words), pageOf.`,

  "cream-3d": `Layouts (light gray #f1f1f1 + Barlow Condensed Light title + CSS 3D terracotta orb top-right + Harsh Makwana-style author chip + slate pills — Figma ref carousel_02 + 3D illustration aesthetic).
COVER cover-cream-3d: titleLine1 (2-3 condensed-light words like "Getting your"), titleBold (1-2 BOLD condensed mid-line words like "business setup" — the focus phrase), titleLine3 (2-3 condensed-light words like "in 30 minutes"), authorInitials, authorName, handle, avatarBg1, avatarBg2, pageOf ("01 - 10").
BODY  body-cream-3d: bodyLine1/Line2/Line3/Line4/Line5 (5 lines of Inter 88 medium body broken naturally across lines, 2-4 words each — leave a line empty "" if shorter), tipLabel (uppercase 1-2 words like "PRO TIP"), tipBody (1 sentence ≤22 words tactical), pageOf.
CTA   cta-cream-3d: tagline (1-2 sentences ≤25 words about the brand voice), ctaQuestion (4-7 words like "Want to learn more ?"), handle, pageOf.`,

  "typo-sample": `Layouts (dark #1d1d1d + Geist chrome + 3 stacked rounded #2a2a2a cards showing font NAME + Aa Bb Cc weights + & glyph + descriptive paragraph — Figma ref carousel_16 @usevisuals font specimen).
The fontFamily slot drives all 5 text cards: pick a real Google Font like "Unbounded" "Playfair Display" "Montserrat" "DM Sans" "Inter" "Geist" "Cormorant Garamond" "Space Grotesk" "Fraunces" "Bricolage Grotesque" "Instrument Serif" "Manrope" — match a famous designer-loved font to the brief topic.
COVER cover-typo-sample: number ("02"), handle ("@usevisuals" or similar Geist-style handle), fontFamily (exact Google Font name, e.g. "Unbounded"), description (1-2 sentences ≤30 words describing the typeface's origin/usage/personality).
BODY  body-typo-sample: number ("03"-"06"), handle, fontFamily (DIFFERENT font per slide — each body explores a different font), description (1-2 sentences ≤30 words about that typeface).
CTA   cta-typo-sample: number ("07"), handle, headlineLine1 (2-3 bold words like "Pick"), headlineLine2 (2-4 dimmer-gray words like "the right font"), body (1-2 sentences ≤30 words), buttonLabel (3-5 words like "Save this guide"), pageOf.`,

  "data-table": `Layouts (light #fafafa + Inter 128 huge title cover + body slide w/ 160px hero stat + 3 bar rows + Inter 64 title + blue #3457d5 accents + @usevisuals chrome — Figma ref carousel_28).
COVER cover-data-table: number ("01"), handle ("@usevisuals" or similar), titleLine1 (3-5 Inter 128 bold words like "The data that"), titleAccent (1-3 blue bold words like "changed our growth"), subtitle (1 sentence ≤14 words 64px context), stat1Val (compact metric "47%"), stat1Label (3-5 words), stat2Val "$120K", stat2Label, stat3Val "10x", stat3Label.
BODY  body-data-table: number ("02"-"06"), handle, title (3-6 Inter 64 bold words), bigStat (hero metric like "47%" — 160px), bigStatLabel (3-7 word descriptor), body (1-2 sentences ≤25 words context), bar1Label/bar2Label/bar3Label (1-3 word labels), bar1Val/bar2Val/bar3Val (metric strings "47%" "$12K"), bar1Pct/bar2Pct/bar3Pct (0-100 widths — first largest), pageOf.
CTA   cta-data-table: number ("07"), handle, bigStat (single hero number "10x"), eyebrow (2-3 uppercase words like "THE RESULT"), headline (3-6 bold words), body (1-2 sentences ≤30 words), buttonLabel (3-5 words), pageOf.`,

  "tool-list": `Layouts (black #0d0d0d + outlined rounded card + color palette balls overlapping + hex code labels — Figma ref carousel_47 "Best Color Palettes for Brands").
This family is a COLOR PALETTE carousel, not a tool listicle. Each slide showcases a 4-color palette with hex codes.
COVER cover-tool-list: titleLine1 (3-4 dim-gray title words like "Best Color"), titleLine2 (2-4 white words like "Palettes for Brands"), subtitle (1 sentence ≤25 words framing the topic), previewColor1..previewColor5 (5 hex codes for the overlapping preview circles — pick a vibrant set), pageOf ("01/06").
BODY  body-tool-list: number ("1"-"5"), color1/color2/color3/color4 (4 hex codes forming a cohesive palette — e.g. brand-blue: "#04125C" "#1941BA" "#316FF6" "#92BDF9"), hex1/hex2/hex3/hex4 (uppercase hex strings matching the colors like "#04125C"), paletteName (2-4 word palette name like "Corporate Cobalt" or "Sunset Warmth"), paletteUseCase (1 sentence ≤22 words: when to use this palette), pageOf ("02/06").
CTA   cta-tool-list: eyebrow (2-3 uppercase words like "PICK YOURS"), headlineLine1 (2-3 dim words like "Choose your"), headlineLine2 (2-3 white words like "brand palette"), color1/color2/color3/color4 (4 hex codes — best palette), body (1-2 sentences ≤30 words), buttonLabel (3-5 words like "Save these palettes"), pageOf ("06/06").`,

  "flowchart": `Layouts (light #f8fafc + Inter 58 title + 3 blue checkmark rows + dark image card with 4 preview-cards on cover + Inter 32 body + @usevisuals chrome — Figma ref carousel_12 @usevisuals content-type post).
COVER cover-flowchart: number ("01"-"06"), handle ("@usevisuals" or similar), title (2-4 Inter 58 medium words like "Curation Post"), subtitle (1 sentence ≤16 words), check1/check2/check3 (3 benefit phrases, 6-10 words each, single sentence each like "Positions you as a helpful guide, not just a content creator"), cardGlyph1..cardGlyph4 (4 single-char glyphs/emoji), cardTitle1..cardTitle4 (2-4 word titles), cardSub1..cardSub4 (3-5 word subtitles).
BODY  body-flowchart: number, handle, title (2-4 Inter 58 medium words), subtitle (1 sentence ≤16 words), check1/check2/check3 (3 benefits 6-10 words each), takeawayLabel (uppercase 2-3 words like "KEY INSIGHT"), takeawayBody (1 sentence ≤22 words).
CTA   cta-flowchart: number, handle, eyebrow (2-3 uppercase words like "YOUR MOVE"), headlineLine1 (2-3 bold words), headlineLine2 (2-3 words), body (1-2 sentences ≤30 words), buttonLabel (3-5 words).`,

  "design-tile": `Layouts (light #f8fafc + Inter 96 medium centered title + 2-column comparison (bad vs good) with X/✓ badges + Inter 64/48 body on body slides + blue #3457d5 accent + @usevisuals chrome — Figma ref carousel_34 "Stop Using Illegal Colors in Design").
COVER cover-design-tile: number ("01"), handle ("@usevisuals" or similar), titleLine1 (3-5 medium-weight words like "Stop Using Illegal"), titleLine2 (2-4 words like "Colors in Design"), badColor (hex of the "wrong" choice, e.g. "#000000"), badLabel (the hex string itself or 1-3 words like "#000000"), goodColor (hex of the "right" choice, e.g. "#282828"), goodLabel (the hex string itself or 1-3 words).
BODY  body-design-tile: number ("02"-"06"), handle, titleLine1 (3-5 Inter 64 bold words), titleAccent (1-3 blue words), attr1/attr2/attr3/attr4 (4 short attribute phrases 1-3 words each like "Balanced" "Reliable" "Trusted" "Loyal"), body (1-2 sentences ≤30 words wrapping insight).
CTA   cta-design-tile: number ("07"), handle, eyebrow (2-3 uppercase words like "ADOPT THESE"), headlineLine1 (2-4 medium words), headlineLine2 (2-4 words), body (1-2 sentences ≤30 words), buttonLabel (3-5 words).`,

  "agent-lineup": `Layouts (DARK #0a0a0a + Inter 88 huge title + dark "workflow card" with 3 brand-logo flow icons + bottom 4-icon brand logo cluster + handle — Figma ref carousel_0 "Lead Generation" AI agent showcase).
This family showcases AI AGENT systems with REAL tool/brand logos. JUST PROVIDE iconSlug<N> (lowercase brand slugs like "claude" "n8n" "tiktok" "notion" "airtable" "stripe" "gmail" "perplexity" "openai" "supabase" "vercel" "github" "figma" "linkedin" "instagram" "youtube" "hubspot" "apollo" "calendly" "loom" "zapier" "make" "webflow" "framer" "discord" "slack") — compose auto-renders SVG + brand color + display name. NO iconColor or toolName fields needed.
COVER cover-agent-lineup: title (3-6 word agent name like "Lead Generation Agent"), description (1-2 sentences ≤30 words), flowLabel (uppercase 2-3 words like "WORKFLOW"), iconSlug1, iconSlug2, iconSlug3 (3 brand slugs for the flow), flowCaption (4-8 word caption like "Capture → enrich → store automatically"), iconSlug4, iconSlug5, iconSlug6, iconSlug7 (4 supporting tool slugs), ctaText (3-7 words like "comment 'AGENTS' for the full stack").
BODY  body-agent-lineup: slideLabel (uppercase "AGENT 02" or "STEP 02"), title (3-5 word agent name), description (1-2 sentences ≤30 words), iconSlug1, iconSlug2, iconSlug3 (3 workflow step slugs), toolRole1, toolRole2, toolRole3 (3-7 word role descriptions like "Finds prospects from ICP filters"), iconSlug4, iconSlug5, iconSlug6, iconSlug7 (4 bottom row slugs), handle.
CTA   cta-agent-lineup: eyebrow (2-3 uppercase words like "FULL STACK INSIDE"), ctaHeadline1 (2-4 bold words), ctaHeadline2 (2-5 accent words like "All My AI Freebies"), freeBadge (3-5 words like "100% FREE"), iconSlug1..iconSlug8 (8 stack slugs), handle.`,

  "stack-tour": `Layouts (light WHITE bg + Inter 80 title + per-tool body slide w/ brand-logo hero card + 3 checkmark bullets + bottom logo strip — modern tech-stack tour).
Uses inline brand SVGs via iconSlug<N>. Compose auto-derives brand color + display name. Same slug list as agent-lineup. NO iconColor or toolName fields needed unless you want to override.
COVER cover-stack-tour: eyebrow (2-4 uppercase words like "MY 6-TOOL STACK"), title (3-7 word title), description (1-2 sentences ≤30 words), iconSlug1..iconSlug6 (6 brand slugs filling the 6-card grid), toolRole1..6 (3-5 word role labels like "Email automation"), ctaText (3-6 words like "Read the breakdown"), handle.
BODY  body-stack-tour: slideLabel ("02 / 08" or "TOOL 02"), handle, iconSlug1 (the FEATURED tool slug), toolTagline (4-8 word tagline), description (1-2 sentences ≤30 words), bullet1/bullet2/bullet3 (3 specific use-case phrases 4-8 words each), accentColor (hex brand color for bullet borders, e.g. "#D97757" for claude), stackLabel (uppercase 2-3 words like "PAIRS WELL WITH"), iconSlug2..iconSlug6 (5 supporting tool slugs), ctaBottom (3-5 words).
CTA   cta-stack-tour: pageOf, handle, eyebrow (2-3 uppercase words like "YOUR TURN"), headlineLine1 (2-3 bold words), headlineLine2 (2-3 muted words), iconSlug1..iconSlug7 (7 full-stack brand slugs), body (1-2 sentences ≤30 words), ctaText (3-5 words).`,

  "before-after": `Layouts (light #fff + Inter 84 title + blue/green accent + X/✓ comparison rows + small brand-logo strip — Figma ref carousel_5 "01. Routing Agent" before-vs-after).
Uses inline brand SVGs via iconSlug<N>. Compose auto-derives color. NO iconColor fields needed.
COVER cover-before-after: pageOf, handle, title (2-4 bold words like "Stop doing"), titleAccent (1-3 blue words), description (1-2 sentences ≤30 words), badLabel1, badLabel2 (2 BAD-state phrases 4-7 words each), badStat1, badStat2 (short stats like "2% reply rate"), goodLabel1, goodLabel2 (2 GOOD-state phrases 4-7 words), goodStat1, goodStat2 (positive stats), iconSlug1, iconSlug2, iconSlug3, iconSlug4 (4 bottom-strip brand slugs).
BODY  body-before-after: slideLabel ("STEP 02 / 06"), handle, title (2-4 bold words), titleAccent (1-3 blue words), description (1-2 sentences ≤30 words), badLabel (uppercase 1-2 words like "BEFORE"), badText (1 sentence ≤22 words), badStat (metric like "$300/lead"), iconSlug1, iconSlug2 ("before" stack slugs), goodLabel (uppercase 1-2 words like "AFTER"), goodText (1 sentence ≤22 words), goodStat (metric like "$25/lead"), iconSlug3, iconSlug4, iconSlug5 ("after" stack slugs), ctaArrow (3-5 words).
CTA   cta-before-after: pageOf, handle, eyebrow (2-3 uppercase words like "MAKE THE SWITCH"), headlineLine1 (2-3 bold words), headlineAccent (1-3 green words), body (1-2 sentences ≤30 words), iconSlug1..iconSlug6 (6 brand slugs), ctaText (3-5 words).`,

  "dark-pill-glow": `Layouts (deep #0a0a0a + dotted texture + horizontal pill with two-tone glowing text + Fraunces italic subtitle + small orange tag pill + soft Card outline — premium dev-tool aesthetic).
COVER cover-dark-pill-glow: tag (1 short uppercase category word like "TOOLS" / "REPOS" / "STACK"), pillLeft (1-2 Inter words, white, e.g. "Open source"), pillRight (1-2 orange-glowing Inter words completing the phrase, e.g. "tools" — note: kept short, single line), subline (4-8 word descriptor, ends focuses on the audience like "projects for analytics teams"), pageOf (e.g. "01 / 06").
BODY  body-dark-pill-glow: A "browser homepage" mockup at top, dark italic-serif title at bottom. ONLY 7 slots needed: toolName (1-3 word product name), heroTitle (4-8 word product hero headline), heroBody (1 sentence ≤22 words product description), slideTitle (Fraunces italic 4-7 word slide title summarizing the topic of this slide), slideSubtitle (1 sentence ≤22 words italic), domainText (short fake domain like "toolname.com"), pageOf ("02 / 06"). All other UI elements are pre-styled by the template.
CTA   cta-dark-pill-glow: tag (1-2 uppercase words like "WRAP"), eyebrow (4-7 italic words like "the rest is up to you"), headlineMain (2-3 bold Inter words white), headlineGlow (1-3 orange-glow Inter words completing the headline), sublineItalic (1 sentence ≤25 words Fraunces italic), pageOf ("06 / 06").`,

  "shout-orange": `Layouts (bright #ff5722 orange bg + grain texture + huge Inter 900 BLOCK-LETTER shout headline + Fraunces italic accents + black cards — punchy bold callout aesthetic, ALL CAPS energy).
COVER cover-shout-orange: tag (1-2 uppercase words category like "RANT" / "HOT TAKE"), swipeNote (3-5 word arrow note like "Why? swipe →"), shoutLine1 (2-4 ALL CAPS words black, the FIRST half of the shout, e.g. "STOP RENTING"), shoutLine2 (2-4 ALL CAPS words cream-white, the SECOND half, e.g. "YOUR DATA"), subQuestion (8-14 word italic-serif question or jab), pageOf ("01 / 06").
BODY  body-shout-orange: tag (1-2 uppercase category words), slideNum ("02"), eyebrow (4-7 italic-serif words intro line), shoutLine1 (2-4 ALL CAPS words black), shoutLine2 (2-4 ALL CAPS words cream-white), bodyLabel (1-2 uppercase words like "WHY IT MATTERS"), bodyText (1-2 sentences ≤35 words, can include 1-2 italic phrases wrapped in <em>...</em>), statLabel1/statLabel2/statLabel3 (3 short uppercase metric labels 1-2 words like "TIME" / "COST" / "OUTPUT"), statValue1/statValue2/statValue3 (3 short metric values like "47%" / "$2k" / "10x"), swipeNote (3-5 words like "next up"), pageOf ("02 / 06").
CTA   cta-shout-orange: tag (1-2 uppercase words like "FIN"), eyebrow (4-7 italic-serif words wrap-up intro), ctaLine1 (2-4 ALL CAPS words black), ctaLine2 (2-4 ALL CAPS words cream-white), ctaBody (1-2 sentences ≤30 words direct), btnPrimary (2-3 word primary CTA like "GRAB THE LIST"), btnGhost (2-3 word secondary like "Share with a friend"), footerMeta (2-4 words footer note), pageOf ("06 / 06").`,

  "leak-dark": `Layouts (deep #0a0a0a + faint grid + orange-glow gradient title accent + dark code preview frame + small orange dot-tag pill — tech-launch / hot-news aesthetic).
COVER cover-leak-dark: tag (1-3 uppercase words like "JUST SHIPPED" / "NEW DROP"), dateMeta (short mono date like "v2.4 · today"), eyebrow (4-7 mono comment-style words like "// changes everyone missed"), titleLine1 (2-4 bold Inter words white), titleLine2 (1-3 orange-gradient-glow words like "10x faster"), filePath (mono path like "~/src/app.ts"), codeComment (4-8 words mono comment), codeKeyword (1 word like "function" / "async"), codeFn (1 word function name like "deploy"), codeArg (short string arg like "production"), codeReturn (number like "200" or "true"), domainText (short domain like "factory.dev"), swipeNote (1-2 uppercase words like "SCROLL").
BODY  body-leak-dark: tag (1-2 uppercase words), stepMeta (mono step like "02 / 06"), title (2-4 Inter bold words), titleAccent (1-3 orange words), subtitle (1 sentence ≤25 words), b1Title/b2Title/b3Title (3 short bold-line subtitles 3-6 words each), b1Body/b2Body/b3Body (3 single-sentence descriptions ≤18 words each), cmdLine (short mono command like "deploy --to=prod"), outLine (mono output preview like "build complete in 1.2s"), okLine (1-2 mono SUCCESS word like "✓ DONE"), domainText, pageOf ("02 / 06").
CTA   cta-leak-dark: tag (1-2 uppercase words like "WRAP UP"), eyebrow (4-7 mono words), ctaLine1 (2-4 bold Inter words white), ctaLine2 (1-3 orange-glow words), ctaBody (1-2 sentences ≤30 words), btnPrimary (2-3 word primary CTA), btnGhost (2-4 word secondary), meta1 (3-5 word status line like "open source · MIT"), meta2 (3-5 word status line like "built in 2025"), domainText, pageOf ("06 / 06").`,

  "cream-claude": `Layouts (warm #f5efe2 cream + faint grid + bold black Inter + Claude-orange #d97757 starburst + Fraunces italic accents + black sub-card — editorial / Claude-creator aesthetic).
COVER cover-cream-claude: tag (1-2 uppercase words like "CLAUDE" / "SKILLS"), handle (short site label like "factory.51ultron.com"), eyebrow (3-6 italic-serif words intro), titleLine1 (2-4 bold Inter words black), titleAccent (1-2 orange Inter words), titleItalic (1-3 italic Fraunces words like "for real"), subEyebrow (2-4 uppercase orange words like "WHY IT WORKS"), subText (1-2 sentences ≤30 words with 1-2 italic phrases wrapped in <em>...</em>), domainText (short site label), swipeNote (1-2 words like "READ").
BODY  body-cream-claude: tag (1-2 uppercase words), stepMeta (short mono like "02 / 06"), sectionNum (single italic-serif numeral like "01"), eyebrow (2-3 uppercase orange words like "PRINCIPLE 01"), title (3-5 bold Inter words), titleItalic (1-3 Fraunces italic words like "for builders"), subtitle (1 sentence ≤22 words), codeComment (4-7 words mono comment), codeKeyword (1 word like "import"), codeFn (1 word like "ship"), codeArg (short string), b1Title/b2Title (2 bold short bullets 3-5 words each), b1Body/b2Body (single-sentence descriptions ≤18 words each), domainText, pageOf ("02 / 06").
CTA   cta-cream-claude: tag (1-2 uppercase words like "WRAP"), eyebrow (3-6 italic-serif words), ctaLine1 (2-4 bold Inter words black), ctaAccent (1-2 orange Inter words), ctaItalic (1-3 italic Fraunces words), ctaBody (1-2 sentences ≤30 words), btnPrimary (2-3 word primary CTA), btnGhost (2-3 word secondary), signoff (3-6 italic-serif words sign-off line), domainText, pageOf ("06 / 06").`,

  "tech-stack-grid": `Layouts (dark #0a0a0a + faint grid + orange-glow gradient + 6 brand-logo tool cards on cover + per-tool hero body slide with checkmark features + "pairs with" chip row + pure brand-icon driven — modern technical "my stack" aesthetic).
USES the iconSlug<N> system from compose.js. JUST pass lowercase brand slugs like "claude" "n8n" "notion" "supabase" "vercel" "cursor" "perplexity" "github" "stripe" "openai" "framer" "figma" "linear" "raycast" "loom" "calendly" "tiktok" "instagram" "linkedin" "youtube" "make" "zapier" "airtable" "webflow" "docker" "postgresql" "redis" "typescript" "react" "nextdotjs" — compose auto-derives brand color + SVG. NO need for iconColor or display names (compose maps slugs to "Next.js", "n8n" etc).
COVER cover-tech-stack-grid: tag (1-2 uppercase words like "MY STACK"), handle (short site like "factory.51ultron.com"), eyebrow (3-6 italic-serif intro words), titleLine1 (2-4 bold Inter words), titleAccent (1-3 orange-glow words like "tools that ship"), iconSlug1..iconSlug6 (6 brand slugs for the 6 tool cards — pick a coherent stack), role1..role6 (3-4 word uppercase role label per tool like "WRITES CODE" / "RUNS WORKFLOWS"), toolName1..toolName6 (optional — compose auto-derives from slug if omitted), pageOf ("01 / 08").
BODY  body-tech-stack-grid: tag (1-2 uppercase words), stepMeta (mono step like "02 / 08"), iconSlug1 (the ONE featured brand slug for this slide), toolName1 (optional — compose auto-derives), toolRole (3-5 word uppercase role label), toolTagline (2-3 word category tag like "ESSENTIAL"), tagline (1 sentence ≤22 words Fraunces italic about what this tool does), f1Title/f2Title/f3Title (3 short feature lines 3-6 words each), f1Body/f2Body/f3Body (single-sentence ≤18 word descriptions per feature), iconSlug2/iconSlug3/iconSlug4/iconSlug5 (4 "pairs with" supporting brand slugs), domainText, pageOf ("02 / 08").
CTA   cta-tech-stack-grid: tag (1-2 uppercase words like "WRAP"), handle, eyebrow (3-6 italic-serif words), ctaLine1 (2-4 bold Inter words), ctaLine2 (1-3 orange-glow words), ctaBody (1-2 sentences ≤30 words), iconSlug1..iconSlug6 (6 brand slugs — full stack recap), btnPrimary (2-3 word primary CTA), btnGhost (2-3 word secondary), domainText, pageOf ("08 / 08").`,

  "lime-accent": `Layouts (deep #0a0a0a + dot grid + bright lime #c6f04a accent callout box around the topic word + bold Inter 900 white headline + numbered listicle style — modern "N tools/repos/skills you need" aesthetic).
Uses iconSlug<N> brand-icon system (compose.js auto-renders SVG + brand color).
COVER cover-lime-accent: brandTag (1-2 uppercase words like "STACK PICK" / "AI TOOLS"), handle (short like "factory.51ultron.com"), eyebrow (2-3 uppercase words like "2026 PICKS" / "VIBE CODING"), titleLine1 (2-4 bold Inter words like "9 free"), titleCallout (1-2 words rendered in bright lime callout box like "vibe coding"), titleLine3 (2-4 words like "tools to know"), iconSlug1..iconSlug6 (6 brand slugs of the tools on the list), swipeLabel (1-2 words like "SEE LIST"), pageOf ("01 / 08").
BODY  body-lime-accent: numLabel (uppercase tool label like "TOOL 01"), handle, iconSlug1 (the featured tool slug for this slide), toolName (optional, compose auto-fills), toolTag (1-2 lime-pill words like "free" / "essential"), toolTagline (1 sentence ≤15 words), bodyText (1-2 sentences ≤40 words with 1-2 phrases wrapped in <em>...</em>), bullet1/bullet2/bullet3 (3 short benefit lines 4-8 words each), metric1Label/metric2Label/metric3Label (3 short uppercase labels 1-2 words like "PRICE" / "USERS" / "OSS"), metric1Value/metric2Value/metric3Value (3 short metric values), pageOf ("02 / 08"), footerNote (3-5 word footer note like "open source, MIT").
CTA   cta-lime-accent: brandTag (1-2 uppercase words like "WRAP"), handle, eyebrow (2-4 uppercase words like "PICK YOURS"), ctaLine1 (2-4 bold Inter words), ctaCallout (1-2 words in lime callout like "today"), ctaBody (1-2 sentences ≤30 words), btnPrimary (2-3 word primary CTA), btnGhost (2-3 word secondary), iconSlug1..iconSlug6 (6 brand slugs — full stack recap), pageOf ("08 / 08"), footerNote (3-5 word footer note).`,

  "pixel-block": `Layouts (deep #0a0a0a + dot grid + chunky retro Press-Start-2P pixel-letter topic word + orange #ff7a3c + Fraunces italic accents + dark terminal preview — retro/dev/leetcode-vibe listicle aesthetic).
Uses iconSlug<N> brand-icon system.
COVER cover-pixel-block: brandTag (1-2 uppercase words like "REPOS" / "SKILLS"), handle, preLine (3-6 italic-serif intro words like "the only repos for"), pixelLine1 (1-2 SHORT Press-Start-2P pixel-letter words like "VIBE CODE" — UPPERCASE, ≤10 chars total), pixelLine2 (1-2 SHORT pixel-letter words like "TOOLS" — UPPERCASE, ≤10 chars total — note these will render BIG and chunky, keep words short to avoid overflow), postLine (4-8 italic-serif words like "real devs use every day"), iconSlug1..iconSlug5 (5 brand slugs), statValue (short pixel-style metric like "9" or "12k"), statLabel (1-2 uppercase words like "REPOS"), swipeLabel (1-2 words like "SCROLL"), pageOf ("01 / 08").
BODY  body-pixel-block: numLabel (Press-Start pixel-style label like "TOOL 01" — ≤8 chars), handle, iconSlug1 (featured tool slug), toolName (optional, will be SHORT ≤10 chars — for the pixel rendering keep it short), categoryLabel (1-2 uppercase mono words like "FREE" / "PAID"), toolTagline (1 italic sentence ≤14 words), bodyText (1-2 sentences ≤35 words with <em>...</em> highlights), skill1Label/skill2Label/skill3Label/skill4Label (4 pixel-mono labels like "WHAT IT DOES" / "BEST FOR" — each ≤14 chars), skill1Body/skill2Body/skill3Body/skill4Body (4 short body lines ≤14 words each), cmdLine (mono terminal command like "git clone repo"), outLine (mono terminal output like "cloned in 1.2s"), pageOf ("02 / 08"), footerNote (mono footer note).
CTA   cta-pixel-block: brandTag (1-2 uppercase words like "WRAP UP"), handle, eyebrow (3-6 italic-serif words), ctaLine1 (1-2 SHORT pixel-letter words ≤10 chars total), ctaLine2 (1-2 SHORT pixel-letter words ≤10 chars total), ctaBody (1-2 sentences ≤30 words), btnPrimary (2-3 word primary CTA), btnGhost (2-3 word secondary), iconSlug1..iconSlug6 (6 brand slugs — full stack recap), pageOf ("08 / 08"), footerNote.`,

  "cream-table": `Layouts (warm #f5efe2 cream + bold black Inter + orange #d97757 accent + Fraunces italic + 5 stacked LARGE icon rows with hard 4px black shadow (Memphis editorial style) — for "N tools/repos/skills" listicle covers, structured big-row body slides, full-stack CTA. NO empty space — content fills the canvas via stacked rows).
Uses iconSlug<N> brand-icon system.
COVER cover-cream-table: brandTag (1-2 uppercase words like "AI STACK"), handle, eyebrow (3-6 italic-serif intro words like "the only tools I use"), titleLine1 (2-4 bold words like "5 free"), titleAccent (1-2 orange words like "AI tools"), titleLine3 (2-4 words like "every founder"), titleItalic (1-3 Fraunces italic words like "actually needs"), iconSlug1..iconSlug5 (5 brand slugs of the tools shown in the 5 rows), name1..name5 (optional, compose auto-fills from slug), desc1..desc5 (single sentence ≤14 words per row description), tag1..tag5 (1-2 uppercase word tags per row like "FREE"/"OSS"/"PAID"/"NEW"), swipeLabel (1-2 words like "SEE EACH ONE"), pageOf ("01 / 08").
BODY  body-cream-table: numLabel (uppercase label like "TOOL 02"), handle, iconSlug1 (the featured tool brand slug), toolName (optional, auto-derived), toolTagline (1 Fraunces italic sentence ≤14 words about what the tool is), bigStatement (1 short bold statement ≤22 words with 1-2 <em>...</em> highlights, sets up the tool's value), use1Title/use2Title/use3Title (3 short use-case titles 3-5 words each), use1Body/use2Body/use3Body (single sentence ≤14 words per use-case body), use1Metric/use2Metric/use3Metric (3 short mono-style metric strings like "<5min" / "$0" / "12k★"), compatLabel (1 Fraunces italic phrase like "Pairs beautifully with"), iconSlug2..iconSlug6 (5 supporting/compatible tool slugs), pageOf ("02 / 08"), footerNote (3-5 word footer note).
CTA   cta-cream-table: brandTag (1-2 uppercase words like "WRAP"), handle, eyebrow (3-6 italic-serif words), titleLine1 (2-4 bold words), titleAccent (1-2 orange words), titleItalic (1-3 Fraunces italic words), body (1-2 sentences ≤30 words), btnPrimary (2-3 word primary CTA), btnGhost (2-3 word secondary), stackLabel (italic 2-3 words like "the full stack"), iconSlug1..iconSlug6 (6 brand slugs full stack recap), signoff (3-6 italic words like "ship your weekend project"), pageOf ("08 / 08").`,

  "photo-tag": `Layouts (procedural gradient "photo" bg with blurred multi-color blobs + dark overlay + orange #ff5722 tag chip + bold white Inter headline overlay + Fraunces italic accents + glassmorphism cards — premium magazine / launch-announcement aesthetic. NO empty space — overlays + cards fill the canvas).
Uses iconSlug<N> brand-icon system. Procedural photo via these color slots: photoBgAngle (degrees number 120-200), photoBg1/photoBg2 (2 deep hex colors for the bg gradient like "#1a0a2e" "#0a1a2e"), blobColor1/blobColor2/blobColor3 (3 vibrant hex blob colors that mix-blend like "#ff5722" "#c83b91" "#3a5eef") — pick colors that match the brief's energy.
COVER cover-photo-tag: tag (1-3 uppercase words like "HOT TAKE" / "JUST SHIPPED"), handle, featGlyph (1-char glyph for the small feature card icon like "★" / "⚡" / "↑"), featLabel (1-2 uppercase short words like "TRENDING"), featName (1-3 words like "AI Workflows"), eyebrow (3-6 italic-serif words like "what you missed this week"), titleLine1 (2-4 bold words like "The new"), titleAccent (1-3 orange-glow words like "AI stack"), titleItalic (1-3 italic Fraunces words like "every dev needs"), sublineText (1-2 sentences ≤25 words context), iconSlug1..iconSlug4 (4 brand slugs of relevant tools), swipeLabel (1-2 words like "READ"), photoBgAngle, photoBg1, photoBg2, blobColor1, blobColor2, blobColor3.
BODY  body-photo-tag: numLabel (uppercase short label like "TOOL 02"), handle, iconSlug1 (featured tool brand slug), toolName (optional auto-derived), toolTagline (1 Fraunces italic sentence ≤14 words), headline (3-5 bold words ≤30 chars), headlineItalic (1-3 Fraunces italic words), bodyLabel (uppercase mono label 1-3 words like "WHY IT WINS"), bodyText (1-2 sentences ≤30 words with 1-2 <em>...</em> highlights), feat1Text/feat2Text/feat3Text (3 short feature-row lines 4-8 words each), feat1Tag/feat2Tag/feat3Tag (3 mono-style short tag strings like "FREE" / "<5min" / "OSS"), metric1Value/metric2Value/metric3Value (3 short metric strings like "47%" / "$0" / "10x"), metric1Label/metric2Label/metric3Label (3 uppercase short labels 1-2 words like "FASTER" / "FREE TIER" / "MORE OUTPUT"), iconSlug2..iconSlug5 (4 supporting tool slugs), pageOf ("02 / 08"), photoBgAngle, photoBg1, photoBg2, blobColor1, blobColor2.
CTA   cta-photo-tag: tag (1-3 uppercase words like "WRAP"), handle, eyebrow (3-6 italic-serif words), ctaLine1 (2-4 bold white words), ctaAccent (1-2 orange-glow words), ctaItalic (1-3 italic Fraunces words), ctaBody (1-2 sentences ≤30 words), btnPrimary (2-3 word primary CTA), btnGhost (2-3 word secondary), stackLabel (italic 2-3 words like "Powered by"), iconSlug1..iconSlug6 (6 brand slugs — full stack recap), signoff (3-6 italic words like "build your weekend"), pageOf ("08 / 08"), photoBgAngle, photoBg1, photoBg2, blobColor1, blobColor2.`,

  "highlight-box": `Layouts (deep #0a0a0a + faint grid + bold white Inter title with a colored LABEL BOX behind the key word + bullet rows + brand-icon strip — modern data-driven question-format listicle aesthetic).
The accentColor slot drives the highlight box AND all accents. Pick a vibrant hex per brief — e.g. "#c6f04a" for lime, "#ff5722" for orange, "#3457d5" for blue, "#a78bfa" for purple, "#ec4899" for pink.
COVER cover-highlight-box: brandTag (1-3 uppercase words like "DATA POST" / "HOT TAKE"), handle, accentColor (vibrant hex matching the topic energy), eyebrow (3-6 italic-serif intro words like "what nobody talks about"), titleLine1 (2-4 bold words like "How much of"), titleHighlight (1-2 words rendered in colored label box like "the internet"), titleTrail (2-4 trailing words like "is AI?"), bullet1Text/bullet2Text/bullet3Text (3 short fact lines 5-9 words each), bullet1Tag/bullet2Tag/bullet3Tag (3 short uppercase tags like "2026" / "USA" / "Q3"), iconSlug1..iconSlug5 (5 brand slugs of relevant tools/sources), sourceValue (short stat like "9 in 10"), sourceLabel (uppercase 2-3 words like "AGREE WITH"), swipeLabel (1-2 words like "INSIDE"), pageOf ("01 / 08").
BODY  body-highlight-box: numLabel (uppercase short label like "FACT 02"), handle, accentColor (same vibrant hex as cover), iconSlug1 (featured brand/source slug), toolName (optional auto-derived), categoryLabel (uppercase 1-2 words like "SOURCE" / "TOOL"), toolTagline (1 italic Fraunces sentence ≤14 words), statementLine1 (2-5 bold words leading), statementHighlight (1-2 colored-label-box words), statementItalic (2-5 italic Fraunces trailing words), fact1Title/fact2Title/fact3Title (3 short fact titles 3-6 words each), fact1Body/fact2Body/fact3Body (single sentence ≤14 words each), fact1Metric/fact2Metric/fact3Metric (3 mono-style metric chips like "47%" / "$2M"), m1Value/m2Value/m3Value (3 short hero metric values like "9 in 10"), m1Label/m2Label/m3Label (3 uppercase 1-2 word labels), iconSlug2..iconSlug5 (4 supporting source slugs), pageOf ("02 / 08").
CTA   cta-highlight-box: brandTag (1-2 uppercase words like "WRAP"), handle, accentColor (same vibrant hex), eyebrow (3-6 italic-serif words), ctaLine1 (2-4 bold words), ctaHighlight (1-2 colored-label-box words), ctaBody (1-2 sentences ≤30 words), btnPrimary (2-3 word primary CTA), btnGhost (2-3 word secondary), stackLabel (italic 2-3 words like "powered by"), iconSlug1..iconSlug6 (6 brand slugs), signoff (3-6 italic words), pageOf ("08 / 08").`,

  "stencil-stamp": `Layouts (deep #0a0a0a + grain texture + chunky Anton stenciled-letter title (orange + white outline) + orange ✱ asterisk decorations + structured body — wood-cut stamp / brutalist editorial listicle aesthetic).
Uses iconSlug<N> brand-icon system.
COVER cover-stencil-stamp: brandTag (1-2 uppercase words like "TIPS" / "SKILLS"), handle, preLine (3-6 italic-serif intro words like "the only repos for"), titleLine1 (1-3 SHORT Anton-stencil words like "5 SECRET" — UPPERCASE, ≤14 chars total per line — title font renders huge), titleStamp (1-2 SHORT orange-stamp words ≤12 chars like "CLAUDE"), titleOutline (1-2 SHORT outline-stamp words ≤14 chars like "SKILLS"), postLine (4-8 italic-serif words like "every dev should master"), cardEyebrow (uppercase 2-3 words like "INSIDE THE PACK"), cardText (1 sentence ≤18 words summary), iconSlug1..iconSlug4 (4 brand slugs preview chips), swipeLabel (1-2 words like "OPEN"), pageOf ("01 / 08").
BODY  body-stencil-stamp: numLabel (uppercase short label like "SKILL 02"), handle, iconSlug1 (featured tool slug), toolName (optional auto-derived — keep SHORT for stencil rendering), categoryLabel (uppercase 1-2 words like "WORKFLOW" / "PROMPT"), toolTagline (1 italic Fraunces sentence ≤14 words), stampLine1 (1-3 SHORT Anton-stencil words ≤14 chars like "GHOST WRITER"), stampAccent (1-2 SHORT orange-stamp words ≤12 chars like "MODE"), bodyText (1-2 sentences ≤30 words with 1-2 <em>...</em> highlights), feat1Text/feat2Text/feat3Text (3 short feature HEADLINES 4-8 words each), feat1Sub/feat2Sub/feat3Sub (3 single-sentence SUB-DESCRIPTIONS 8-14 words each that expand on each feature headline — REQUIRED, no empty), feat1Tag/feat2Tag/feat3Tag (3 short uppercase tags like "FREE" / "NEW" / "PRO"), iconSlug2..iconSlug5 (4 supporting tool slugs), pageOf ("02 / 08").
CTA   cta-stencil-stamp: brandTag (1-2 uppercase words like "WRAP"), handle, eyebrow (3-6 italic-serif words), ctaStamp (1-2 SHORT orange-stamp words ≤12 chars like "SAVE THIS"), ctaOutline (1-2 SHORT outline-stamp words ≤12 chars like "POST"), ctaBody (1-2 sentences ≤30 words), btnPrimary (2-3 word primary CTA), btnGhost (2-3 word secondary), stackLabel (italic 2-3 words), iconSlug1..iconSlug6 (6 brand slugs), signoff (3-6 italic words), pageOf ("08 / 08").`,

  "edu-bright": `Layouts (cream #f7f5f0 + bold Inter 900 + dark navy + dc2626 red accent + Memphis hard 5px-shadow cards + 3 BODY VARIANTS that rotate across slides for visual variety — academic/educational ML/data-science aesthetic).
Uses iconSlug<N> brand-icon system. Body variants ROTATE per slide: chart, flow, table, chart, flow, table.

COVER cover-edu-bright: brandTag (1-2 uppercase words like "ML GUIDE" / "AI TUTORIAL"), handle, eyebrow (3-6 italic-serif intro words), titleLine1 (2-4 bold Inter words like "Top 5"), titleAccent (1-3 red-accent words like "RAG techniques"), titleItalic (1-3 Fraunces italic words like "in 2026"), previewLabel (uppercase mono 2-3 words like "MODEL BENCHMARK"), barLbl1..barLbl5 (5 short bar labels 3-6 chars each like "GPT-4" / "Claude"), previewSource (short label like "Source: Hugging Face"), previewYear (e.g. "Q3 2026"), iconSlug1..iconSlug5 (5 brand slugs), toolCount (number like "12+"), countLabel (uppercase 2-3 words like "tools covered"), swipeLabel (1-2 words like "READ"), pageOf ("01 / 08").

BODY (3 variants — pick whichever layoutId the schema dictates):
body-edu-bright-chart (bar chart card): numLabel (uppercase "TIP 02"), handle, sectionLabel (uppercase mono 2-3 words like "BENCHMARK 01"), title (2-4 bold words), titleItalic (1-3 italic Fraunces words), subtitle (1 sentence ≤22 words), chartTitle (uppercase mono 2-3 words like "ACCURACY"), chartYAxis (1-2 mono words like "MMLU %"), bar1V..bar5V (5 short metric values like "47%" / "85%") — CRITICAL: bars render at heights 38/56/74/94/48% so order values STRICTLY ASCENDING with bar4 as the PEAK (best/highest) so visual story matches data — if "lower is better" (latency, cost, time), INVERT the metric to "speedup vs baseline" or "savings %" so larger=better, bar1L..bar5L (5 short bar labels 4-8 chars each, MATCHING the values order), chartSource (1-3 words mono like "Anthropic blog"), chartPeriod (2-3 words like "Q3 2026"), insightLabel (uppercase mono 2-3 words like "KEY TAKEAWAY"), insightText (1 sentence ≤22 words with 1 <em>...</em> highlight), iconSlug1..iconSlug4 (4 brand slugs), pageOf ("02 / 08").

body-edu-bright-flow (4-node flow diagram card): numLabel, handle, sectionLabel, title, titleItalic, subtitle, flowTitle (uppercase mono 2-4 words like "RAG PIPELINE"), node1Glyph/node2Glyph/node3Glyph/node4Glyph (4 single-char/glyph icons like "1" "2" "3" "✓" or emoji), node1Name..node4Name (4 short node names 1-2 words each like "Query" / "Embed" / "Retrieve" / "Answer"), node1Sub..node4Sub (4 SHORT 1-3 word subtitles like "User input" / "OpenAI ada"), flowDetail (1 sentence ≤22 words about the flow with 1 <em>...</em>), flowMeta (mono 2-3 words like "200ms latency"), insightLabel, insightText, iconSlug1..iconSlug4, pageOf.

body-edu-bright-table (4-row comparison table): numLabel, handle, sectionLabel, title, titleItalic, subtitle, colHead0 (uppercase mono 1-2 word column header like "MODEL"), colHead1 (mono 1-2 words like "COST"), colHead2 (mono 1-2 words like "SPEED"), colHead3 (mono 1-2 words like "SCORE"), row1Name..row4Name (4 short row names 1-3 words like "GPT-4o" / "Claude 3.5"), row1C1..row4C1 (4 short column-1 cell values), row1C2..row4C2 (4 short column-2 values), row1C3..row4C3 (4 short column-3 values — the "winner" row 3 gets highlighted), insightLabel, insightText, iconSlug1..iconSlug4 (4 row icons), iconSlug5..iconSlug8 (4 footer chip icons), pageOf.

CTA cta-edu-bright: brandTag (1-2 uppercase words like "RECAP"), handle, eyebrow (3-6 italic-serif words), ctaLine1 (2-4 bold Inter words), ctaAccent (1-2 red-accent words), ctaItalic (1-3 italic Fraunces words like "this Friday"), recapLabel (italic 2-3 words like "the full stack"), iconSlug1..iconSlug6 (6 brand slugs full stack recap), ctaBody (1-2 sentences ≤30 words), btnPrimary (2-3 word primary CTA), btnGhost (2-3 word secondary), signoff (3-6 italic words), pageOf ("08 / 08").`,

  "terminal-glow": `Layouts (deep #0a0e14 + 32px grid lines + #5fd9a8 mint-green terminal accent + JetBrains Mono throughout body chrome + huge Inter 900 headlines + faux-terminal windows showing commands & outputs — developer/CLI/devops aesthetic for hackers, SREs, CLI power-users).

Uses iconSlug<N> brand-icon system (compose.js auto-renders SVG + brand color). Pass lowercase slugs for any brand mentioned.

COVER cover-terminal-glow: brandTag (1-2 uppercase words like "DEVOPS" / "CLI TIPS"), handle (e.g. "@kernelhq" — terminal-feel handle), termTitle (faux file path like "~/devops/automation.sh" or "deploy-pipeline.yml"), cmdLine (a real-looking shell command ≤60 chars like "kubectl get pods --all-namespaces"), outLine (terminal output prefix ≤30 chars like "found 42 services across"), outHighlight (the highlighted suffix ≤14 chars like "12 clusters"), intro (3-6 italic-serif intro words like "the only CLI tools for"), titleLine1 (1-2 bold Inter words like "5 shell"), titleAccent (1-2 mint-green words like "secrets"), titleItalic (1-3 italic Fraunces words like "senior devs use"), stat1V..stat4V (4 short metric values like "47%" / "10x" / "0ms"), stat1L..stat4L (4 short uppercase labels 1-2 words like "FASTER"), iconSlug1..iconSlug5 (5 brand slugs), swipeLabel (1-2 words like "RUN"), pageOf ("01 / 08").

BODY  body-terminal-glow: numLabel (uppercase like "CMD 02"), handle, sectionLabel (uppercase mono 2-3 words like "TRICK 02"), title (2-3 bold Inter words like "Pipe to"), titleAccent (1-2 mint words like "fzf"), titleItalic (1-3 italic Fraunces words like "for instant fuzzy search"), subtitle (1 sentence ≤22 words context for the trick), termTitle (file path/command name like "~/.zshrc" or "git-helpers.sh"), termBadge (uppercase short 1-2 words like "ZSH" / "BASH" / "DOCKER"), cmtLine (a # comment line ≤50 chars like "# replace cd with auto-complete jump"), cmd1/cmd2/cmd3 (3 real shell commands ≤60 chars each), out1/out2/out3 (3 short output prefixes ≤30 chars each), out1Hl/out2Hl/out3Hl (3 highlighted suffixes ≤14 chars each — could be numbers, paths, status), m1Value/m2Value/m3Value (3 short metric values like "47ms" / "10x"), m1Label/m2Label/m3Label (3 uppercase 1-2 word labels like "P99 LATENCY"), iconSlug1..iconSlug4 (4 brand slugs), pageOf ("02 / 08").

CTA   cta-terminal-glow: brandTag (1-2 uppercase words like "WRAP"), handle, intro (3-6 italic-serif words like "now go ship faster"), ctaLine1 (2-4 bold Inter words like "Save this"), ctaAccent (1-2 mint-green words like "shell stack"), ctaItalic (1-3 italic Fraunces words like "for tomorrow"), recapLabel (uppercase 2-3 words like "FULL STACK"), iconSlug1..iconSlug6 (6 brand slugs), ctaBody (1-2 sentences ≤30 words with 1 <em>...</em>), btnPrimary (2-3 word primary CTA like "Bookmark Now"), btnGhost (2-3 word secondary like "Follow @kernelhq"), signoff (3-6 italic words like "ship fast, debug faster"), pageOf ("08 / 08").`,

  "mag-editorial": `Layouts (warm off-white #fafaf7 + Playfair Display serif + amber #d4870f accent + horizontal-rule structure + editorial magazine aesthetic — New Yorker / Bloomberg Businessweek style, journalistic, authoritative, typographically rich).

COVER cover-mag-editorial: brandTag (1-2 uppercase words like "THE BRIEF" / "DEEP DIVE" / "FOUNDER NOTES"), issueLine (e.g. "Issue 03 · 2026"), handle ("@authorhandle"), eyebrow (3-6 UPPERCASE letter-spaced words like "WHAT NOBODY TELLS YOU ABOUT"), headLine1 (1-3 Playfair bold words like "Building"), headAccent (1-2 italic amber words like "profitable"), headLine2 (1-3 words completing the headline like "products alone"), subtitle (10-16 word Playfair italic sentence describing the theme), previewLabel (uppercase 2-3 words like "INSIDE THIS ISSUE" / "IN THIS ESSAY"), preview1 (5-9 italic words teasing the first key point, e.g. "How I cut burn rate by 3×"), preview2 (5-9 italic words teasing the second key point), preview3 (5-9 italic words teasing the third key point), avatarLetter (single uppercase initial), authorName (full name like "Jordan Marks"), authorRole (3-6 word role like "indie founder · 5 products shipped"), tag1 (1-2 uppercase topic chips like "FOUNDER"), tag2 (1-2 uppercase topic chips like "2026"), swipeLabel (2-4 italic-serif words like "Read the issue"), pageOf ("01 / 07").

BODY  body-mag-editorial: numLabel ("02"-"07"), sectionLabel (uppercase mono 2-3 words like "THE FRAMEWORK" / "CASE STUDY"), handle, title (2-4 Playfair italic words like "Ship fast"), titleAccent (1-2 amber italic words like "then fix later"), subtitle (1 sentence ≤20 words italic context), insight1Title/insight2Title/insight3Title (3 short italic Playfair insight headlines 3-6 words each — the 3 key points of this slide), insight1Body/insight2Body/insight3Body (3 single-sentence descriptions ≤18 words each — tactical, specific, expands on the insight title), pullQuote (1 punchy Playfair italic quote ≤22 words — the slide's most quotable line), pullSpeaker (short attribution 2-5 words like "—Jordan, 90 days in"), m1Value/m2Value/m3Value (3 short metric strings like "47%" / "3×" / "Day 90"), m1Label/m2Label/m3Label (3 uppercase 2-3 word labels), iconSlug1..iconSlug4 (4 brand slugs), pageOf ("02 / 07").

CTA   cta-mag-editorial: brandTag (1-2 uppercase words like "FIN" / "WRAP"), handle, eyebrow (1-3 Playfair italic words like "Take this with you" / "A final note"), ctaLine1 (1-2 Playfair italic bold words like "Save"), ctaAccent (1-2 amber italic words like "this essay"), ctaItalic (1-2 italic words like "for later"), recapLabel (uppercase 2-3 words like "COVERED TODAY"), iconSlug1..iconSlug4 (4 brand slugs), ctaBody (1-2 italic sentences ≤30 words with 1 <em>...</em>), btnPrimary (2-3 word CTA like "Save Post"), btnGhost (italic 2-3 word secondary like "Follow along"), signoff (Playfair italic 3-5 word signoff like "more essays weekly"), pageOf ("07 / 07").`,

  "swiss-grid": `Layouts (warm off-white #f0ede8 + Inter 900 UPPERCASE typography + blood-red #d62828 accent + horizontal rules + full-height red left panel — Swiss International Style / Massimo Vignelli / IBM poster aesthetic, pure typographic design, zero decoration).

COVER cover-swiss-grid: brandTag (1-2 UPPERCASE words like "THE LIST" / "GRID REVIEW"), issueMeta (e.g. "Issue 01 / 2026"), handle, heroNum (single digit like "5" or "6" — goes in the big red left panel), countLabel (uppercase 1-2 words below number like "TOOLS" / "STEPS"), eyebrow (2-4 UPPERCASE words like "FOR SOLO FOUNDERS"), titleLine1 (1-3 ALL CAPS Inter words like "TOOLS THAT"), titleAccent (1-2 ALL CAPS red words like "SHIP"), titleLine2 (0-2 ALL CAPS words like "PRODUCT"), subtitle (Playfair italic 12-18 words — calm, authoritative statement about the topic), authorName (full name UPPERCASE like "ANNA PARK"), authorRole (3-5 word lowercase role like "product engineer · 2026"), tag1 (uppercase 1-2 words like "AI"), tag2 (uppercase 1-2 words like "DEVOPS"), tag3 (uppercase 1-2 words like "2026"), pageOf ("01 / 07").

BODY  body-swiss-grid: numLabel ("01"-"06"), sectionLabel (UPPERCASE 2-3 words like "THE STACK" / "THE MOVE"), handle, title (1-3 ALL CAPS Inter words like "AUTOMATE"), titleAccent (1-2 ALL CAPS red words like "EVERYTHING"), subtitle (Playfair italic ≤18 words — the slide's core proposition), bodyText (3-4 sentences ≤55 words — direct, precise engineering/founder voice), calloutLabel (uppercase 2-3 words like "KEY INSIGHT"), calloutBody (Playfair italic 1 sentence ≤20 words — the most important line in the slide), m1Value/m2Value/m3Value (3 short metric strings like "10×" / "$0" / "48h"), m1Label/m2Label/m3Label (3 uppercase 1-2 word labels), iconSlug1..iconSlug4 (4 brand slugs), pageOf ("02 / 07").

CTA   cta-swiss-grid: brandTag (1-2 UPPERCASE words like "OVER"), handle, eyebrow (2-3 UPPERCASE words like "YOUR TURN"), ctaStamp (1-2 ALL CAPS words for the red left panel like "SAVE" / "ACT"), ctaLine1 (1-3 ALL CAPS Inter words like "PICK"), ctaAccent (1-2 ALL CAPS red words like "ONE TOOL"), recapLabel (Playfair italic 2-3 words like "the full list"), iconSlug1..iconSlug4 (4 brand slugs), ctaBody (Playfair italic 1-2 sentences ≤30 words with 1 <em>...</em>), btnPrimary (2-3 word UPPERCASE CTA like "SAVE THIS"), btnGhost (Playfair italic 2-3 words like "Follow along"), signoff (Playfair italic 3-5 word signoff), pageOf ("07 / 07").`,

  "neon-cyber": `Layouts (near-black #04040c + violet #7c4dff + cyan #00e5ff + orange #ff6d00 multi-color neon glows + Space Grotesk 800 headlines + JetBrains Mono data chrome + glassmorphism data pods — cyberpunk data-dashboard aesthetic, distinct from terminal-glow which is monochrome mint; this family uses three vivid neon colors and "data pod" cards instead of terminal windows).

Uses iconSlug<N> brand-icon system (compose.js auto-renders SVG + brand color). Pass lowercase slugs.

COVER cover-neon-cyber: brandTag (1-2 UPPERCASE words like "CYBER" / "DATA STACK"), handle (e.g. "@neondev"), terminalTag (faux file path like "~/tools/2026" or "data-ops.sys"), termHighlight (the highlighted suffix ≤16 chars like "47 tools found"), eyebrow (UPPERCASE 3-5 words like "THE DATA TOOLS FOR"), headLine1 (2-3 Space Grotesk words like "The 7"), headAccent (1-2 cyan-neon words like "cyber tools"), headItalic (1-3 smaller violet-italic words like "running in prod"), subtitle (1-2 sentences ≤28 words with 1 <em>...</em> — what makes these special), stat1V..stat4V (4 short metric values like "47×" / "0ms" / "$0" / "10k"), stat1L..stat4L (4 short uppercase labels 1-2 words each), iconSlug1..iconSlug5 (5 brand slugs), swipeLabel (1-2 words like "DIVE IN"), pageOf ("01 / 08").

BODY  body-neon-cyber: numLabel (uppercase like "02"), sectionLabel (uppercase mono 2-3 words like "DATA TOOL 02"), handle, title (2-4 Space Grotesk words like "Pipe everything"), titleAccent (1-2 cyan words like "through AI"), subtitle (1 sentence ≤22 words with 1 <em>...</em>), pod1Label/pod2Label/pod3Label (3 uppercase short labels — pod1 is violet, pod2 is cyan, pod3 is orange — e.g. "INTEGRATION" / "PERFORMANCE" / "COST"), pod1Title/pod2Title/pod3Title (3 short bold pod headlines 3-6 words each), pod1Body/pod2Body/pod3Body (3 single-sentence pod descriptions ≤16 words each with optional <em>), pod1Metric/pod2Metric/pod3Metric (3 short metric strings like "47ms" / "10× faster" / "$0/mo"), iconSlug1..iconSlug4 (4 brand slugs), pageOf ("02 / 08").

CTA   cta-neon-cyber: brandTag (1-2 UPPERCASE words like "WRAP"), handle, eyebrow (UPPERCASE 2-4 words like "YOUR MOVE"), ctaLine1 (2-4 Space Grotesk words like "Save this"), ctaAccent (1-2 cyan-neon words like "stack"), ctaOrange (1-2 orange words like "now"), recapLabel (uppercase 2-3 words like "FULL STACK"), iconSlug1..iconSlug6 (6 brand slugs recap chips inside pill), ctaBody (1-2 sentences ≤30 words with 1 <em>...</em>), btnPrimary (2-3 word CTA like "Bookmark Now"), btnGhost (2-3 word secondary like "Follow Along"), iconSlug7/iconSlug8 (2 additional brand slugs for bottom strip), pageOf ("08 / 08").`,

  "personal-essay": `Layouts (warm cream #faf6ed paper + huge Fraunces serif ITALIC headlines + coral #d97757 accent with translucent highlighter underline + Caveat handwritten cursive for annotations and section labels + sticky-note + author-card chrome — editorial/personal-blog/founder-essay aesthetic, like Greg Isenberg's design carousels — first-person, conversational, opinionated copy).

Uses iconSlug<N> brand-icon system (compose.js auto-renders SVG + brand color).

COVER cover-personal-essay: brandTag (1-2 uppercase words like "ESSAY" / "TAKES"), handle (e.g. "@gregisenberg-clone"), eyebrow (3-7 italic-serif intro words like "the only AI tools that"), titleLine1 (1-3 bold-italic Fraunces words like "we built"), titleUnderline (1-2 highlighted-italic words like "the same"), titleAccent (1-2 coral-italic Fraunces words like "product twice"), avatarLetter (single uppercase initial like "G" / "A" / "S"), byLine (cursive Caveat 2-3 words like "by the way" / "from the trenches"), authorName (full name like "Greg Isenberg" / "Anna Park"), authorRole (3-6 word role like "founder · late-night writer"), stickyNote (cursive sticky-note 6-12 words like "here's exactly what I did (and broke)"), intro (1-2 sentences ≤30 words conversational context with 1 <em>...</em>), tile1Label..tile4Label (4 short 1-3 word labels for preview tiles like "Cursor" / "Stripe" / "Linear"), iconSlug1..iconSlug4 (4 brand slugs matching the tile labels), swipeLabel (cursive 2-4 words like "let's go"), pageOf ("01 / 08").

BODY  body-personal-essay: numLabel (uppercase short like "STORY 02"), handle, sectionLabel (cursive Caveat 2-4 words like "what I learned" / "the real cost"), title (2-4 italic Fraunces words like "Sales come"), titleUnderline (1-2 highlighted-italic words like "from speed"), titleAccent (1-2 coral-italic words like "not features"), subtitle (1 sentence ≤22 words italic-serif context), insight1Title/insight2Title/insight3Title (3 italic Fraunces insight headlines 4-8 words each with 1 <em>...</em> optional), insight1Body/insight2Body/insight3Body (3 single-sentence ≤16 word descriptions), insight1Tag/insight2Tag/insight3Tag (3 short uppercase tags 3-6 chars like "WIN" / "FAIL" / "AHA"), insight1Note/insight2Note/insight3Note (3 short Caveat doodle annotations 2-5 words like "this surprised me"), insight1Pill/insight2Pill/insight3Pill (3 short uppercase mono pills 1-3 words like "+34% MRR" / "DAY 12"), avatarLetter (single uppercase initial), authorQuote (1 italic-serif first-person quote ≤20 words with 1 <em>...</em>), iconSlug1..iconSlug4 (4 brand slugs), pageOf ("02 / 08").

CTA   cta-personal-essay: brandTag (1-2 uppercase words like "OUTRO" / "WRAP"), handle, eyebrow (cursive Caveat 2-4 words like "if this helped you"), ctaLine1 (1-3 bold-italic Fraunces words like "save this"), ctaAccent (1-2 coral-italic words like "for later"), ctaItalic (1-3 italic Fraunces words like "or send to a friend"), recapLabel (cursive 2-3 words like "the cast"), iconSlug1..iconSlug6 (6 brand slugs), ctaBody (1-2 italic-serif sentences ≤30 words first-person with 1 <em>...</em>), btnPrimary (2-3 word primary CTA like "Save Post"), btnGhost (italic 2-3 word secondary like "follow for more"), signoff (cursive 3-6 word signoff like "more next week ✱"), pageOf ("08 / 08").`,
};

const PROMPT_TEMPLATE = (brief, family) => `You are a carousel planner.
${FAMILY_PROMPTS[family]}

BRIEF: ${brief}

${(() => {
  const lay = FAMILY_LAYOUTS[family];
  const bodies = Array.isArray(lay.body) ? lay.body : [lay.body];
  // If multiple body variants, rotate through them for structural variety
  const bodySchema = (i) => `    {"layoutId":"${bodies[i % bodies.length]}","slots":{...}}`;
  return `Generate an 8-slide carousel: 1 cover + 6 body + 1 cta. Output ONLY valid JSON, no fences.${bodies.length > 1 ? `\nIMPORTANT: This family has ${bodies.length} body-slide variants (${bodies.join(", ")}). The schema below alternates between them — KEEP the layoutId values exactly as written so each slide gets a different visual layout.` : ""}
Schema:
{
  "id":"<short-kebab>",
  "brand":"<name>",
  "brief":"${brief}",
  "theme":"${family}",
  "slides":[
    {"layoutId":"${lay.cover}","slots":{...}},
${bodySchema(0)+","}
${bodySchema(1)+","}
${bodySchema(2)+","}
${bodySchema(3)+","}
${bodySchema(4)+","}
${bodySchema(5)+","}
    {"layoutId":"${lay.cta}","slots":{...}}
  ]
}`;
})()}`;

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

  // neon-dark (AI tools / creator productivity / cyberpunk tech)
  { id: "ai-tools-focus",           family: "neon-dark", text: "6 AI tools that replaced 12 apps for creators who ship daily content." },
  { id: "cursor-workflow",          family: "neon-dark", text: "The Cursor IDE workflow that makes me 5x faster — 6 habits that stuck." },
  { id: "prompt-engineering",       family: "neon-dark", text: "5 prompt engineering patterns that separate amateurs from pros in 2026." },
  { id: "build-in-public",          family: "neon-dark", text: "Why building in public compounded faster than ads — 6 lessons from 0 to 80K." },
  { id: "creator-os",               family: "neon-dark", text: "The creator OS that runs my 6-figure newsletter — tools, flows, nightly habits." },

  // terracotta (slow living / mindful entrepreneurship / earthy wellness)
  { id: "slow-growth",              family: "terracotta", text: "6 principles of slow growth — building a business that doesn't devour your life." },
  { id: "intentional-work",         family: "terracotta", text: "How I redesigned my workday around energy, not hours — 5 quiet shifts." },
  { id: "solopreneur-rituals",      family: "terracotta", text: "The 5 daily rituals that keep a solopreneur sane, solvent, and proud of their work." },
  { id: "creativity-unplugged",     family: "terracotta", text: "6 ways analog routines unlocked more creativity than any productivity app." },
  { id: "client-boundaries",        family: "terracotta", text: "5 healthy client boundaries every freelancer should set — and how to communicate them." },

  // coral-mag (marketing / brand strategy / bold editorial)
  { id: "hooks-that-convert",       family: "coral-mag", text: "6 opening hooks that stop the scroll — and the psychology behind each one." },
  { id: "brand-voice",              family: "coral-mag", text: "Why most brands sound the same — and 5 ways to develop a voice that sticks." },
  { id: "content-pillars",          family: "coral-mag", text: "How to build 5 content pillars that never run dry — the editorial approach." },
  { id: "agency-new-biz",           family: "coral-mag", text: "6 agency new-business tactics that filled our pipeline in 2026 without cold email." },
  { id: "visual-branding",          family: "coral-mag", text: "5 visual branding mistakes killing your first impression on social media." },

  // pastel-soft (personal growth / emotional wellbeing / gentle self-dev)
  { id: "anxiety-toolkit",          family: "pastel-soft", text: "6 evidence-based tools a therapist uses to quiet anxiety in under 5 minutes." },
  { id: "attachment-styles",        family: "pastel-soft", text: "The 4 attachment styles explained — and how to heal yours with daily practice." },
  { id: "self-compassion",          family: "pastel-soft", text: "5 self-compassion practices that replaced toxic positivity for good." },
  { id: "grief-and-growth",         family: "pastel-soft", text: "How grief becomes growth — 5 truths nobody tells you about healing." },
  { id: "nervous-system",           family: "pastel-soft", text: "6 ways to regulate your nervous system when everything feels like too much." },

  // dark-navy (B2B SaaS / engineering leadership / technical startup)
  { id: "zero-to-prod",             family: "dark-navy", text: "Zero to production in 7 days — the technical playbook for solo founders in 2026." },
  { id: "supabase-stack",           family: "dark-navy", text: "The Supabase + Next.js stack that powers 3 of my SaaS products — full breakdown." },
  { id: "api-design",               family: "dark-navy", text: "6 API design principles that made our integrations 10x easier to maintain." },
  { id: "eng-hiring-2026",          family: "dark-navy", text: "How we hire senior engineers in 2026 — no leetcode, 6 things we look for instead." },
  { id: "observability-stack",      family: "dark-navy", text: "The observability stack that cut our P99 latency by 40% — 6 tools, real numbers." },

  // cream-gold (luxury / wealth mindset / high-end consulting / finance)
  { id: "wealth-principles",        family: "cream-gold", text: "6 principles of quiet wealth — from people who built it once and kept it." },
  { id: "premium-pricing",          family: "cream-gold", text: "How I raised my consulting rate to $1,200/hour — 5 mindset shifts that made it possible." },
  { id: "long-game",                family: "cream-gold", text: "The long game: 6 compounding habits that separate 20-year careers from 2-year sprints." },
  { id: "legacy-thinking",          family: "cream-gold", text: "Legacy over virality — 5 things founders get wrong about building something lasting." },
  { id: "money-and-meaning",        family: "cream-gold", text: "How the wealthiest people I know think about money, meaning, and enough — 6 lessons." },

  // claude-target (Claude Code agent / sales / founder ref: 300k_Sales_team)
  { id: "claude-replaces-sales",    family: "claude-target", text: "I replaced a $300K Sales Team with Claude Code — here's the exact stack." },
  { id: "claude-replaces-cs",       family: "claude-target", text: "I replaced our $120K customer-support tier with 3 Claude agents — full breakdown." },
  { id: "claude-replaces-recruiter",family: "claude-target", text: "How I built a $90K recruiter with Claude Code in a weekend. ICP → outreach → loop." },
  { id: "claude-replaces-bizdev",   family: "claude-target", text: "Killing my $5K/mo agency retainer with a Claude Code BD agent. 3 tools, one prompt." },
  { id: "claude-replaces-research", family: "claude-target", text: "I built a Claude Code research analyst that beat my $8K/mo consultant. Here's how." },

  // black-mindmap (mind-map carousel ref: 4_pillars_agents)
  { id: "4-pillars-prompts",        family: "black-mindmap", text: "The 4 pillars of a great prompt — what kills outputs vs what makes them sing." },
  { id: "4-pillars-agents",         family: "black-mindmap", text: "The 4 pillars of production-ready AI agents (prompt, tools, memory, eval)." },
  { id: "4-pillars-rag",            family: "black-mindmap", text: "The 4 pillars of a RAG system that doesn't hallucinate. Chunking → retrieval → rerank → cite." },
  { id: "4-pillars-evals",          family: "black-mindmap", text: "The 4 pillars of AI evals every shipping team needs — tests, traces, scorers, drift." },
  { id: "4-pillars-context",        family: "black-mindmap", text: "The 4 pillars of context engineering — what you load, when, in what order, and why." },

  // grid-italic (light grid + serif italic + claude starburst ref: bad_good_great + claude_folder_structure)
  { id: "bad-good-great-prompts",   family: "grid-italic", text: "Bad vs Good vs Great prompts — what changes as you climb each tier." },
  { id: "bad-good-great-agents",    family: "grid-italic", text: "Bad vs Good vs Great agents — observability, evals, fallbacks compared side by side." },
  { id: "bad-good-great-pricing",   family: "grid-italic", text: "Bad vs Good vs Great pricing — 6 patterns that separate $99 from $9,900 offers." },
  { id: "bad-good-great-hooks",     family: "grid-italic", text: "Bad vs Good vs Great hooks — the 6 patterns top creators use to stop the scroll." },
  { id: "bad-good-great-cold-emails",family: "grid-italic", text: "Bad vs Good vs Great cold emails — same intent, three radically different replies." },

  // second-brain (cream + connected nodes + folder graphic ref: second_brain)
  { id: "second-brain-3-folders",   family: "second-brain", text: "I built my Second Brain with 3 folders. It's not an app. It's just folders." },
  { id: "claude-stack-folders",     family: "second-brain", text: "The Claude Code folder structure that runs my whole business — agents, hooks, skills." },
  { id: "research-os-folders",      family: "second-brain", text: "My research OS: raw + wiki + outputs. How I turn 100 inputs into one good idea/week." },
  { id: "writing-os-folders",       family: "second-brain", text: "The writing OS that ships me a newsletter every Friday — 3 folders, one Claude command." },
  { id: "pkm-without-apps",         family: "second-brain", text: "PKM without apps: 3 folders, 2 commands, and a Claude skill that does the rest." },

  // mono-pattern (mono caps + orange + black callout ref: multi_agent_patterns)
  { id: "multi-agent-patterns",     family: "mono-pattern", text: "The 8 multi-agent patterns every AI builder needs — supervisor, swarm, feedback loop, more." },
  { id: "agent-failure-modes",      family: "mono-pattern", text: "The 7 failure modes of AI agents in production — and the playbook to detect each one." },
  { id: "claude-code-patterns",     family: "mono-pattern", text: "8 Claude Code patterns that separate hobbyists from operators — concrete examples each." },
  { id: "eval-patterns",            family: "mono-pattern", text: "The 6 eval patterns that catch AI regressions before customers do — with thresholds." },
  { id: "memory-patterns",          family: "mono-pattern", text: "The 5 memory patterns for AI agents — when to use vector, kv, episodic, or none at all." },

  // rounded-card (black outlined card + orange badge ref: how to grow like a 20-person team)
  { id: "grow-like-20-person-team", family: "rounded-card", text: "How to grow like a 20-person team — 10 systems that make 1 founder feel like 20." },
  { id: "distribution-stack",       family: "rounded-card", text: "The distribution stack that takes one essay and ships it to Instagram, YouTube, TikTok, LinkedIn." },
  { id: "ship-like-meta",           family: "rounded-card", text: "How a solo founder ships like a Meta team — 8 internal tools every operator should clone." },
  { id: "one-person-newsletter",    family: "rounded-card", text: "The one-person newsletter stack pulling $40K/mo. 8 tools, 4 channels, zero employees." },
  { id: "founder-distribution",     family: "rounded-card", text: "Founder distribution: how I turn 1 carousel into 12 assets across 4 platforms — automated." },

  // dark-blob (Figma-derived: bold sans + colored blob — works for creator/founder/AI)
  { id: "dark-blob-stop-procrast",  family: "dark-blob",     text: "Stop procrastinating on the project that actually matters — 6 systems that compound." },
  { id: "dark-blob-ai-myth",        family: "dark-blob",     text: "5 myths about AI replacing your job that founders need to stop believing." },
  { id: "dark-blob-niche-down",     family: "dark-blob",     text: "How niching down took me from $2K to $40K/mo — 6 lessons from the pivot." },
  { id: "dark-blob-content-loop",   family: "dark-blob",     text: "The content loop that grew my X account to 50K in 90 days — 6 tactical moves." },
  { id: "dark-blob-saas-killers",   family: "dark-blob",     text: "6 SaaS-killing AI products you can ship as a solo founder in a weekend." },

  // mint-condensed (clean serif-condensed wellness/guide style)
  { id: "mint-deep-work",           family: "mint-condensed", text: "The ultimate guide to deep work — 6 protocols that quadrupled my output." },
  { id: "mint-creator-os",          family: "mint-condensed", text: "The ultimate guide to a creator OS — 6 systems running my newsletter business." },
  { id: "mint-cold-outreach",       family: "mint-condensed", text: "The ultimate guide to cold outreach in 2026 — 6 frameworks that book meetings." },
  { id: "mint-hiring-first",        family: "mint-condensed", text: "The ultimate guide to your first hire — 6 lessons from 50 founder interviews." },
  { id: "mint-product-launch",      family: "mint-condensed", text: "The ultimate guide to product launches — 6 channels that move the needle." },

  // cream-best (best-of listicle, cream + black + orange)
  { id: "cream-best-design-tools",  family: "cream-best",     text: "The 6 best design tools for indie founders in 2026 — what each one wins at." },
  { id: "cream-best-newsletter",    family: "cream-best",     text: "The 6 best newsletter platforms for paid creators — pricing, features, real revenue." },
  { id: "cream-best-no-code",       family: "cream-best",     text: "The 6 best no-code tools running 7-figure businesses — concrete examples." },
  { id: "cream-best-fonts-2026",    family: "cream-best",     text: "The 6 best fonts for product UI in 2026 — pairing, performance, and licenses." },
  { id: "cream-best-icons",         family: "cream-best",     text: "The 6 best icon libraries every designer should have bookmarked." },

  // black-warning (italic serif + red — high-stakes warnings)
  { id: "warn-mistakes-design",     family: "black-warning",  text: "Stop ignoring these 6 mistakes silently killing your product's conversion rate." },
  { id: "warn-burnout-signs",       family: "black-warning",  text: "5 burnout warning signs every founder ignores until it's too late." },
  { id: "warn-startup-killers",     family: "black-warning",  text: "6 quiet decisions that kill startups — and the founders that survived each one." },
  { id: "warn-bad-hires",           family: "black-warning",  text: "5 red flags in your first 10 hires that will haunt you for 3 years." },
  { id: "warn-bad-investors",       family: "black-warning",  text: "6 investor red flags founders learn the hard way — avoid these at all costs." },

  // cream-3d (warm cream + 3D orb illustration)
  { id: "cream3d-money-printer",    family: "cream-3d",       text: "Turn your website into a money printer — 6 conversion patterns that pay you while you sleep." },
  { id: "cream3d-build-trust",      family: "cream-3d",       text: "How to build trust with your audience in 90 days — 5 quiet rituals that compound." },
  { id: "cream3d-side-income",      family: "cream-3d",       text: "6 side-income streams a solo founder can ship in a weekend — real numbers." },
  { id: "cream3d-rich-mindset",     family: "cream-3d",       text: "The 6 mindset shifts that separate people who get rich from people who stay broke." },
  { id: "cream3d-investing-101",    family: "cream-3d",       text: "Investing 101 for creators — 6 boring habits that built my $500K portfolio." },

  // typo-sample (cormorant italic — typography/design content)
  { id: "typo-fonts-pairing",       family: "typo-sample",    text: "Stop pairing fonts wrong — 6 rules typographers use to make any combo work." },
  { id: "typo-tutorial-display",    family: "typo-sample",    text: "The ultimate guide to display type — 6 rules that make headlines unforgettable." },
  { id: "typo-readability",         family: "typo-sample",    text: "5 readability rules every designer breaks — and what to do instead in 2026." },
  { id: "typo-brand-voice",         family: "typo-sample",    text: "Your typography is your brand voice — 6 examples of brands getting it right." },
  { id: "typo-typeface-history",    family: "typo-sample",    text: "6 typefaces with stories so good you'll use them on purpose for the rest of your life." },

  // data-table (stats/data driven)
  { id: "data-channel-mix",         family: "data-table",     text: "The channel mix that scaled us to $1M ARR — real ROI numbers per channel." },
  { id: "data-engagement-bench",    family: "data-table",     text: "Engagement benchmarks for 2026 — what good, average, and trash actually look like." },
  { id: "data-saas-metrics",        family: "data-table",     text: "The 6 SaaS metrics that actually predict survival — with industry medians." },
  { id: "data-cold-email-stats",    family: "data-table",     text: "Cold email open rates by 6 industries — what's working in 2026." },
  { id: "data-funnel-leaks",        family: "data-table",     text: "Where your funnel actually leaks — 6 conversion benchmarks by stage." },

  // tool-list (dark + 5 tools cover)
  { id: "tool-list-claude-stack",   family: "tool-list",      text: "The 5 Claude-powered tools I use every day to ship like a 10-person team." },
  { id: "tool-list-design-stack",   family: "tool-list",      text: "The 5-tool design stack that produced our entire brand identity in a weekend." },
  { id: "tool-list-newsletter-stk", family: "tool-list",      text: "The 5-tool newsletter stack pulling $40K/mo on autopilot — names and prices." },
  { id: "tool-list-research-stk",   family: "tool-list",      text: "The 5-tool research stack that lets a solo founder out-think a 20-person team." },
  { id: "tool-list-ai-video",       family: "tool-list",      text: "The 5 AI video tools that replaced my $5K/mo video agency — full breakdown." },

  // flowchart (diagram/system)
  { id: "flow-funnel-flow",         family: "flowchart",      text: "The 4-step funnel that turns cold traffic into recurring revenue — full diagram." },
  { id: "flow-hiring-pipeline",     family: "flowchart",      text: "The hiring pipeline that filled 6 roles in 30 days — every step diagrammed." },
  { id: "flow-content-flywheel",    family: "flowchart",      text: "The content flywheel that compounds — 4 stages, every step diagrammed." },
  { id: "flow-onboarding-system",   family: "flowchart",      text: "The customer onboarding flow that cut our churn in half — every node mapped." },
  { id: "flow-launch-checklist",    family: "flowchart",      text: "Our 4-stage launch system that consistently hits #1 of the day — visual flowchart." },

  // design-tile (colored palette grid)
  { id: "tile-color-palettes",      family: "design-tile",    text: "6 brand color palettes that print money in 2026 — real brands using each." },
  { id: "tile-design-systems",      family: "design-tile",    text: "6 design system principles every product team should steal — with examples." },
  { id: "tile-ui-patterns",         family: "design-tile",    text: "6 UI patterns separating premium apps from amateur ones — side-by-side analysis." },
  { id: "tile-brand-archetypes",    family: "design-tile",    text: "The 6 brand archetypes — pick yours and 90% of design decisions get easier." },
  { id: "tile-typography-systems",  family: "design-tile",    text: "6 typography systems for SaaS — pairings, hierarchies, and license costs." },

  // agent-lineup (AI agent system showcase, dark theme + brand icons + tech stack)
  { id: "agent-sales-system",       family: "agent-lineup",   text: "My 5-agent sales system that replaced a $300K rep — Apollo, Claude, Airtable, Calendly, Stripe." },
  { id: "agent-marketing-system",   family: "agent-lineup",   text: "The 6-agent marketing OS that runs my entire content engine — n8n, Claude, Notion, TikTok, LinkedIn." },
  { id: "agent-support-system",     family: "agent-lineup",   text: "My 4-agent support stack: tickets, replies, escalation, CSAT — Claude, Notion, Gmail, Slack." },
  { id: "agent-research-system",    family: "agent-lineup",   text: "How I built a 5-agent research analyst — Perplexity, Claude, Notion, Airtable, OpenAI." },
  { id: "agent-content-system",     family: "agent-lineup",   text: "The content factory: 6 agents from idea to publish — n8n, Claude, Figma, Notion, LinkedIn, YouTube." },

  // stack-tour (light tech stack showcase, 6-tool tour)
  { id: "stack-solo-saas",          family: "stack-tour",     text: "The 6-tool stack running my one-person SaaS — exact costs and what each one does." },
  { id: "stack-newsletter-40k",     family: "stack-tour",     text: "The 6 tools running my $40K/mo newsletter — writing, sending, payments, the works." },
  { id: "stack-indie-agency",       family: "stack-tour",     text: "The 6-tool indie agency stack — pitch to delivery, no team needed." },
  { id: "stack-ai-builder",         family: "stack-tour",     text: "My 6-tool AI builder stack — from prompt to production in a weekend." },
  { id: "stack-creator-os",         family: "stack-tour",     text: "The 6-tool creator OS — recording, editing, scheduling, analytics, all in sync." },

  // before-after (light X-vs-✓ workflow comparison with brand stack)
  { id: "ba-cold-email-ai",         family: "before-after",   text: "Cold email before vs after Claude — reply rates, costs, and the exact stack." },
  { id: "ba-support-ai",            family: "before-after",   text: "Customer support before vs after AI — ticket time dropped from hours to minutes." },
  { id: "ba-hiring-ai",             family: "before-after",   text: "Hiring funnel before vs after AI — 200 applicants, same quality, no recruiter." },
  { id: "ba-content-ai",            family: "before-after",   text: "Content production before vs after AI — one writer ships 30 pieces a week." },
  { id: "ba-lead-gen-ai",           family: "before-after",   text: "Lead gen before vs after AI agents — pipeline doubled, CAC cut in half." },

  // dark-pill-glow (premium dev-tool aesthetic — dark + glowing pill)
  { id: "dpg-self-hosted-analytics",  family: "dark-pill-glow", text: "7 self-hosted analytics tools that beat the big SaaS dashboards." },
  { id: "dpg-keyboard-apps",          family: "dark-pill-glow", text: "6 keyboard-first apps that quietly replaced my mouse." },
  { id: "dpg-privacy-first-tools",    family: "dark-pill-glow", text: "5 privacy-first product tools that don't sell your usage data." },
  { id: "dpg-tiny-cli-stack",         family: "dark-pill-glow", text: "The 7-CLI stack a senior engineer actually uses every day." },
  { id: "dpg-monitoring-no-bs",       family: "dark-pill-glow", text: "Monitoring without the bullshit — 6 tools real SREs swear by." },

  // shout-orange (loud takes, contrarian dev/tool opinions)
  { id: "so-cloud-bill",              family: "shout-orange", text: "Your cloud bill is a vibe tax — 6 ways to cut it in half this quarter." },
  { id: "so-stop-microservices",      family: "shout-orange", text: "Stop splitting things into microservices until you have a real reason." },
  { id: "so-dx-is-everything",        family: "shout-orange", text: "Developer experience is the only real moat — 6 takes on why DX wins." },
  { id: "so-saas-is-bloated",        family: "shout-orange", text: "Most SaaS is bloated by design — 6 lean alternatives that just do one thing." },
  { id: "so-resume-tools",            family: "shout-orange", text: "Your resume is a tool, not a memoir — 6 patterns that get callbacks." },

  // leak-dark (tech launches, infra shipped, new releases)
  { id: "ld-edge-runtimes-2026",      family: "leak-dark", text: "6 edge runtimes that shipped real production wins in 2026." },
  { id: "ld-vector-db-cliffnotes",    family: "leak-dark", text: "Pick your vector DB in 60 seconds — 6 options compared on real workloads." },
  { id: "ld-observability-2026",      family: "leak-dark", text: "Observability stack that actually catches incidents — 6 tools, real config." },
  { id: "ld-llm-serving",             family: "leak-dark", text: "LLM serving without the GPU rental tax — 6 patterns running in prod." },
  { id: "ld-data-pipelines",          family: "leak-dark", text: "Data pipelines for one-person teams — 6 setups that scale to billions of rows." },

  // cream-claude (warm editorial, dev-focused listicles)
  { id: "cc-shipping-principles",     family: "cream-claude", text: "6 shipping principles I stole from teams that release every day." },
  { id: "cc-rest-vs-rpc",             family: "cream-claude", text: "REST vs RPC vs GraphQL — 6 calls real backend engineers make on real APIs." },
  { id: "cc-test-pyramid",            family: "cream-claude", text: "The test pyramid is dead — 6 patterns that replace it for modern stacks." },
  { id: "cc-readme-craft",            family: "cream-claude", text: "A great README is a hiring tool — 6 patterns OSS maintainers swear by." },
  { id: "cc-internal-tooling",        family: "cream-claude", text: "6 internal tools every fast-shipping team builds before raising a seed round." },

  // tech-stack-grid (pure brand-logo focused stack tours)
  { id: "tsg-indie-dev-stack",        family: "tech-stack-grid", text: "The 6-tool indie dev stack — from idea to deploy in a weekend." },
  { id: "tsg-content-ops-stack",      family: "tech-stack-grid", text: "Content ops on autopilot — 6 tools that turn one idea into 50 posts." },
  { id: "tsg-ai-research-stack",      family: "tech-stack-grid", text: "AI research stack — 6 tools to triangulate truth before you publish." },
  { id: "tsg-data-engineering-stack", family: "tech-stack-grid", text: "Data engineering for solo founders — 6 tools that run a real warehouse." },
  { id: "tsg-customer-feedback-stack",family: "tech-stack-grid", text: "Customer feedback stack — 6 tools that close the loop between user and PR." },

  // lime-accent (numbered listicles, bright lime callout style — "N tools you need")
  { id: "la-vibe-code-tools",         family: "lime-accent", text: "9 free vibe-coding tools every indie dev quietly relies on in 2026." },
  { id: "la-llm-eval-tools",          family: "lime-accent", text: "7 LLM eval tools that find bugs before your users do." },
  { id: "la-prompt-frameworks",       family: "lime-accent", text: "6 prompt frameworks that 10x output across every model you use." },
  { id: "la-cursor-rules",            family: "lime-accent", text: "8 cursor rules that turn a code editor into a senior teammate." },
  { id: "la-self-host-2026",          family: "lime-accent", text: "10 self-hosted apps that replaced my $400/mo SaaS bill." },

  // pixel-block (retro pixel-block topic + dev listicle aesthetic)
  { id: "pb-github-repos",            family: "pixel-block", text: "9 GitHub repos serious devs star but rarely talk about." },
  { id: "pb-cli-tools",               family: "pixel-block", text: "7 CLI tools real engineers run every single day." },
  { id: "pb-react-libs",              family: "pixel-block", text: "8 React libs that quietly replaced expensive UI kits." },
  { id: "pb-debug-stack",             family: "pixel-block", text: "6 debugging tools that turn a 4-hour incident into 20 minutes." },
  { id: "pb-zero-cost-stack",         family: "pixel-block", text: "10 zero-cost dev tools that run a 7-figure indie product." },

  // cream-table (warm editorial, stacked icon rows with hard shadow Memphis style)
  { id: "ct-design-tools-2026",       family: "cream-table", text: "5 free design tools every solo founder uses to ship pixel-perfect UI." },
  { id: "ct-no-code-saas",            family: "cream-table", text: "5 no-code tools that run an entire SaaS without an engineer on staff." },
  { id: "ct-content-stack",           family: "cream-table", text: "5 content tools that quietly replaced a $5K/month creator agency." },
  { id: "ct-data-warehouse-stack",    family: "cream-table", text: "5 data tools that turn raw events into shipped product insights." },
  { id: "ct-ai-writing-stack",        family: "cream-table", text: "5 AI writing tools that out-write expensive copywriters every time." },

  // photo-tag (procedural photo bg + dark overlay + bold headline — magazine launch aesthetic)
  { id: "pt-ai-news-2026",            family: "photo-tag", text: "The AI launches you actually need to care about this week." },
  { id: "pt-cursor-power",            family: "photo-tag", text: "Cursor power features senior devs use that turn 8 hours into 90 minutes." },
  { id: "pt-edge-functions",          family: "photo-tag", text: "Edge functions changed how solo founders ship — 5 patterns that win." },
  { id: "pt-future-of-design",        family: "photo-tag", text: "The future of design tools — 5 launches reshaping product workflows." },
  { id: "pt-ai-agent-platforms",      family: "photo-tag", text: "5 AI agent platforms quietly running real business operations today." },

  // highlight-box (data-driven question + colored label box on key word)
  { id: "hb-internet-ai",             family: "highlight-box", text: "How much of the internet is written by AI in 2026 — 5 surprising data points." },
  { id: "hb-tools-replaced",          family: "highlight-box", text: "5 jobs AI quietly replaced in 2026 (and the tools that did it)." },
  { id: "hb-saas-margins",            family: "highlight-box", text: "Why SaaS gross margins are quietly dropping — 5 data points founders miss." },
  { id: "hb-time-to-first-byte",      family: "highlight-box", text: "5 frontend metrics that actually move conversion — with real benchmarks." },
  { id: "hb-burnout-stats",           family: "highlight-box", text: "5 data points proving senior engineers burn out twice as fast in 2026." },

  // stencil-stamp (chunky stencil-letter title + asterisks + structured body)
  { id: "ss-secret-skills",           family: "stencil-stamp", text: "5 secret IDE skills that turn average devs into senior shipping machines." },
  { id: "ss-prompt-frameworks",       family: "stencil-stamp", text: "5 prompt frameworks every AI builder needs in 2026 — with examples." },
  { id: "ss-shortcut-stack",          family: "stencil-stamp", text: "100 keyboard shortcuts every solo founder uses to save 10 hours a week." },
  { id: "ss-design-tricks",           family: "stencil-stamp", text: "5 design tricks pros use to make any landing page convert 2x harder." },
  { id: "ss-debug-secrets",           family: "stencil-stamp", text: "5 secret debugging moves senior devs use to crack incidents in minutes." },

  // edu-bright (educational ML/AI tutorial — multi-body variant family)
  { id: "eb-rag-techniques-2026",     family: "edu-bright", text: "5 RAG techniques actually shipping in production — with benchmarks and tradeoffs." },
  { id: "eb-agent-frameworks",        family: "edu-bright", text: "Top agent frameworks compared on speed, cost, and orchestration patterns." },
  { id: "eb-llm-eval-stack",          family: "edu-bright", text: "How to build an LLM eval stack — pipeline, metrics, and tools that actually catch drift." },
  { id: "eb-vector-db-comparison",    family: "edu-bright", text: "Vector DB showdown — 5 options compared on latency, cost, and indexing strategy." },
  { id: "eb-llm-fine-tuning",         family: "edu-bright", text: "5 fine-tuning techniques that beat prompting — benchmarks, costs, when to use each." },

  // terminal-glow (developer/CLI/devops aesthetic — JetBrains Mono + faux terminal windows)
  { id: "tg-shell-power-tips",        family: "terminal-glow", text: "5 shell tricks senior devs use daily — fzf, zoxide, eza, ripgrep, and bat." },
  { id: "tg-kubectl-shortcuts",       family: "terminal-glow", text: "Top kubectl shortcuts and plugins that turn 10-line commands into 3 keystrokes." },
  { id: "tg-git-deep-cuts",           family: "terminal-glow", text: "Git commands beyond commit/push — bisect, worktree, reflog, and how senior devs use them." },
  { id: "tg-docker-debug-loop",       family: "terminal-glow", text: "5 docker commands that cut your debug loop in half — exec, logs, diff, and friends." },
  { id: "tg-curl-cheatsheet",         family: "terminal-glow", text: "Curl beyond GET — auth headers, file upload, retries, and parallel requests in one tool." },

  // mag-editorial (New Yorker / Bloomberg Businessweek — Playfair serif + amber accent + horizontal rules)
  { id: "me-solo-founder-stack",      family: "mag-editorial", text: "The 6 tools a solo founder uses to ship like a funded team — no hires, no investors, no excuses." },
  { id: "me-ai-burnout-truth",        family: "mag-editorial", text: "AI didn't kill my job — it made me realize I hated my job. 6 reframes for technical founders." },
  { id: "me-pricing-power",           family: "mag-editorial", text: "6 pricing moves that quietly compounded my revenue while I stopped discounting." },
  { id: "me-reading-builds-edge",     family: "mag-editorial", text: "I read 52 books in 12 months as a founder. These 6 changed how I operate." },
  { id: "me-distribution-before-product", family: "mag-editorial", text: "Distribution before product — 6 founders who built an audience before writing a line of code." },

  // swiss-grid (Swiss International Style — Inter 900 UPPERCASE + red left panel + horizontal rules)
  { id: "sg-infra-stack-2026",        family: "swiss-grid", text: "6 infra tools every serious solo operator runs in 2026 — no bloat, no lock-in." },
  { id: "sg-prompt-engineering",      family: "swiss-grid", text: "5 prompt engineering patterns that separate working AI from impressive demos." },
  { id: "sg-startup-mistakes",        family: "swiss-grid", text: "6 startup mistakes every second-time founder never makes again." },
  { id: "sg-remote-tools",            family: "swiss-grid", text: "The 6 remote-work tools high-output teams quietly swear by in 2026." },
  { id: "sg-launch-checklist",        family: "swiss-grid", text: "The 6-step pre-launch checklist that cuts post-ship hotfixes by 80%." },

  // neon-cyber (multi-color neon + glassmorphism data pods — cyberpunk data-dashboard)
  { id: "nc-ai-ops-tools",            family: "neon-cyber", text: "7 AI ops tools that run production workflows while you sleep — real benchmarks, zero hype." },
  { id: "nc-vector-search-stack",     family: "neon-cyber", text: "The vector search stack that cut our query latency from 800ms to 12ms — 5 tools, real config." },
  { id: "nc-edge-ai-patterns",        family: "neon-cyber", text: "5 edge-AI patterns that run inference without a GPU rental bill." },
  { id: "nc-llm-routing-2026",        family: "neon-cyber", text: "LLM routing in 2026 — 5 strategies that 10× throughput and halve costs." },
  { id: "nc-realtime-pipelines",      family: "neon-cyber", text: "5 real-time data pipeline patterns that actually scale past 1M events per second." },

  // personal-essay (Greg Isenberg-style founder/operator essay — cream + serif italic + Caveat annotations)
  { id: "pe-vertical-ai-100m",        family: "personal-essay", text: "How to build the next $100M vertical-AI startup — what I learned shipping 5 in 18 months." },
  { id: "pe-built-twice",             family: "personal-essay", text: "We built the same product twice. The second version made 10x more. Here's why." },
  { id: "pe-startup-ideas-2026",      family: "personal-essay", text: "10 startup ideas hiding in plain sight in 2026 — what scrappy founders should build right now." },
  { id: "pe-ai-keeping-up",           family: "personal-essay", text: "12 things about AI that keep me up at night — and three I think most founders are missing." },
  { id: "pe-design-tools-review",     family: "personal-essay", text: "I tested every new AI design tool for 30 days. Three changed my workflow. The rest were noise." },

  // ── BATCH 2: tech stacks + clean design ────────────────────────────────────

  // tech-stack-grid (6-tool stack posters — dark bg + orange glow + brand icons)
  { id: "tsg-saas-starter-stack",     family: "tech-stack-grid", text: "The 6-tool SaaS starter stack in 2026 — from auth to payments to deploy in one weekend." },
  { id: "tsg-ai-native-startup",      family: "tech-stack-grid", text: "My complete AI-native startup stack: 6 tools that replaced an entire engineering team." },
  { id: "tsg-devops-10min-deploy",    family: "tech-stack-grid", text: "The devops stack that ships features to production in under 10 minutes — 6 tools, real config." },
  { id: "tsg-indie-hacker-prereqs",   family: "tech-stack-grid", text: "6 tools every indie hacker needs before writing a single line of code." },
  { id: "tsg-serverless-backend",     family: "tech-stack-grid", text: "The no-infrastructure backend stack: 6 serverless tools running $50K ARR businesses." },
  { id: "tsg-data-eng-2026",          family: "tech-stack-grid", text: "Data engineering in 2026: 6 tools that replace the old Kafka + Spark + Airflow nightmare." },
  { id: "tsg-b2b-sales-stack",        family: "tech-stack-grid", text: "The B2B SaaS stack that closes enterprise deals — 6 tools for sales, contracts, and billing." },
  { id: "tsg-solo-mobile-dev",        family: "tech-stack-grid", text: "6 tools I use to ship mobile apps as a solo web developer — no native knowledge required." },
  { id: "tsg-mlops-no-phd",           family: "tech-stack-grid", text: "The ML ops stack for teams that don't have ML engineers — 6 tools, zero PhD required." },
  { id: "tsg-creator-stack",          family: "tech-stack-grid", text: "The content creator tech stack: 6 tools that produce, schedule, and monetize automatically." },

  // stack-tour (per-tool deep dives — white bg + hero brand icon + checkmark bullets)
  { id: "st-cursor-deep-dive",        family: "stack-tour", text: "A deep dive into Cursor IDE: the AI code editor that replaced our entire code review process." },
  { id: "st-n8n-automation",          family: "stack-tour", text: "How we use n8n to automate 80% of our customer operations — 6 real workflows explained." },
  { id: "st-supabase-vs-firebase",    family: "stack-tour", text: "Supabase deep dive: why it replaced Firebase, Postgres, and half our backend — 5 real reasons." },
  { id: "st-linear-small-teams",      family: "stack-tour", text: "Linear for small teams: 5 workflows that cut sprint planning from 2 hours to 15 minutes." },
  { id: "st-vercel-power-features",   family: "stack-tour", text: "Vercel at scale: 5 features most developers miss that 10× deployment confidence." },
  { id: "st-claude-api-patterns",     family: "stack-tour", text: "Claude API in production: 5 patterns for building AI features that actually work at scale." },
  { id: "st-cf-workers-replace-node", family: "stack-tour", text: "Cloudflare Workers: 5 use cases that replaced our entire Node.js server infrastructure." },
  { id: "st-framer-vs-webflow",       family: "stack-tour", text: "Framer vs Webflow in 2026: 5 real projects that reveal exactly when to use each." },

  // agent-lineup (AI agent workflows — dark bg + brand logo flow + 4-icon cluster)
  { id: "al-support-agent",           family: "agent-lineup", text: "The customer support agent that handles 90% of tickets without a human — 5 AI tools wired together." },
  { id: "al-content-repurpose",       family: "agent-lineup", text: "The content repurposing agent: one blog post becomes 12 social assets automatically." },
  { id: "al-lead-scoring",            family: "agent-lineup", text: "The lead scoring agent: every inbound lead gets qualified and routed in under 60 seconds." },
  { id: "al-competitor-monitor",      family: "agent-lineup", text: "The competitive intelligence agent that monitors 50 competitors daily and sends a Slack digest." },
  { id: "al-outbound-sales",          family: "agent-lineup", text: "The outbound sales agent: ICP → prospect → personalized email → booked call, fully automated." },
  { id: "al-code-review-agent",       family: "agent-lineup", text: "The code review agent that catches bugs before your CI does — 4 tools, zero setup." },
  { id: "al-onboarding-agent",        family: "agent-lineup", text: "The onboarding agent: new user → product tour → success metric — all without a CSM." },
  { id: "al-social-reply-agent",      family: "agent-lineup", text: "The social media agent that monitors mentions, drafts replies, and schedules responses automatically." },

  // lime-accent (bold dark bg + bright lime callout box — tool listicles)
  { id: "la-oss-replaces-saas",       family: "lime-accent", text: "9 open-source tools that replaced $800/mo in SaaS subscriptions — all free, all production-ready." },
  { id: "la-free-ai-tools-2026",      family: "lime-accent", text: "7 free AI tools that give solo founders an unfair advantage in 2026." },
  { id: "la-claude-code-skills",      family: "lime-accent", text: "6 Claude Code skills every developer should master before Q3 2026." },
  { id: "la-cf-hidden-tools",         family: "lime-accent", text: "8 Cloudflare tools most developers don't know exist — all free tier, all production-grade." },
  { id: "la-postgres-superpowers",    family: "lime-accent", text: "7 database tools that make PostgreSQL feel like a superpower — extensions, clients, and ORMs." },
  { id: "la-monitoring-stack",        family: "lime-accent", text: "5 monitoring tools that catch production failures before your users do — free tier included." },

  // terminal-glow (mint-green terminal aesthetic — CLI tricks + devops)
  { id: "tg-git-aliases",             family: "terminal-glow", text: "5 git aliases that make senior engineers 3× faster — steal these commands today." },
  { id: "tg-shell-ide-setup",         family: "terminal-glow", text: "The shell setup that makes terminal feel like an IDE — 5 tools, 10 minutes to configure." },
  { id: "tg-cli-replaces-dashboard",  family: "terminal-glow", text: "6 CLI tools that replace half your DevOps dashboard — real commands, real output." },
  { id: "tg-docker-prod-commands",    family: "terminal-glow", text: "Docker in production: 5 commands that have saved us from 3am outages — memorize these." },
  { id: "tg-curl-advanced",           family: "terminal-glow", text: "5 curl tricks that replace 3 different API testing tools — auth, files, retries, parallelism." },
  { id: "tg-ai-terminal-2026",        family: "terminal-glow", text: "The AI-powered terminal setup in 2026 — 5 tools that autocomplete your entire workflow." },

  // cream-table (warm cream + orange + big icon rows — structured tool breakdowns)
  { id: "ct-ai-writing-tools",        family: "cream-table", text: "5 AI writing tools that are actually worth paying for in 2026 — honest breakdown, real ROI." },
  { id: "ct-no-code-saves-dev",       family: "cream-table", text: "6 no-code tools that replaced $2K/mo in developer costs for our startup." },
  { id: "ct-saas-analytics-stack",    family: "cream-table", text: "The 5 analytics tools that actually matter for a SaaS under $1M ARR — everything else is noise." },
  { id: "ct-startup-security",        family: "cream-table", text: "6 security tools every startup should run before their first enterprise deal." },
  { id: "ct-email-revenue-stack",     family: "cream-table", text: "5 email tools that print revenue — from capture to nurture to conversion, with real metrics." },
  { id: "ct-founder-productivity",    family: "cream-table", text: "The founder's productivity stack: 5 tools that buy back 10 hours every week." },

  // before-after (before vs after comparisons — light bg + blue/green accent)
  { id: "ba-cicd-overhaul",           family: "before-after", text: "How we went from 3-week deploys to daily shipping — before and after our CI/CD overhaul." },
  { id: "ba-support-response-time",   family: "before-after", text: "Our customer support went from 48-hour response to 4-minute resolution — the full stack change." },
  { id: "ba-notion-to-linear",        family: "before-after", text: "Before and after switching from Notion to Linear: what changed, what didn't, what we regret." },
  { id: "ba-aws-cost-cut",            family: "before-after", text: "How we cut our AWS bill by 70% without losing performance — before and after the migration." },
  { id: "ba-claude-code-adoption",    family: "before-after", text: "Before and after adopting Claude Code as our primary dev tool — 6 honest metrics, 90 days in." },
  { id: "ba-onboarding-activation",   family: "before-after", text: "Our onboarding activation went from 14% to 67% — the 5 changes that moved the needle." },

  // ─── Founder-focused: making money with AI, no hiring, no scale-fast (50) ─
  // mag-editorial (10) — premium editorial, founder mindset
  { id: "fdr-1m-solo",            family: "mag-editorial", text: "The unsexy truth about making your first $1M as a solo founder with AI. Quiet leverage, recurring revenue, business that prints money while you sleep. Lessons on pricing, niching, saying no to vanity metrics." },
  { id: "fdr-calm-over-growth",   family: "mag-editorial", text: "Why I chose calm over growth and so should you. Capping my AI business at $30k/month MRR instead of chasing $1M. The mental, financial, and lifestyle math of a calm business in 2026." },
  { id: "fdr-year-2-trap",        family: "mag-editorial", text: "Why most indie founders quit in year 2. The dip nobody warns you about: revenue stalls, burnout, comparison. How to push through to year 3 with AI leverage." },
  { id: "fdr-walking-from-exit",  family: "mag-editorial", text: "I walked away from a $5M exit. The lifestyle cost, the identity loss, what most founders don't realize about post-acquisition life. A meditation on enough." },
  { id: "fdr-money-vs-meaning",   family: "mag-editorial", text: "Money or meaning. You don't have to pick. How AI lets solo founders build things that pay AND matter without the venture capital trap." },
  { id: "fdr-audience-first",     family: "mag-editorial", text: "Audience first, product second. The new founder playbook. Why distribution is the moat in 2026 and how AI lets one person own a niche." },
  { id: "fdr-quiet-business",     family: "mag-editorial", text: "The quiet business that prints. No funding, no team, no fanfare. The one-person AI businesses making $500k+/yr in obscurity and how they do it." },
  { id: "fdr-overnight-myth",     family: "mag-editorial", text: "The myth of overnight success in AI. What every viral founder won't tell you about the three years before the spotlight. Patience, compounding, the boring middle." },
  { id: "fdr-second-act",         family: "mag-editorial", text: "Your second act with AI. For founders in their 30s and 40s feeling behind. Why AI is the great equalizer for the experienced and the patient." },
  { id: "fdr-money-mindset",      family: "mag-editorial", text: "Money mindset shifts every founder needs. From scarcity to leverage, hustle to compounding, selling time to selling outcomes. The AI-era reframes that change everything." },

  // personal-essay (8) — founder stories
  { id: "fdr-quit-9to5",          family: "personal-essay", text: "I quit my $200k job to build with AI. Six months later — the numbers, the lessons, the moments I wanted to crawl back. The honest middle of the founder journey." },
  { id: "fdr-one-product",        family: "personal-essay", text: "One product changed my life. Not a course, not a service — a $19 AI tool 12,000 people bought. The full breakdown of how it found its market." },
  { id: "fdr-vc-no-thanks",       family: "personal-essay", text: "I turned down VC money twice. The freedom math, the optionality cost, why most founders are sold a story about needing funding." },
  { id: "fdr-burnout-lesson",     family: "personal-essay", text: "What burnout taught me about money. The week I stopped working and my MRR went up. The leverage paradox every solo founder eventually meets." },
  { id: "fdr-niche-millionaire",  family: "personal-essay", text: "How a tiny niche made me rich. The 1,200-person market I built a $40k/month business in. Why niche is the new big in the AI era." },
  { id: "fdr-solo-not-lonely",    family: "personal-essay", text: "Solo doesn't mean lonely. Building a one-person business with AI agents as your team. The community, the freedom, the honest mental cost." },
  { id: "fdr-failed-5-startups",  family: "personal-essay", text: "I failed 5 startups before this one worked. What changed. The mindset shift, the constraint that unlocked focus, the AI leverage that finally made it inevitable." },
  { id: "fdr-midlife-pivot",      family: "personal-essay", text: "Pivoting to AI at 42. From corporate VP to indie founder. The lessons of starting over with everything you already know about the world." },

  // before-after (8) — transformations
  { id: "fdr-freelancer-to-agency", family: "before-after", text: "Freelancer at $80/hr to AI agency owner clearing $30k/month. The exact pricing shift, the productization, what AI replaced for me." },
  { id: "fdr-killed-ads",           family: "before-after", text: "I killed my $50k/month ad spend and grew faster. How AI content compounding replaced paid acquisition." },
  { id: "fdr-service-to-product",   family: "before-after", text: "Service business to AI product business. The 90-day pivot, the revenue dip, the unlock on the other side." },
  { id: "fdr-cold-email-ai",        family: "before-after", text: "Cold email before and after AI. Reply rates, deal flow, time per campaign. The exact workflow that 4x'd my pipeline." },
  { id: "fdr-newsletter-zero-50k",  family: "before-after", text: "Newsletter from 0 to 50,000 subscribers with AI. The compounding playbook, the topic shifts, the monetization at scale." },
  { id: "fdr-content-mill-engine",  family: "before-after", text: "From content mill to AI content engine. The transition from one post a week to twelve a day without losing voice." },
  { id: "fdr-sales-calls-ai",       family: "before-after", text: "Sales calls before and after AI agents. Show rates, close rates, hours per close. What automation actually does to a solo founder's funnel." },
  { id: "fdr-solopreneur-life",     family: "before-after", text: "Life before and after going solo with AI. Income, hours, stress, optionality. The honest math of choosing yourself." },

  // linkedin-pro (8) — founder-style posts
  { id: "fdr-ai-money-playbook",  family: "linkedin-pro", text: "The AI money playbook for solo founders. Six plays that print revenue without scaling a team — productized services, micro-SaaS, info products, AI-augmented agency, paid newsletter, prompt sets." },
  { id: "fdr-side-hustles-5k",    family: "linkedin-pro", text: "5 AI side hustles consistently making $5k a month in 2026. Concrete revenue models, time commitment per week, who the target customer is." },
  { id: "fdr-micro-saas-play",    family: "linkedin-pro", text: "The micro-SaaS with AI play. How solo founders are reaching $20k MRR with single-feature tools and tight niches — and what to avoid." },
  { id: "fdr-productized-pricing", family: "linkedin-pro", text: "Productized AI services pricing that converts. Why hourly is dead, what flat rates actually work, the retainer trap you should avoid." },
  { id: "fdr-selling-prompts",    family: "linkedin-pro", text: "Selling AI prompts and prompt packs as products. Pricing, packaging, where to sell, what actually moves units in 2026." },
  { id: "fdr-ai-affiliate",       family: "linkedin-pro", text: "AI affiliate marketing for beginners. The four affiliate programs solo founders are quietly making $5k/month from, and how they're driving traffic." },
  { id: "fdr-niche-newsletter",   family: "linkedin-pro", text: "The niche newsletter business plan. Topic selection, audience math, monetization stack, how to choose a niche AI can amplify." },
  { id: "fdr-agency-pricing",     family: "linkedin-pro", text: "AI agency pricing that actually works. Why $5k retainers beat $50/hr every time, and how to position your offer to land them." },

  // cream-table (6) — clean tables/lists
  { id: "fdr-tools-money",        family: "cream-table", text: "Eight AI tools founders use to print money. Each row: tool name, monthly cost, revenue use case, expected ROI window." },
  { id: "fdr-revenue-streams",    family: "cream-table", text: "Eight AI revenue streams ranked by effort versus payout. From easiest to hardest, what actually pays in 2026." },
  { id: "fdr-founder-os",         family: "cream-table", text: "The founder operating system. Eight daily tools for revenue, focus, and freedom — what each is for and how it pays back." },
  { id: "fdr-money-mistakes",     family: "cream-table", text: "Eight money mistakes solo founders make in year one. Each row: the mistake, the real cost, the simple fix." },
  { id: "fdr-content-types-sell", family: "cream-table", text: "Eight AI content formats that consistently sell. Format, time to create, conversion rate, what to charge for it." },
  { id: "fdr-product-types",      family: "cream-table", text: "Eight AI product types you can sell tomorrow. Product type, audience, price point, build time, where to launch first." },

  // beige-paper (5) — quiet editorial newsletter style
  { id: "fdr-quiet-money",        family: "beige-paper", text: "The quiet money mindset. Why loud founders go broke and quiet ones get rich. Compounding beats virality, every time." },
  { id: "fdr-stop-selling-time",  family: "beige-paper", text: "Stop selling time. Start selling outcomes. The AI-leveraged shift every freelancer needs to make in 2026." },
  { id: "fdr-minimalist-founder", family: "beige-paper", text: "The minimalist founder. One product, one channel, one audience. Why subtraction is the winning strategy in 2026." },
  { id: "fdr-patience-compounds", family: "beige-paper", text: "Patience compounds. Hype dies. A meditation on the long game for indie founders in the AI gold rush." },
  { id: "fdr-enough-is-enough",   family: "beige-paper", text: "Enough is a number. Why setting your enough number changes everything about how you build, price, and choose what to ignore." },

  // noir-yellow (3) — bold, contrarian takes
  { id: "fdr-truths-hard",        family: "noir-yellow", text: "Five hard truths about making money with AI. The hype tax, the saturation problem, the moat question every solo founder must answer." },
  { id: "fdr-vc-lies",            family: "noir-yellow", text: "What VCs don't tell solo founders. The dilution math, the rollup risk, the optionality you give up the moment you sign." },
  { id: "fdr-funding-warnings",   family: "noir-yellow", text: "Warning signs you don't need funding. Profitability, growth rate, customer love, optionality — read these before you take the meeting." },

  // coral-mag (2) — magazine-style features
  { id: "fdr-creator-money",      family: "coral-mag", text: "The creator-founder economy in 2026. How writers, podcasters, and educators are using AI to compound income without losing their voice." },
  { id: "fdr-lifestyle-business", family: "coral-mag", text: "The lifestyle business renaissance. Profitable, calm, owner-friendly. The new ambition for founders who watched the unicorn dream die." },
];

// ─── Kimi planner with retry on JSON parse failure ─────────────────────────

async function plan(brief, family) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch(KIMI_URL, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({
        messages: [{ role: "user", content: PROMPT_TEMPLATE(brief, family) }],
        max_tokens: 32000,
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
// BRIEF_IDS env var (comma-separated) optionally filters BRIEFS down to specific IDs only.
const BRIEF_ID_FILTER = process.env.BRIEF_IDS ? new Set(process.env.BRIEF_IDS.split(",").map((s) => s.trim())) : null;
const RUN_BRIEFS = BRIEFS.filter((b) => {
  if (FAMILY_FILTER && !FAMILY_FILTER.has(b.family)) return false;
  if (BRIEF_ID_FILTER && !BRIEF_ID_FILTER.has(b.id)) return false;
  return true;
});
console.log(`→ Generating ${RUN_BRIEFS.length} carousels with concurrency=${CONCURRENCY}${FAMILY_FILTER ? ` (families: ${[...FAMILY_FILTER].join(",")})` : ""}`);
const startedAt = Date.now();

// Identity slots stripped from every spec before composition.
// Templates can keep the slots; compose substitutes "" when missing.
const KILL_SLOTS = [
  // identity
  "handle", "brand", "brandTag", "domain", "domainText",
  // author/byline
  "author", "authorName", "authorInitials", "authorQuote", "authorRole",
  "byLine", "avatarLetter",
  // pagination / swipe
  "pageOf", "pageNumber", "pageBadge", "pageLabel", "swipeLabel",
  // CTA button labels (containers stripped by compose.stripEmptyDecoratives)
  "buttonLabel", "btnPrimary", "btnGhost", "buttonLine",
];
function killIdentitySlots(spec) {
  for (const slide of spec.slides || []) {
    if (!slide.slots) continue;
    for (const key of KILL_SLOTS) {
      if (key in slide.slots) slide.slots[key] = "";
    }
  }
}

const results = await pmap(RUN_BRIEFS, CONCURRENCY, async ({ id, family, text }, idx) => {
  const tag = `[${idx + 1}/${RUN_BRIEFS.length}] ${id} [${family}]`;
  try {
    const spec = await plan(text, family);
    spec.id = id;
    killIdentitySlots(spec);
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
