/** Every element the overlay adds to a Banner page is one of these. */
export const HOST_TAG = "betterssb-overlay";
/** The page-level host for the plan dock and popups. */
export const LAYER_SLOT = "layer";

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

export type HostDisplay = "inline-block" | "block";

export interface ShadowHost {
  host: HTMLElement;
  /** Where React renders; inside the host's shadow root, after its styles. */
  container: HTMLElement;
}

const containers = new WeakMap<Element, HTMLElement>();

/**
 * A host element with its own shadow root and the overlay's styles. An empty
 * host takes no space, so a mount that renders nothing never moves Banner's
 * layout.
 */
export function createShadowHost(
  css: string,
  slot: string,
  display: HostDisplay,
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

function ownHost(element: Element | null, slot: string): HTMLElement | null {
  return element?.localName === HOST_TAG &&
    (element as HTMLElement).dataset.slot === slot
    ? (element as HTMLElement)
    : null;
}

function containerOf(host: HTMLElement): HTMLElement {
  const container = containers.get(host);
  if (!container) throw new Error("Not an overlay host");
  return container;
}

/** The host right before `anchor`, made on first use. */
export function hostBefore(anchor: Element, slot: string, css: string) {
  const existing = ownHost(anchor.previousElementSibling, slot);
  if (existing && containers.has(existing)) return containerOf(existing);
  const { host, container } = createShadowHost(css, slot, "inline-block");
  anchor.before(host);
  return container;
}

/** The host at the end of `cell`, made on first use. */
export function hostInside(cell: Element, slot: string, css: string) {
  const existing = [...cell.children].find((child) => ownHost(child, slot));
  if (existing && containers.has(existing)) {
    return containerOf(existing as HTMLElement);
  }
  const { host, container } = createShadowHost(css, slot, "block");
  cell.append(host);
  return container;
}

/** Removes the overlay's hosts in Banner's tables, leaving the page as it was. */
export function removeCellHosts(root: ParentNode): void {
  for (const host of root.querySelectorAll(
    `${HOST_TAG}:not([data-slot="${LAYER_SLOT}"])`,
  )) {
    host.remove();
  }
}

export function isOverlayHost(node: Node): boolean {
  return node instanceof Element && node.localName === HOST_TAG;
}
