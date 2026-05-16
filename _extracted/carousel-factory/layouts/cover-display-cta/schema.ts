/**
 * Layout: cover-display-cta
 *
 * Cover slide with a display-weight headline and a play-triangle CTA
 * bottom-right. The headline supports an inline accent token (typically
 * a closing punctuation mark in the accent color).
 *
 * Visual signature:
 *   - Inner card frame (1px stroke, 32px radius, 30px inset)
 *   - Page badge top-left (pill, dark accent bg, accent text)
 *   - 2-line display headline, muted grey, optional accent suffix
 *   - Right-pointing play triangle bottom-right with motion-blur echoes
 *   - Triangle bleeds off the bottom edge to imply forward motion
 *
 * Use this layout for:
 *   - The first slide of any carousel
 *   - When the carousel's value is "watch what comes next"
 *
 * Don't use this for:
 *   - Slides with stat-heavy content (use body-stat-* instead)
 *   - Light-mode carousels (this layout is dark-theme only)
 */

export interface CoverDisplayCtaSlots {
  /** Page number shown in the top-left badge, e.g. "01" */
  pageNumber: string;

  /** First line of the headline */
  headlineLine1: string;

  /** Second line of the headline */
  headlineLine2: string;

  /** Optional accent token appended to line 2 (typically "." or "!"). Empty string = no accent. */
  accentSuffix: string;

  /**
   * Theme override. Defaults to ember-dark (#0a0a0a + #ff5e1a).
   * Other themes coming in v2.
   */
  theme?: "ember-dark";
}

export const layoutMeta = {
  id: "cover-display-cta",
  category: "cover" as const,
  theme: "ember-dark" as const,
  vibe: "minimal" as const,
  canvasSize: "1080x1350" as const,
  description:
    "Cover with 2-line display headline + bottom-right play-triangle CTA. Best for 'watch what's next' openers.",
} as const;

export const sampleSlots: CoverDisplayCtaSlots = {
  pageNumber: "01",
  headlineLine1: "How to move like a",
  headlineLine2: "20-person team",
  accentSuffix: ".",
};
