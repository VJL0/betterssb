/** Narrows an unknown value to an object whose fields can be read and checked. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
