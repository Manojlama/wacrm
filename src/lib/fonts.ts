/**
 * Font catalog for the Appearance panel.
 *
 * The three axes are independent: MODE (light/dark), ACCENT
 * (`data-theme`), and FONT (`data-font`, this module). Fonts are
 * bundled by next/font in `src/app/layout.tsx` and exposed as
 * `--font-*` CSS variables; the `data-font` attribute on `<html>`
 * maps the active one into `--app-font` (see globals.css), which
 * Tailwind's `font-sans` utility reads.
 *
 * Adding a font is a three-step change:
 *   1. Bundle it with next/font in layout.tsx (`variable: "--font-x"`).
 *   2. Add an `html[data-font="<id>"]` block in globals.css mapping
 *      `--app-font: var(--font-x)`.
 *   3. Add an entry below. The order here drives the picker grid.
 */

export const FONT_IDS = ["sans", "modern", "grotesk", "lexend"] as const;

export type FontId = (typeof FONT_IDS)[number];

export const DEFAULT_FONT: FontId = "sans";

export const FONT_STORAGE_KEY = "wacrm.font";

export function isFontId(value: unknown): value is FontId {
  return (
    typeof value === "string" &&
    (FONT_IDS as ReadonlyArray<string>).includes(value)
  );
}

export interface FontMeta {
  id: FontId;
  name: string;
  tagline: string;
  /**
   * CSS font-family stack used to preview the family inside the
   * picker card. Must match a `--font-*` variable bundled in
   * layout.tsx.
   */
  family: string;
  sample: string;
}

export const FONTS: ReadonlyArray<FontMeta> = [
  {
    id: "sans",
    name: "Inter",
    tagline: "The default — crisp, neutral, built for dashboards.",
    family: "var(--font-inter)",
    sample: "Größe 字 한글 — The quick brown fox jumps over the lazy dog. 0123456789",
  },
  {
    id: "modern",
    name: "Manrope",
    tagline: "Geometric sans — friendly, modern, a bit softer.",
    family: "var(--font-manrope)",
    sample: "Größe 字 한글 — The quick brown fox jumps over the lazy dog. 0123456789",
  },
  {
    id: "grotesk",
    name: "Space Grotesk",
    tagline: "Technical with character — strong for headlines and data.",
    family: "var(--font-space-grotesk)",
    sample: "Größe 字 한글 — The quick brown fox jumps over the lazy dog. 0123456789",
  },
  {
    id: "lexend",
    name: "Lexend",
    tagline: "Wide, highly legible — reduces reading strain.",
    family: "var(--font-lexend)",
    sample: "Größe 字 한글 — The quick brown fox jumps over the lazy dog. 0123456789",
  },
];