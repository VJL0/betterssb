/**
 * A match pattern covering every page of an origin. Patterns can't carry a
 * port, so this covers any port on the host (e.g. each localhost dev port).
 */
export function originMatchPattern(origin: string): string {
  const url = new URL(origin);
  return `${url.protocol}//${url.hostname}/*`;
}
