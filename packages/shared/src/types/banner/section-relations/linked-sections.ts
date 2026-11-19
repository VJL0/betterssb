/**
 * `GET /ssb/searchResults/fetchLinkedSections`, JSON. Answered
 * `{"linkedData": []}` for every one of the 157 sampled sections, including
 * the only section of three terms with a `linkIdentifier` (Spring 2027 CRN
 * 27426, "R1"); no school-wide link data was ever seen.
 *
 * Banner's page reads each `linkedData` entry as one combination of sections
 * to add together (an array of searchResults-like rows it sums
 * `creditHourLow` over), and its "Add All" button posts them to
 * `#viewAllLinkedSectionsUrl`'s `data-addAll-sections-endpoint`,
 * `/ssb/classRegistration/addAllLinkedSections` (`term`, `crnList`,
 * `addAllLinkedSections=true`, optional `structure` and `structureParent`).
 * That one changes a registration and was not called; its sibling
 * `classRegistration/getRegistrationEvents` redirects guests to CAS.
 */
export interface LinkedSectionsResponse {
  linkedData: [];
}

/**
 * `POST /ssb/searchResults/getLinkedSections`, a "Linked Sections" tab that
 * Temple's class search page doesn't render (no `data-endpoint` for it) but
 * the controller still answers like the other tabs: an HTML fragment,
 * `<section aria-labelledby="linked">`. The response is a `string`; this is
 * what it carried on all 157 sampled sections, CRN 27426 with its
 * `linkIdentifier` included: only its empty-state text. Saved fragments are
 * in reverse-engineering/section-relations/getLinkedSections/.
 */
export interface LinkedSectionsTab {
  message: "No linked course information available.";
}
