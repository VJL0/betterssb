/**
 * `GET /ssb/term/termSelection?mode=<mode>`, the "Select a Term" page in
 * front of every flow, as a full HTML page (about 59 KB,
 * `text/html;charset=UTF-8`). The response is a `string`; `TermSelectionPage`
 * is the data it carries. POST answers the same page.
 *
 * - "search" and "courseSearch" render with 200, and so does any other value
 *   ("bogus", "", and "Search": the mode is case-sensitive), as a page with
 *   an empty label and no usable term list.
 * - "registration", "plan" and "preReg" are a 302 to
 *   `/ssb/registration/registration` for a guest, with the whole page in the
 *   body anyway.
 * - No `mode` at all is a 500 error page with an empty `errorMessage`.
 *
 * Opening it clears the session's picked term and sets the session's mode to
 * the page's: a search right after returns `data: null` with this page's
 * mode as `pathMode`. The date inputs (`#startDatepicker`, `#endDatepicker`)
 * are in the page but hidden, with no control to show them. No request
 * needed the page's `synchronizerToken` meta.
 */

/** Query string. */
export interface TermSelectionQuery {
  mode: string;
  /** Prefills the picker (`data-init-text` and `value`) with this code. */
  selectedTerm?: string;
  /**
   * Sent empty, with an empty `selectedTerm`, by the signed-in links to
   * mode=registration; "x" changed nothing for a guest.
   */
  selectedTUid?: string;
}

export interface TermSelectionPage {
  /**
   * `<label for="txt_term">`, trimmed. "Terms Open for Registration" is the
   * label of both registration and preReg; unknown modes have "". Signed in,
   * the plan label is followed by an info `<span>` whose title is "Select a
   * term to start planning.".
   */
  label:
    | "Select a Term for Class Search"
    | "Select a Term for Course Search"
    | "Terms Open for Registration"
    | "Terms Open for Planning"
    | "";
  /** `<input type="hidden" id="txt_term">`, the select2 term picker. */
  txt_term: TermPicker;
  /** `<button id="term-go">`, Continue. */
  "term-go": {
    /**
     * `term/search` with the query's mode echoed as given
     * ("/StudentRegistrationSsb/ssb/term/search?mode=bogus").
     */
    "data-endpoint": string;
  };
  /** `window.bootstraps` in the `<head>`; the same on every mode. */
  bootstraps: { usingDates: false };
}

/** Attributes of `#txt_term`, as `getAttribute` returns them. */
export interface TermPicker {
  /**
   * The session's last picked term(s) as sent to `term/search`
   * ("202636,202703"), kept even after this page cleared the pick and across
   * modes; or `selectedTerm`; else "". `saveTerm` doesn't set it. Banner's JS
   * looks it up with `getTerms` (`offset` 1, `max` 1) to show it, so a
   * two-term pick shows nothing: that lookup finds no row for it.
   */
  "data-init-text": string;
  /** Always equal to `data-init-text`. */
  value: string;
  /**
   * The `getTerms` the picker lists from. A guest on registration, plan,
   * preReg or an unknown mode gets "/StudentRegistrationSsb/ssb//getTerms",
   * which redirects to sign-in; signed in, registration and plan pages point
   * at `classRegistration/getTerms` and `plan/getTerms`.
   */
  "data-endpoint":
    | "/StudentRegistrationSsb/ssb/classSearch/getTerms"
    | "/StudentRegistrationSsb/ssb/courseSearch/getTerms"
    | "/StudentRegistrationSsb/ssb/classRegistration/getTerms"
    | "/StudentRegistrationSsb/ssb/plan/getTerms"
    | "/StudentRegistrationSsb/ssb//getTerms";
  /** `saveTerm` with the query's mode echoed as given ("…/term/saveTerm?mode=search"). */
  "data-save-endpoint": string;
  "data-allowMultiple": "false";
  /** "" for a guest on any mode but search and courseSearch. */
  "data-mode": "search" | "courseSearch" | "registration" | "plan" | "";
  placeholder: "Select a term...";
}
