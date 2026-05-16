/**
 * Carousel exemplar: "How to move like a 20-person team."
 *
 * Source: figma export from nexitynetwork/assets-claude (folder:
 * "how to grow like a 20-person team"). Reordered into page order.
 *
 * Design pattern:
 *   - 10 slides, dark-ember theme (#0a0a0a + #ff5e1a accent)
 *   - Slide 1: cover with display headline + orange period accent
 *     + play-triangle CTA, rounded inner card outline
 *   - Slides 2-9: same layout repeated — page badge top-left, numbered
 *     title "N. Tool, the role.", body paragraph, single tool icon
 *     in a subtly-outlined circle dead center
 *   - Slide 10: same as 2-9 but with FOUR icons arranged in a 2x2
 *     diamond (Instagram + YouTube top row, TikTok + LinkedIn bottom row)
 *
 * Canvas: 1080x1350 (IG portrait)
 * Font family: Inter (the renderer ships only Inter; weight 400/700)
 *
 * Why this is in the library:
 *   This is the visual quality bar. Compare to the current marketing-swarm
 *   outputs (every slide kind: freeform, empty grey circles, generic blue
 *   gradients). The planner should rag-retrieve this and emit specs that
 *   imitate this composition + spacing + accent restraint.
 */

import type { CarouselSpec, SlideSpec } from "../../../../cf-workers/marketing-swarm/src/carousel/types";

// ─── Theme tokens (shared across all slides) ────────────────────────────────

const THEME = {
  bg: "#0a0a0a",
  text: "#ffffff",
  textMuted: "#a8a8a8",
  accent: "#ff5e1a",
  innerCardStroke: "#1f1f1f",
  iconCircleStroke: "#2a2a2a",
  pageBadgeBg: "#3a1408", // dark ember
  pageBadgeText: "#ff7a3d",
} as const;

const CANVAS_W = 1080;
const CANVAS_H = 1350;
const INNER_INSET = 30; // rounded card lives 30px inside the canvas edges
const SAFE_PAD = 70; // typography stays 70px inside the inner card

// ─── Element factories (reused across slides) ───────────────────────────────

/**
 * The pageBadge in the upper-left corner — small pill with the page
 * number in muted orange on dark ember.
 */
function pageBadge(pageNumber: string) {
  return {
    type: "frame" as const,
    pos: { x: INNER_INSET + 30, y: INNER_INSET + 30, w: 64, h: 32 },
    style: { bg: THEME.pageBadgeBg, radius: 16 },
    children: [
      {
        type: "text" as const,
        value: pageNumber,
        pos: { x: 0, y: 0, w: 64, h: 32 },
        style: {
          color: THEME.pageBadgeText,
          size: 14,
          weight: 700,
          letterSpacing: 0.06,
          align: "center",
          verticalAlign: "middle",
          fontFamily: "sans-bold",
        },
      },
    ],
  };
}

/**
 * The subtle rounded card outline that sits inside every slide.
 * The Figma original draws a 1px stroke at 30px inset with ~32px radius.
 */
const INNER_CARD_OUTLINE = {
  type: "shape" as const,
  kind: "rect" as const,
  pos: { x: INNER_INSET, y: INNER_INSET, w: CANVAS_W - INNER_INSET * 2, h: CANVAS_H - INNER_INSET * 2 },
  style: {
    bg: "transparent",
    stroke: THEME.innerCardStroke,
    strokeWidth: 1,
    radius: 32,
  },
};

/**
 * Single icon (180px) centered in a 320px transparent circle with a
 * thin stroke. This is the dominant visual on slides 2-9.
 */
function centeredIconCircle(iconName: string, iconY: number = 880) {
  const CIRCLE_SIZE = 360;
  const ICON_SIZE = 200;
  const cx = CANVAS_W / 2;
  return [
    {
      type: "shape" as const,
      kind: "circle" as const,
      pos: { x: cx - CIRCLE_SIZE / 2, y: iconY - CIRCLE_SIZE / 2, w: CIRCLE_SIZE, h: CIRCLE_SIZE },
      style: {
        bg: "transparent",
        stroke: THEME.iconCircleStroke,
        strokeWidth: 1.5,
      },
    },
    {
      type: "icon" as const,
      name: iconName,
      pos: { x: cx - ICON_SIZE / 2, y: iconY - ICON_SIZE / 2, w: ICON_SIZE, h: ICON_SIZE },
      size: ICON_SIZE,
    },
  ];
}

/**
 * The numbered section title + body block used by slides 2-10.
 * Always anchored at the same top-left to keep adjacency consistent.
 */
function titleBlock(opts: { number: string; tool: string; role: string; body: string }) {
  return [
    {
      type: "text" as const,
      value: `${opts.number}. ${opts.tool}, the ${opts.role}`,
      pos: { x: SAFE_PAD + INNER_INSET, y: 260, w: CANVAS_W - (SAFE_PAD + INNER_INSET) * 2 },
      style: {
        color: THEME.text,
        size: 64,
        weight: 700,
        lineHeight: 1.1,
        fontFamily: "sans-bold",
      },
    },
    {
      type: "text" as const,
      value: opts.body,
      pos: { x: SAFE_PAD + INNER_INSET, y: 380, w: CANVAS_W - (SAFE_PAD + INNER_INSET) * 2 },
      style: {
        color: THEME.textMuted,
        size: 38,
        weight: 400,
        lineHeight: 1.35,
      },
    },
  ];
}

// ─── Slide 1: cover ─────────────────────────────────────────────────────────

const SLIDE_1_COVER: SlideSpec = {
  kind: "freeform",
  bg: THEME.bg,
  elements: [
    INNER_CARD_OUTLINE,
    pageBadge("01"),
    // Title — display weight, last token highlighted in accent (the period).
    // We represent the period as a separate <tspan>-style element by splitting
    // the headline into two text nodes; the second one inherits the same
    // x/y but colors only the period.
    {
      type: "text",
      value: "How to move like a",
      pos: { x: SAFE_PAD + INNER_INSET, y: 420, w: CANVAS_W - (SAFE_PAD + INNER_INSET) * 2 },
      style: {
        color: THEME.text,
        size: 92,
        weight: 700,
        lineHeight: 1.05,
        letterSpacing: -0.02,
      },
    },
    {
      type: "text",
      value: "20-person team",
      pos: { x: SAFE_PAD + INNER_INSET, y: 520, w: CANVAS_W - (SAFE_PAD + INNER_INSET) * 2 },
      style: {
        color: THEME.text,
        size: 92,
        weight: 700,
        lineHeight: 1.05,
        letterSpacing: -0.02,
      },
    },
    // The orange period: anchored at the right end of "20-person team" — the
    // exact x will need eyeball tuning at render time, but this position is
    // the design intent.
    {
      type: "text",
      value: ".",
      pos: { x: SAFE_PAD + INNER_INSET + 660, y: 520, w: 40 },
      style: {
        color: THEME.accent,
        size: 92,
        weight: 700,
        lineHeight: 1.05,
      },
    },
    // Play-triangle CTA: a rounded square with an orange triangle "play"
    // pointing right, positioned bottom-center.
    {
      type: "shape",
      kind: "rect",
      pos: { x: CANVAS_W / 2 - 130, y: 900, w: 260, h: 260 },
      style: {
        bg: "#170a06",
        stroke: THEME.accent,
        strokeWidth: 0,
        radius: 24,
      },
    },
    {
      type: "icon",
      name: "play-triangle",
      pos: { x: CANVAS_W / 2 - 70, y: 970, w: 140, h: 120 },
      size: 140,
      color: THEME.accent,
    },
  ],
};

// ─── Slides 2-9: numbered tools with single centered icon ───────────────────

type Tool = { number: string; tool: string; role: string; body: string; icon: string };

const TOOLS: Tool[] = [
  {
    number: "1",
    tool: "Notion",
    role: "brain",
    body: "Every thought, client, project, content idea, transcript, SOP, and conversation in one place.",
    icon: "notion",
  },
  {
    number: "2",
    tool: "Claude Code",
    role: "builder",
    body: "10 AI departments, CFO, CMO, Chief of staff, etc. On both my Macbook Pro & Cloud server.",
    icon: "claude-sparkle",
  },
  {
    number: "3",
    tool: "Ultron",
    role: "growth engine",
    body: "Five specialized AI agents splitting the go-to-market work in parallel for 10x speed.",
    icon: "ultron-sphere",
  },
  {
    number: "4",
    tool: "Apify",
    role: "scraper",
    body: "Automated data extraction to feed the AI agents with fresh leads, competitor intel, and market signals 24/7.",
    icon: "apify",
  },
  {
    number: "5",
    tool: "Supabase",
    role: "vault",
    body: "The backend database securely storing every scraped lead, user interaction, and agent output in real-time.",
    icon: "supabase",
  },
  {
    number: "6",
    tool: "Stripe",
    role: "bank",
    body: "Payment processing, invoicing, and subscription management handling the revenue without an accounting team.",
    icon: "stripe",
  },
  {
    number: "7",
    tool: "Github",
    role: "codebase",
    body: "The company's core operating system, controlling the logic, automations, and code.",
    icon: "github",
  },
  {
    number: "8",
    tool: "Cloudflare",
    role: "infra",
    body: "Security, Global routing, and bot protection ensuring the entire infrastructure stays unhackable.",
    icon: "cloudflare",
  },
];

const TOOL_SLIDES: SlideSpec[] = TOOLS.map((t, i) => ({
  kind: "freeform",
  bg: THEME.bg,
  elements: [
    INNER_CARD_OUTLINE,
    pageBadge(String(i + 2).padStart(2, "0")),
    ...titleBlock({ number: t.number, tool: t.tool, role: t.role, body: t.body }),
    ...centeredIconCircle(t.icon, 920),
  ],
}));

// ─── Slide 10: multi-icon distribution slide ────────────────────────────────

const SLIDE_10_CHANNELS: SlideSpec = {
  kind: "freeform",
  bg: THEME.bg,
  elements: [
    INNER_CARD_OUTLINE,
    pageBadge("10"),
    ...titleBlock({
      number: "9",
      tool: "Channels",
      role: "distribution",
      body: "The automated distribution network publishing campaigns on Instagram, YouTube, TikTok, and LinkedIn.",
    }),
    // Four icons in 2 rows. Each in a transparent stroked circle.
    // Layout: IG (left top) + YT (right top), TT (left-bot) + LI (mid-bot).
    // Eyeballed from the Figma export.
    ...iconCircleAt("instagram", 270, 800, 220),
    ...iconCircleAt("youtube", 810, 800, 220),
    ...iconCircleAt("tiktok", 400, 1050, 220),
    ...iconCircleAt("linkedin", 680, 1050, 220),
  ],
};

function iconCircleAt(iconName: string, cx: number, cy: number, size: number) {
  const ICON_SIZE = size * 0.55;
  return [
    {
      type: "shape" as const,
      kind: "circle" as const,
      pos: { x: cx - size / 2, y: cy - size / 2, w: size, h: size },
      style: {
        bg: "transparent",
        stroke: THEME.iconCircleStroke,
        strokeWidth: 1.5,
      },
    },
    {
      type: "icon" as const,
      name: iconName,
      pos: { x: cx - ICON_SIZE / 2, y: cy - ICON_SIZE / 2, w: ICON_SIZE, h: ICON_SIZE },
      size: ICON_SIZE,
    },
  ];
}

// ─── Carousel spec ──────────────────────────────────────────────────────────

export const spec: CarouselSpec = {
  id: "exemplar-how-to-move-20-person",
  brand: "Ultron",
  brief: "How to move like a 20-person team — the AI stack that replaced our org chart.",
  campaignType: "tool_stack",
  vibe: "minimal",
  canvas: "1080x1350",
  themeId: "ember-dark",
  slides: [
    SLIDE_1_COVER,
    ...TOOL_SLIDES,
    SLIDE_10_CHANNELS,
  ],
};

export default spec;
