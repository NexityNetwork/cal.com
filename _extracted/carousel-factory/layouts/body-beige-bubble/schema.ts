/**
 * Layout: body-beige-bubble
 *
 * Cream/beige body slide with center serif title overlapping a faded
 * giant numeral, body paragraph below, soft pink lavender radial-bubble
 * backdrop. Decorative ✦ sparkles in corners + dotted-line accents.
 * Bottom row has brand handle + domain.
 *
 * Replicates the body slide style of the "Salford & Co. — Easy Tips
 * to Increase Your Productivity" Canva template.
 *
 * Use for: tip / framework / listicle body slides where each slide is
 * "N. <Title>" + supporting paragraph.
 */

export interface BodyBeigeBubbleSlots {
  brand: string;           // top-left brand name in serif
  number: string;          // big faded numeral behind title, e.g. "01"
  title: string;           // the tip name — short, serif looks best at 5-8 chars × 2-4 words
  body: string;            // 2-4 sentence supporting paragraph
  handle: string;          // @handle bottom-left
  domain: string;          // domain bottom-right
}

export const layoutMeta = {
  id: "body-beige-bubble",
  category: "body" as const,
  theme: "beige-paper" as const,
  vibe: "editorial-serif" as const,
  canvasSize: "1080x1350" as const,
  description:
    "Cream serif body slide: faded numeral + centered title + paragraph over soft pink bubble.",
} as const;

export const sampleSlots: BodyBeigeBubbleSlots = {
  brand: "Salford & Co.",
  number: "01",
  title: "Stop Multitasking",
  body: "While this may feel productive, it rarely produces the best results. By focusing on just one task at a time, you will complete it to a higher standard and in less time.",
  handle: "@reallygreatsite",
  domain: "reallygreatsite.com",
};
