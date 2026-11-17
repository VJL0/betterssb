/** Every element the overlay adds to a Banner page is one of these. */
export const HOST_TAG = "betterssb-overlay";
/** The page-level host the React root and rating popups live in. */
export const LAYER_SLOT = "layer";
/** A host right before an instructor link, holding that rating. */
export const RATING_SLOT = "rating";

/**
 * Banner's results grid reacts to clicks and keys on its rows (selection,
 * KeyTable navigation). Events from inside the overlay stop at the host, after
 * React has handled them in the shadow root.
 */
const CONTAINED_EVENTS = [
  "click",
  "dblclick",
  "mousedown",
  "mouseup",
  "pointerdown",
  "pointerup",
  "keydown",
  "keyup",
  "keypress",
] as const;

export interface ShadowHost {
  host: HTMLElement;
  /** Where React renders; inside the host's shadow root, after its styles. */
  container: HTMLElement;
}

/** This content script's hosts and their containers. */
const containers = new WeakMap<Element, HTMLElement>();

/**
 * A host element with its own shadow root and the overlay's styles. An empty
 * host takes no space, so a rating that renders nothing never moves Banner's
 * layout.
 */
export function createShadowHost(
  css: string,
  slot: string,
  display: "inline-block" | "block",
): ShadowHost {
  const host = document.createElement(HOST_TAG);
  host.dataset.slot = slot;
  host.style.display = display;
  if (display === "inline-block") host.style.verticalAlign = "middle";
  for (const type of CONTAINED_EVENTS) {
    host.addEventListener(type, (event) => event.stopPropagation());
  }
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = css;
  const container = document.createElement(
    display === "block" ? "div" : "span",
  );
  shadow.append(style, container);
  containers.set(host, container);
  return { host, container };
}

/** The rating host right before `anchor`, made on first use. */
export function hostBefore(anchor: Element, css: string): HTMLElement {
  const previous = anchor.previousElementSibling;
  const existing = previous && containers.get(previous);
  if (existing) return existing;
  const { host, container } = createShadowHost(
    css,
    RATING_SLOT,
    "inline-block",
  );
  anchor.before(host);
  return container;
}

/** Removes the rating hosts in Banner's tables, leaving the page as it was. */
export function removeRatingHosts(root: ParentNode): void {
  for (const host of root.querySelectorAll(
    `${HOST_TAG}[data-slot="${RATING_SLOT}"]`,
  )) {
    host.remove();
  }
}

export function isOverlayHost(node: Node): boolean {
  return node instanceof Element && node.localName === HOST_TAG;
}
