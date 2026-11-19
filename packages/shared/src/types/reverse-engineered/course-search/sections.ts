/**
 * What "View Sections" (`ViewSectionsQuery`) gets back in a catalog session:
 * the class search's JSON (`search-results`) with `pathMode` "courseSearch".
 * Seen on 2026-11-18 in 31 guest responses from 2026 Fall and 2027 Spring
 * sessions; in a `mode=search` session the same call answers exactly like
 * the class search (`SearchResultsResponse`, `pathMode` "search").
 */

import type {
  SearchResultsOtherTerm,
  SearchResultsPage,
  SearchResultsWithoutTerm,
} from "../search-results/response";

/**
 * Without a term in the session, `pathMode` is null
 * (`SearchResultsWithoutTerm`).
 */
export type ViewSectionsResponse =
  ViewSectionsPage | ViewSectionsOtherTerm | SearchResultsWithoutTerm;

/**
 * `searchResultsConfigs` (the 15 class-results columns) is only on the call
 * that ran the search, null on calls answered from the cache even at
 * `pageOffset` 0. `ztcEncodedImage` is null exactly when `data` is empty.
 */
export interface ViewSectionsPage extends SearchResultsPage {
  pathMode: "courseSearch";
}

/** `txt_term` left out or not the session's term. */
export interface ViewSectionsOtherTerm extends SearchResultsOtherTerm {
  pathMode: "courseSearch";
}
