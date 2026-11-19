/**
 * `GET /ssb/shortcut/data`, the keyboard-shortcut dialog. Answers JSON but
 * labelled `text/html;charset=utf-8`, with or without cookies; always the 23
 * bytes `{"windows":{},"mac":{}}` (seen 2 times on 2026-11-18). Banner's page
 * would read each key as section name to a list of `{ combination,
 * description }`, but Temple configures none.
 */
export interface ShortcutResponse {
  windows: Record<string, never>;
  mac: Record<string, never>;
}
