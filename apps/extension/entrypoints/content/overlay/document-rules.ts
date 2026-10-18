const DOCUMENT_RULES_ID = "betterssb-overlay-document-rules";
const PROPERTY_RULES = /@property\s*[^{]*\{[^}]*\}/g;

/** The path the extension serves Inter's Latin file at (see wxt.config.ts). */
export const OVERLAY_FONT_PATH = "/fonts/inter-latin-wght-normal.woff2";

function interFontFace(fontUrl: string): string {
  return `@font-face{font-family:"Inter Variable";font-style:normal;font-display:swap;font-weight:100 900;src:url("${fontUrl}") format("woff2-variations")}`;
}

/**
 * Chrome ignores `@property` and `@font-face` inside shadow roots, so
 * Tailwind's registered properties (rings, shadows, transforms) and the Inter
 * font are added to the page itself. Neither styles any of Banner's elements.
 */
export function addDocumentRules(css: string, fontUrl: string): void {
  if (document.getElementById(DOCUMENT_RULES_ID)) return;
  const style = document.createElement("style");
  style.id = DOCUMENT_RULES_ID;
  style.textContent = [
    ...(css.match(PROPERTY_RULES) ?? []),
    interFontFace(fontUrl),
  ].join("\n");
  document.head.append(style);
}
