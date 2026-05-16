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

  "dark-blob": `Layouts (black #0a0a0a + colored gradient blob top-right + huge Inter sans + author chip (avatar+name+handle) + nav circles bottom-right — Figma ref carousel_01/07/17 from Help Center):
ALL families use an author chip rendered as a colored gradient circle with 2-letter initials + bold name + @handle. Provide authorInitials (2 letters of authorName), authorName (real-sounding first+last name, e.g. "Manthan Patel"), handle ("@username", lowercase), avatarBg1 (vibrant hex, e.g. "#ff5a28"), avatarBg2 (complementary darker hex, e.g. "#7a2418"). Pick avatar colors that match the post topic.
COVER cover-dark-blob: blobColor1 (vibrant hex, e.g. "#ff3d7f"), blobColor2 (complementary hex, e.g. "#5b2bf5"), eyebrow (3-6 lowercase words like "post topic here…" — short subject), headlineLine1/Line2/Line3 (3 lines of bold sans title, 2-4 words each, e.g. "Your nice" / "and attractive" / "title here"), authorInitials, authorName, handle, avatarBg1, avatarBg2.
BODY  body-dark-blob: blobColor1/blobColor2, accentColor (hex of the accent palette, e.g. "#ff3d7f"), authorInitials, authorName, handle, avatarBg1, avatarBg2, pageOf ("02 / 08"), number (italic "01"-"06"), title (3-6 words bold), body (2-3 sentences ≤40 words), takeaway (1 punchy sentence ≤20 words, the key insight).
CTA   cta-dark-blob: blobColor1/blobColor2, accentColor, authorInitials, authorName, handle, avatarBg1, avatarBg2, pageOf, eyebrow (2-3 uppercase letter-spaced words like "YOUR TURN"), headlineLine1 (2-4 words), headlineLine2 (2-4 words), body (1-2 sentences ≤30 words), buttonLabel (3-5 words like "Save this post"), secondaryLabel (e.g. "Follow @handle").`,

  "mint-condensed": `Layouts (mint #d1f5d8 bg + dark slate #1f3a30 condensed-sans display + author chip with green-bordered avatar + bottom green pills — Figma ref carousel_14 "Ultimate Guide" style):
COVER cover-mint-condensed: titleLine1 (1-3 words light-weight condensed, e.g. "The Ultimate"), titleLine2 (1-2 words, e.g. "Guide to"), titleAccent (1-2 BOLD condensed words, e.g. "Proximity"), authorInitials, authorName, handle, avatarBg1/avatarBg2 (mint-friendly hex pair), pageOf ("01 - 10").
BODY  body-mint-condensed: authorInitials, authorName, handle, avatarBg1, avatarBg2, pageOf, number ("01"-"06"), numberLabel (1-2 words uppercase like "PRINCIPLE" or "RULE"), title (2-5 condensed bold words), body (2-3 sentences ≤40 words), calloutLabel (uppercase 1-2 words like "WHY IT WORKS"), calloutBody (1 sentence ≤25 words).
CTA   cta-mint-condensed: authorInitials, authorName, handle, avatarBg1, avatarBg2, pageOf, eyebrow (2-3 uppercase words like "YOUR MOVE"), headlineLine1 (2-3 condensed words), headlineAccent (1-2 BOLD condensed words), body (1-2 sentences ≤30 words), buttonLabel (3-5 words).`,

  "cream-best": `Layouts (cream #f6f1e6 + black huge sans + orange #d65f3e accent on key word + author chip + dot pagination — Figma ref carousel_09/19/23/36 "Best X" style):
COVER cover-cream-best: pageOf ("01 / 06"), authorInitials, authorName, handle, avatarBg1/avatarBg2, headlineLine1 (1-2 words, e.g. "BEST"), headlineAccent (1-2 ORANGE words, e.g. "TOOLS"), headlineLine3 (1-3 words, e.g. "FOR DESIGN").
BODY  body-cream-best: pageOf, authorInitials, authorName, handle, avatarBg1/avatarBg2, number ("01"-"06"), title (3-6 words sans bold), body (2-3 sentences ≤40 words), tileGlyph (1-2 char glyph for the orange icon tile, e.g. "F" or "▣"), tileKey (1-3 words like "Best for", e.g. "Free tier"), tileValue (3-6 words descriptor, e.g. "Unlimited projects, all features").
CTA   cta-cream-best: pageOf, authorInitials, authorName, handle, avatarBg1/avatarBg2, eyebrow (2-3 uppercase words like "PICK ONE"), headlineLine1 (2-3 words), headlineAccent (1-2 ORANGE words), body (1-2 sentences ≤30 words), buttonLabel (3-5 words).`,

  "black-warning": `Layouts (pure #000 + DM Serif italic display + red #ff4757 warning accent + small avatar chip + numbered red-bordered circle — Figma ref carousel_10 "Stop Ignoring..." style):
COVER cover-black-warning: warningLabel (2-4 uppercase words like "DON'T MAKE THIS MISTAKE" or "STOP IGNORING"), headlineLine1 (2-4 italic-serif words like "Stop Ignoring"), headlineLine2 (2-4 italic-serif words like "This Mistake In"), headlineAccent (1-3 red italic-serif words like "UI/UX"), body (1-2 sentences ≤30 words), authorInitials, authorName, handle, avatarBg1, avatarBg2.
BODY  body-black-warning: pageOf, number (digit "1"-"6"), titleLine1 (2-4 italic-serif words), titleAccent (1-2 red italic-serif words), body (2-3 sentences ≤40 words), quote (1 punchy italic quote ≤18 words), authorInitials, authorName, handle, avatarBg1, avatarBg2.
CTA   cta-black-warning: pageOf, eyebrow (2-3 uppercase letter-spaced words like "LAST WARNING"), headlineLine1 (2-3 italic-serif words), headlineAccent (1-3 red italic-serif words), body (1-2 sentences ≤30 words), buttonLabel (3-5 words like "Save before you forget"), authorInitials, authorName, handle, avatarBg1, avatarBg2.`,

  "cream-3d": `Layouts (warm cream #f0ebe1 + centered 3D ball-shaped gradient orb #c4541f + bold sans + author chip + black pill badge — Figma ref carousel_02/06 3D illustration style):
COVER cover-cream-3d: pageOf, authorInitials, authorName, handle, avatarBg1, avatarBg2, titleLine1 (2-4 bold sans words), titleAccent (1-3 orange bold words), badgeText (2-5 words like "Read in 5 minutes" or "FREE Inside ⚡").
BODY  body-cream-3d: pageOf, authorInitials, authorName, handle, avatarBg1, avatarBg2, numberLabel (uppercase 1-2 words like "STEP 01" or "RULE 02"), title (3-6 bold sans words), body (2-3 sentences ≤40 words), tipLabel (uppercase 1-2 words like "PRO TIP"), tipBody (1 sentence ≤25 words tactical), shapeLabel (2-4 words label below orb, e.g. "Cash flow growth").
CTA   cta-cream-3d: pageOf, authorInitials, authorName, handle, avatarBg1, avatarBg2, eyebrow (2-3 uppercase words like "YOUR MOVE"), headlineLine1 (2-3 words), headlineAccent (1-3 orange words), body (1-2 sentences ≤30 words), buttonLabel (3-5 words).`,

  "typo-sample": `Layouts (cream #f7f2ea + Cormorant Garamond italic display HUGE typography specimen at top + orange #d65f3e accent + author chip — Figma ref carousel_16 "Aa Bb &" type sample):
COVER cover-typo-sample: pageOf, authorInitials, authorName, handle, avatarBg1, avatarBg2, specimen1 (1 letter or letter-pair in normal style, e.g. "A"), specimen2 (1 letter or pair in italic orange, e.g. "a"), titleLine1 (2-4 bold sans words like "The Ultimate Guide to"), titleItalic (1-3 italic-serif words like "Beautiful Type"), body (1-2 sentences ≤30 words).
BODY  body-typo-sample: pageOf, authorInitials, authorName, handle, avatarBg1, avatarBg2, number (1 letter or digit like "01" or "A"), numberLabel (uppercase 1-2 words like "LETTER 01" or "TIP NO."), title (3-5 bold sans words), titleItalic (1-3 italic-serif accent words), body (2-3 sentences ≤40 words), quote (1 italic insight ≤18 words).
CTA   cta-typo-sample: pageOf, authorInitials, authorName, handle, avatarBg1, avatarBg2, eyebrow (2-3 uppercase letter-spaced words), headlineLine1 (2-3 bold sans words), headlineItalic (1-3 italic-serif words), body (1-2 sentences ≤30 words), buttonLabel (3-5 words), secondaryLabel (italic phrase like "for you").`,

  "data-table": `Layouts (cream #f5f1e8 + bordered white table with progress bars + bold orange #c4541f stats + author chip — Figma ref carousel_28/29/33 stats/data style):
COVER cover-data-table: pageOf, authorInitials, authorName, handle, avatarBg1, avatarBg2, eyebrow (2-4 uppercase words like "BY THE NUMBERS"), titleLine1 (2-4 bold words), titleAccent (1-3 orange bold words), tableHeader (1-3 words like "CHANNEL" or "TACTIC"), row1Label/row2Label/row3Label (3 short row labels 1-3 words each, e.g. "Email" / "LinkedIn" / "X"), row1Value/row2Value/row3Value (3 percentage or rate strings like "47%" or "$12K"), row1Pct/row2Pct/row3Pct (number 0-100 for bar width — first largest).
BODY  body-data-table: pageOf, authorInitials, authorName, handle, avatarBg1, avatarBg2, number ("01"-"06"), numberLabel (uppercase 1-2 words like "FINDING"), title (3-6 bold words), metric1Label/metric2Label/metric3Label (3 short row labels), metric1Value/metric2Value/metric3Value (3 value strings), metric1Pct/metric2Pct/metric3Pct (bar widths 0-100), body (1-2 sentences ≤30 words).
CTA   cta-data-table: pageOf, authorInitials, authorName, handle, avatarBg1, avatarBg2, bigStat (single hero number like "10x" or "47%"), eyebrow (2-3 uppercase words like "THE RESULT"), headlineLine1 (2-3 words), headlineLine2 (2-3 words), body (1-2 sentences ≤30 words), buttonLabel (3-5 words).`,

  "tool-list": `Layouts (black #0f0f0f + orange #ff5a28 pill eyebrow + huge sans + 5 tool icon squares row on cover + dark card hero on body — Figma ref carousel_47/49 tool listicle):
COVER cover-tool-list: pageOf, authorInitials, authorName, handle, avatarBg1, avatarBg2, eyebrow (2-4 uppercase words like "5 TOOLS YOU NEED"), headlineLine1 (2-4 white bold words), headlineAccent (1-3 ORANGE bold words), tool1Glyph/tool2Glyph/tool3Glyph/tool4Glyph/tool5Glyph (5 single-char or 2-char glyphs representing tools, e.g. "F" "▶" "N" "★" "C" — use brand initials or symbols).
BODY  body-tool-list: pageOf, authorInitials, authorName, handle, avatarBg1, avatarBg2, number ("01"-"05"), toolGlyph (1-2 char glyph, e.g. "F"), toolCategory (1-2 uppercase words like "WRITING" or "DESIGN"), toolName (1-3 word tool name like "Figma" or "Claude Code"), toolTagline (3-7 word descriptor like "Design tool for product teams"), body (2-3 sentences ≤40 words), feat1Key (uppercase 1-2 words like "PRICE"), feat1Val (short value like "Free / $12/mo"), feat2Key (uppercase 1-2 words like "BEST FOR"), feat2Val (short value like "Solo founders").
CTA   cta-tool-list: pageOf, authorInitials, authorName, handle, avatarBg1, avatarBg2, eyebrow (2-4 uppercase words like "PICK YOUR STACK"), headlineLine1 (2-3 words), headlineAccent (1-3 orange words), body (1-2 sentences ≤30 words), buttonLabel (3-5 words), secondaryLabel (2-4 words ghost button text).`,

  "flowchart": `Layouts (cream #f4eee2 + bordered white nodes with hard shadow + blue #3a5eef accent + 4-node vertical flow on cover, 3-node horizontal on body — Figma ref carousel_12/40 diagram style):
COVER cover-flowchart: pageOf, authorInitials, authorName, handle, avatarBg1, avatarBg2, eyebrow (2-4 uppercase words like "SYSTEM DESIGN"), titleLine1 (2-4 bold words), titleAccent (1-3 blue bold words), node1 (2-5 words, first step in flow), node2 (2-5 words second step), node3 (2-5 words third step), node4 (2-5 words end result).
BODY  body-flowchart: pageOf, authorInitials, authorName, handle, avatarBg1, avatarBg2, number ("01"-"06"), numberLabel (uppercase 1-2 words like "STEP" or "RULE"), title (3-6 bold words), body (2-3 sentences ≤40 words), step1Num/step2Num/step3Num (e.g. "01"/"02"/"03"), step1Label/step2Label/step3Label (2-3 words each, sub-steps in horizontal flow), takeaway (1 punchy sentence ≤20 words insight).
CTA   cta-flowchart: pageOf, authorInitials, authorName, handle, avatarBg1, avatarBg2, eyebrow (2-3 uppercase letter-spaced words), headlineLine1 (2-3 words), headlineAccent (1-3 blue words), node1 (2-3 word summary node), node2 (2-3 words, middle node), node3 (2-3 words), body (1-2 sentences ≤30 words), buttonLabel (3-5 words).`,

  "design-tile": `Layouts (cream #f3ede0 + 6 colored square tiles grid + bold sans + author chip — Figma ref carousel_34/37/45 colorful tile/palette style):
COVER cover-design-tile: pageOf, authorInitials, authorName, handle, avatarBg1, avatarBg2, eyebrow (2-4 uppercase words like "DESIGN SYSTEM"), titleLine1 (2-5 bold words like "Best Color Palettes"), tile1Color..tile6Color (6 distinct hex codes that work as a designer palette, e.g. "#ff5a28" "#3a5eef" "#2dad6b" "#f5b540" "#1a1a1a" "#c4541f"), tile1Label..tile6Label (1-2 word labels per tile, e.g. "Coral" / "Cobalt"), tile1Glyph..tile6Glyph (1 char glyph per tile, e.g. "◆" "●" "▲" "■" "✦" "◐").
BODY  body-design-tile: pageOf, authorInitials, authorName, handle, avatarBg1, avatarBg2, themeColor (single hex for this slide's accent, picked from a curated palette), number ("01"-"06"), numberLabel (uppercase 1-2 words like "PALETTE"), titleMain (2-3 bold words), titleAccent (1-2 colored words), body (2-3 sentences ≤40 words), heroKey (uppercase 1-2 words like "PRIMARY HEX"), heroValue (3-6 words describing usage), heroGlyph (1 char glyph like "◆").
CTA   cta-design-tile: pageOf, authorInitials, authorName, handle, avatarBg1, avatarBg2, themeColor (hex), swatch1..swatch4 (4 distinct hex codes), eyebrow (2-3 uppercase words like "YOUR PALETTE"), headlineLine1 (2-3 words), headlineAccent (1-3 colored words), body (1-2 sentences ≤30 words), buttonLabel (3-5 words).`,
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
