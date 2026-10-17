import axe from "axe-core";

/**
 * Runs axe on rendered markup and returns the violations, formatted so a
 * failing `expect(...).toEqual([])` names each rule and element.
 *
 * jsdom has no layout, so axe skips color contrast; that's checked in the browser.
 */
export async function axeViolations(container: Element): Promise<string[]> {
  const results = await axe.run(container, {
    rules: { region: { enabled: false } },
  });
  return results.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`,
  );
}
