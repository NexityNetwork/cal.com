/**
 * Layout: cover-beige-serif
 *
 * Cream/beige cover with serif typography, faint giant number behind,
 * bottom soft pink ellipse, scattered sparkles. Replicates the
 * "Salford & Co. — Easy Tips to Increase Your Productivity" Canva template.
 *
 * Visual signature:
 *   - Cream bg (#f4ede2)
 *   - Top brand strip with horizontal lines + dot terminators
 *   - Huge faded pink Cormorant numeral centered behind content
 *   - Centered serif headline (Cormorant Garamond, 78px)
 *   - Soft pink/lavender ellipse at bottom (where original had circular masked photo)
 *   - Three scattered ✦ sparkle decorations
 */

export interface CoverBeigeSerifSlots {
  brand: string;             // e.g. "Salford & Co."
  headline: string;          // 2-3 line title
  slideCountHero: string;    // big faded number behind, typically slide count like "8" or "5"
}

export const layoutMeta = {
  id: "cover-beige-serif",
  category: "cover" as const,
  theme: "beige-paper" as const,
  vibe: "editorial-serif" as const,
  canvasSize: "1080x1350" as const,
  description: "Cream serif cover with faded giant numeral and soft pink ellipse hero.",
} as const;

export const sampleSlots: CoverBeigeSerifSlots = {
  brand: "Salford & Co.",
  headline: "Easy Tips to Increase Your Productivity",
  slideCountHero: "8",
};
