/**
 * Layout: body-icon-centered
 *
 * Body slide for a numbered tool/feature breakdown. Title sits top-left,
 * body paragraph below, and a single brand logo dominates the lower half
 * inside a thin-stroke circle.
 *
 * Visual signature:
 *   - Inner card frame (1px stroke, 32px radius, 30px inset)
 *   - Page badge top-left (pill, dark accent bg, accent text)
 *   - Numbered title top-left ("N. Tool, the role") in white bold
 *   - Body paragraph below title in muted grey
 *   - 360px transparent circle (1.5px stroke) holding a 200px brand logo
 *
 * Use this layout for:
 *   - Tool-stack carousels ("the AI stack I run")
 *   - Feature lists where each item has a brand association
 *   - 5-10 sequential slides with the same template
 *
 * Don't use this for:
 *   - Cover slides (use cover-display-cta)
 *   - Stat-heavy slides (use body-stat-*)
 *   - Carousels without a brand-icon-per-step structure
 */

export interface BodyIconCenteredSlots {
  /** Page number shown in the top-left badge, e.g. "02" */
  pageNumber: string;

  /** Numbered title, e.g. "1. Notion, the brain" */
  title: string;

  /** Body paragraph, 2-4 lines worth of text (no markdown) */
  body: string;

  /**
   * Brand icon — slug from simple-icons (e.g. "notion", "stripe") OR an
   * inline SVG string for icons not in simple-icons (e.g. "apify", "linkedin").
   *
   * If a slug is provided, the composer looks it up via simple-icons.
   * If an SVG string is provided, it's inlined directly.
   */
  iconSlug?: string;
  iconSvg?: string;

  /**
   * Override the icon color. Defaults to the brand's official hex from
   * simple-icons. Use "#ffffff" for white-only renders.
   */
  iconColor?: string;

  theme?: "ember-dark";
}

export const layoutMeta = {
  id: "body-icon-centered",
  category: "body" as const,
  theme: "ember-dark" as const,
  vibe: "minimal" as const,
  canvasSize: "1080x1350" as const,
  description:
    "Body slide with numbered title, body text, and one centered brand icon in a circle. Perfect for tool-stack breakdowns.",
} as const;

export const sampleSlots: BodyIconCenteredSlots = {
  pageNumber: "02",
  title: "1. Notion, the brain",
  body: "Every thought, client, project, content idea, transcript, SOP, and conversation in one place.",
  iconSlug: "notion",
  iconColor: "#ffffff",
};
