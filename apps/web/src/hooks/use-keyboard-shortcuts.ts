import { useEffect, useRef } from "react";
import { useSettings } from "./use-settings";

/**
 * Single-key shortcuts for a page. They never fire while typing in a field
 * and can be turned off in Settings (WCAG 2.1.4).
 */
export function useKeyboardShortcuts(
  handlers: Record<string, (event: KeyboardEvent) => void>,
) {
  const { settings } = useSettings();
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!settings.keyboardShortcuts) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat)
        return;
      if (isTyping(event.target)) return;
      const handler = latest.current[event.key];
      if (!handler) return;
      event.preventDefault();
      handler(event);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settings.keyboardShortcuts]);
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const field = target.closest("input, textarea, select, [role='combobox']");
  if (!field) return false;
  // Checkboxes and radios don't take text, so shortcuts still work on them.
  return !(
    field instanceof HTMLInputElement &&
    ["checkbox", "radio", "button"].includes(field.type)
  );
}
