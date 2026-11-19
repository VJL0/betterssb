# Reverse-engineered Banner types

Types for Temple's Banner SSB endpoints, written from real responses rather than Ellucian docs (Banner's JSON differs between versions and schools).

## Routes

`routes.ts` lists every route a guest can call as `GuestRoutes`, keyed by `"METHOD path"` with each route's request and response type, and the routes that send a guest to the CAS login as `SignInRoute`. Paths are relative to `/StudentRegistrationSsb`. Discovery's crawl on 2026-11-18 found 165 routes in Banner's JS bundles, the guest pages and the user's signed-in HARs, then probed them as a guest, except those that change registrations or plans: 81 answer a guest, 78 need signing in and 6 are broken.

A final check the same day crawled again from `/ssb/registration` until no new link turned up (61 routes, none new), swept every route name out of the captures in `reverse-engineering/`, the HAR files (requests and bodies) and the five JS bundles only signed-in pages load, and probed what was left. That added `/login/resetPassword` and `/logout/customLogout` (guest), `prepareRegistration/getTerms`, `registrationHistory/getTerms` and `classRegistration/addMultiTermClassRegistrations` (sign-in), and `registration/getTerms` and `term/getTerms` (404). The crawler (`reverse-engineering/scripts/crawl.py OUT_DIR [TERM] [SEED]`) now also follows `location.href` in `onclick` handlers; it still skips `/login/*`, so `/login/error` and the prompt its button opens are only reached by probing.

| Route                                                                                                                                                                                                                   | Method    | Format        | Guest                                 | Folder                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------- | ------------------------------------- | ----------------------------------- |
| `/`, `/ssb/registration`, `/ssb/registration/registration`                                                                                                                                                              | GET       | HTML          | yes                                   | `app/`                              |
| `/login/auth` (Grails' Sign In form)                                                                                                                                                                                    | GET       | HTML          | yes                                   | `app/`                              |
| `/login/error`                                                                                                                                                                                                          | GET       | HTML          | yes                                   | none                                |
| `/login/resetPassword` (the Sign In form in its error state)                                                                                                                                                            | GET       | HTML          | yes                                   | `app/`                              |
| `/logout/customLogout`                                                                                                                                                                                                  | GET       | HTML          | yes                                   | `app/`                              |
| `/ssb/about/data`, `/ssb/serverInfo/index`, `/ssb/shortcut/data`, `/ssb/userPreference/fetchUsageTracking`, `/ssb/userPreference/locales`                                                                               | GET       | JSON          | yes                                   | `app/`                              |
| `/ssb/selfServiceMenu/data`, `/ssb/menu`                                                                                                                                                                                | GET       | XML           | yes                                   | `app/`                              |
| `/ssb/keepAlive/data`, `/ssb/dateConverter`, `/ssb/dateConverter/data`, `/storageAccess/logout`                                                                                                                         | GET       | text          | yes                                   | `app/`                              |
| `/ssb/theme/getTheme`                                                                                                                                                                                                   | GET       | CSS           | yes                                   | `app/`                              |
| `/ssb/userPreference/saveLocale`, `/ssb/userPreference/saveUsageTracking`                                                                                                                                               | POST      | JSON          | yes, not typed                        | none                                |
| `/ssb/term/termSelection`                                                                                                                                                                                               | GET       | HTML          | `mode=search` and `mode=courseSearch` | `terms/`                            |
| `/ssb/term/search`                                                                                                                                                                                                      | POST      | JSON          | yes                                   | `terms/`                            |
| `/ssb/term/saveTerm`                                                                                                                                                                                                    | GET       | JSON          | yes                                   | `terms/`                            |
| `/ssb/classSearch/getTerms`, `/ssb/courseSearch/getTerms`                                                                                                                                                               | GET       | JSON          | yes                                   | `terms/`                            |
| `/ssb/classSearch/classSearch`, `/ssb/courseSearch/courseSearch` and their controller indexes                                                                                                                           | GET       | HTML          | after a term pick                     | `app/`                              |
| `/ssb/searchResults/searchResults`                                                                                                                                                                                      | GET       | JSON          | after a term pick                     | `search-results/`, `course-search/` |
| `/ssb/searchResults` (controller index)                                                                                                                                                                                 | GET       | JSON          | after a term pick                     | `search-results/`                   |
| `/ssb/classSearch/resetDataForm`, `/ssb/courseSearch/resetDataForm`                                                                                                                                                     | POST      | text          | yes                                   | `app/`, `course-search/`            |
| `/ssb/classSearch/get_*` (11 lookups)                                                                                                                                                                                   | GET       | JSON          | yes                                   | `class-search/`                     |
| `/ssb/courseSearchResults/courseSearchResults` and its controller index                                                                                                                                                 | GET       | JSON          | after a term pick                     | `course-search/`                    |
| `/ssb/courseSearch/get_*` (7 lookups)                                                                                                                                                                                   | GET       | JSON          | yes                                   | `course-search/`, `class-search/`   |
| `/ssb/searchResults/` `getClassDetails`, `getCourseDescription`, `getSectionCatalogDetails`, `getSectionAttributes`, `getSectionBookstoreDetails`, `getFees`, `getEnrollmentInfo`                                       | POST      | HTML fragment | yes                                   | `section-details/`                  |
| `/ssb/searchResults/` `getRestrictions`, `getSectionPrerequisites`, `getCorequisites`, `getCourseMutuallyExclusions`, `getXlstSections`, `getLinkedSections`, `getSyllabus`                                             | POST      | HTML fragment | yes                                   | `section-relations/`                |
| `/ssb/searchResults/getFacultyMeetingTimes`, `/ssb/searchResults/fetchLinkedSections`, `/ssb/contactCard/retrieveData`                                                                                                  | GET       | JSON          | yes                                   | `section-relations/`                |
| `/ssb/courseSearchResults/` `getCourseCatalogDetails`, `getCourseDescription`, `getCourseAttributes`, `getRestrictions`, `getCorequisites`, `getPrerequisites`, `getCourseMutuallyExclusions`, `getFees`, `getSyllabus` | POST      | HTML fragment | yes                                   | `course-details/`                   |
| `/ssb/classRegistration/*` (29 routes)                                                                                                                                                                                  | GET, POST |               | sign-in                               | `SignInRoute`                       |
| `/ssb/plan/*` (16 routes)                                                                                                                                                                                               | GET, POST |               | sign-in                               | `SignInRoute`                       |
| 24 others, such as `/ssb/registration/registerPostSignIn`, `/ssb/help/url` and `/ssb/registrationPicture/picture`                                                                                                       | GET, POST |               | sign-in                               | `SignInRoute`, `app/`               |
| `/ssb/term/termSelection` with `registration`, `plan` or `preReg`                                                                                                                                                       | GET       | redirect      | sign-in                               | `app/`                              |
| `/login/authenticate`, `/login/cas`, `/logout`                                                                                                                                                                          | GET, POST |               | sign-in                               | none                                |
| `/ssb/term`, `/ssb/contactCard`, `/ssb/term/termSelection` without `mode` (500); `/ssb/searchResults/getExtras`, `/ssb/classSearch/get_division`, `/ssb/registration/getTerms`, `/ssb/term/getTerms` (404)              | GET, POST | HTML          | broken                                | none                                |

Every `SignInRoute` sends a guest to the CAS login; the ones that change registrations or plans are listed because every other action of their controller does. `/login/authenticate` takes credentials and was never sent.

The typed POST routes take an urlencoded form, and the dialog tabs and `term/search` answer a GET with the same fields the same way. A request Banner can't serve gets its 500 page (`BannerErrorPage`), and a 500 ends the session: run `term/search` again after one.

```ts
import type {
  GuestRoutes,
  SignInRoute,
} from "@workspace/shared/types/reverse-engineered/routes";
```

## `search-results/`

`GET /StudentRegistrationSsb/ssb/searchResults/searchResults`, the class search.

Written from every section of three terms, pulled from the public guest search on 2026-11-18:

| Term   | Name          | Sections |
| ------ | ------------- | -------- |
| 202620 | 2026 Summer I | 1,861    |
| 202636 | 2026 Fall     | 9,054    |
| 202703 | 2027 Spring   | 8,824    |

Every key was present on every record, and a field is typed `| null` only where null was seen. Code lists in `codes.ts` are the values seen in those terms, left open for codes added later. The types were checked by running 8,053 sections, chosen so every field shape and code value appears, plus every page envelope, through `tsc` with `satisfies`.

To pull a term yourself, without signing in:

1. `GET /ssb/classSearch/classSearch` to get session cookies.
2. `POST /ssb/term/search?mode=search` with `term=<code>&uniqueSessionId=<id>`.
3. `GET /ssb/searchResults/searchResults?txt_term=<code>&uniqueSessionId=<id>&pageOffset=0&pageMaxSize=500&sortColumn=subjectDescription&sortDirection=asc`, then step `pageOffset` by 500 until it reaches `totalCount`.

`GET /ssb/classSearch/getTerms?searchTerm=&offset=1&max=10` lists the term codes.

```ts
import type { SearchResultsResponse } from "@workspace/shared/types/reverse-engineered/search-results/index";
```

## `terms/`

The term pick in front of every search: `GET /ssb/term/termSelection` (the "Select a Term" page), `POST /ssb/term/search` (its Continue button, which picks the session's term), `GET /ssb/term/saveTerm`, and the term pickers `GET /ssb/classSearch/getTerms` and `GET /ssb/courseSearch/getTerms`.

Written from 647 guest calls on 2026-11-18 (211 `getTerms`, 244 `saveTerm`, 88 `term/search`, 31 term pages and 73 calls probing what the session keeps) and the term routes of the user's HARs:

| Picker                  | Terms | From                                           |
| ----------------------- | ----- | ---------------------------------------------- |
| `classSearch/getTerms`  | 64    | 2011 Summer I (201120) to 2027 Spring (202703) |
| `courseSearch/getTerms` | 93    | the same, 2028 Fall and 28 orientation terms   |

The types were checked by running every distinct captured answer (session ids and cache-busters replaced) through `tsc` with `satisfies`.

To pick a term, without signing in:

1. `GET /ssb/term/termSelection?mode=search` (or `mode=courseSearch`) to get session cookies. Opening this page clears the session's term.
2. `POST /ssb/term/search?mode=search` with `term=<code>&studyPath=&studyPathText=&startDatepicker=&endDatepicker=&uniqueSessionId=<id>`. It answers the `fwdURL` of the search page.

`getTerms` takes `?searchTerm=&offset=1&max=10` and needs no session. Banner's page never calls `saveTerm` for a guest, and it doesn't pick a term.

```ts
import type {
  GetTermsResponse,
  TermSearchResponse,
} from "@workspace/shared/types/reverse-engineered/terms/index";
```

## `app/`

The pages around the searches and the small routes every page calls: the landing page, the `<head>` metas and inline globals of every full page, the class search and catalog pages' `window.bootstraps`, the About dialog, the menus, the keep-alive ping, locales, theme, date converter, the reset behind "Search Again", how a guest session lives (`session.ts`), and what a guest gets from the routes that need signing in (`guest-access.ts`).

Written from 38 full guest pages, 9 error pages and 12 probe sessions on 2026-11-18, compared with the 26 signed-in pages of the user's HARs. The types were checked by running every page's data, every distinct answer of the small routes and every request shape the probes sent through `tsc` with `satisfies`.

A guest session belongs to the `JSESSIONID` cookie, pinned to one app server by the `BIGipServer…` cookie, so send both. Banner never checks `uniqueSessionId` or `synchronizerToken` for a guest. The session caches the result set of its first search until `POST /ssb/classSearch/resetDataForm` (or the `courseSearch` one) with `resetCourses=true&resetSections=true`.

`guest-access.ts` also covers the two sign-in leftovers a guest can open: `/login/resetPassword` (the Sign In form's forgot-password target, which Temple never shows; a bare GET is the form asking for a user name) and `/logout/customLogout` (`CustomLogoutPage`, the "log out or return home?" prompt behind the `/login/error` page's OK button, which leaves the session alone).

```ts
import type {
  BannerSessionCookies,
  LandingConfig,
} from "@workspace/shared/types/reverse-engineered/app/index";
```

## `class-search/`

`GET /ssb/classSearch/get_*`, the lookups behind the class search's pickers: `get_subject`, `get_campus`, `get_college`, `get_attribute`, `get_instructionalMethod`, `get_instructor`, `get_partOfTerm` and `get_session`. `get_department`, `get_level` and `get_scheduleType` answer too, but always with `[]`.

Written from the full lists of three terms, pulled as a guest on 2026-11-18, and 492 probe calls, nearly all in 2027 Spring:

| Term   | Name          | Subjects | Instructors | Parts of term |
| ------ | ------------- | -------- | ----------- | ------------- |
| 202620 | 2026 Summer I | 134      | 1,047       | 11            |
| 202636 | 2026 Fall     | 183      | 3,744       | 12            |
| 202703 | 2027 Spring   | 183      | 3,411       | 12            |

Campuses (38), colleges (17), attributes (32), instructional methods (11) and sessions (3) were the same in every term. The code lists in `codes.ts` reuse the `search-results` lists where they overlap. The types were checked by running every row of every list (171 instructors, chosen so every name quirk appears), every request shape, the empty answers and the error pages through `tsc` with `satisfies`. A script checked 244 counted claims in the comments.

To call one, without signing in or picking a term:

1. `GET /ssb/classSearch/get_subject?searchTerm=&term=202703&offset=1&max=10`. `offset` is the 1-based page. Only `get_subject` and `get_instructor` page; the others return everything, whatever `offset` and `max` say.
2. Put the chosen codes, comma-separated, in the `searchResults` filter named after the lookup (`txt_subject`, `txt_campus`, …). `txt_campus` filters by the section's campus.
3. Instructor codes are numbers handed out per session. Call `get_instructor` and `searchResults` with the same cookies: a code from any other session is a 500 that ends the session.

```ts
import type { GetSubjectResponse } from "@workspace/shared/types/reverse-engineered/class-search/index";
```

## `course-search/`

`GET /ssb/courseSearchResults/courseSearchResults`, the Browse Course Catalog, with its `courseSearch/get_*` lookups and the "View Sections" call.

Written from every course of three catalogs, pulled as a guest on 2026-11-18:

| Term   | Name          | Courses |
| ------ | ------------- | ------- |
| 202620 | 2026 Summer I | 12,768  |
| 202636 | 2026 Fall     | 12,947  |
| 202703 | 2027 Spring   | 12,917  |

Also used: 130 probe searches, 31 "View Sections" responses, and the lookups of each term plus 63 lookup probes. Every key was on every course, and a field is typed `| null` only where null was seen. Lookups that answer exactly like the class search's reuse its types. The types were checked by running every page envelope, 21 courses chosen so every field shape and code value appears, every distinct lookup and section response, and the error pages through `tsc` with `satisfies`. A script checked 80 claims in the comments.

To pull a catalog yourself, without signing in:

1. `GET /ssb/term/termSelection?mode=courseSearch` to get session cookies.
2. `POST /ssb/term/search?mode=courseSearch` with `term=<code>&uniqueSessionId=<id>`.
3. `GET /ssb/courseSearchResults/courseSearchResults?txt_term=<code>&startDatepicker=&endDatepicker=&uniqueSessionId=<id>&pageOffset=0&pageMaxSize=500&sortColumn=subjectDescription&sortDirection=asc`, then step `pageOffset` by 500 until it reaches `totalCount`.

The session keeps the courses of its first search. Before searching with other filters, `POST /ssb/courseSearch/resetDataForm` with `resetCourses=true&resetSections=true`. For a course's sections ("View Sections"), reset with `resetSections=true`, then `GET /ssb/searchResults/searchResults?txt_subjectcoursecombo=ACCT2103&txt_term=<code>&pageOffset=0&pageMaxSize=10&sortColumn=subjectDescription&sortDirection=asc` in the same session. The lookups take `?searchTerm=&term=<code>&offset=1&max=10` and need no session.

```ts
import type { CourseSearchResultsResponse } from "@workspace/shared/types/reverse-engineered/course-search/index";
```

## `section-details/`

`POST /ssb/searchResults/<tab>`, seven tabs of the class search's section dialog: `getClassDetails`, `getCourseDescription`, `getSectionCatalogDetails`, `getSectionAttributes`, `getSectionBookstoreDetails`, `getFees` and `getEnrollmentInfo`.

Each tab answers with an HTML fragment, so the response is a `string`. The types describe the data each fragment carries, read the way a DOM parser reads it (entities decoded). They were written from all seven tabs of 156 sections, pulled as a guest on 2026-11-18:

| Term   | Name          | Sections |
| ------ | ------------- | -------- |
| 202620 | 2026 Summer I | 15       |
| 202636 | 2026 Fall     | 72       |
| 202703 | 2027 Spring   | 69       |

150 of these are class search rows, chosen to cover the credit, fee, attribute and description variants; the other 6 are CRNs the search doesn't list but that still answer. Every value but the grade mode repeats the section's `searchResults` row. The types were checked by running every fragment's data (1,092), all 72 captured 500 pages and 338 forms through `tsc` with `satisfies`. A script checked 36 claims in the comments.

No session is needed:

1. `POST /ssb/searchResults/getClassDetails` with `term=202703&courseReferenceNumber=41859`.
2. The other six tabs take the same two fields.

A form that doesn't name a section of the term gets a 500 (`SectionTabErrorPage`), which ends the session it was sent in.

```ts
import type {
  ClassDetails,
  SectionCatalogDetails,
} from "@workspace/shared/types/reverse-engineered/section-details/index";
```

## `section-relations/`

The section dialog's tabs that relate a section to other courses, sections and people: Instructor/Meeting Times, Restrictions, Prerequisites, Corequisites, Mutual Exclusion and Cross List Courses, the linked-sections lookup, two tabs Temple's page doesn't show (Linked Sections, Syllabus), and the instructor contact card.

Written from 157 sections of three terms, pulled as a guest on 2026-11-18:

| Term   | Name          | Sections |
| ------ | ------------- | -------- |
| 202620 | 2026 Summer I | 8        |
| 202636 | 2026 Fall     | 78       |
| 202703 | 2027 Spring   | 71       |

150 were picked for variety (cross-lists, labs, several instructors, no meetings, campuses…) and 7 because they have corequisites, which are rare. Every route was called for all 157, and the checks run every response (the HTML tabs as the data they parse to) and 54 bad-parameter 500 pages through `tsc` with `satisfies`. The contact cards come from 24 cards, saved redacted: the card's JSON carries the instructor's directory address and Banner record, far more than the card shows, so only display what the class search already shows.

The tabs need no session: send `term=<code>&courseReferenceNumber=<crn>` as an urlencoded `POST` (or `GET`) to `/ssb/searchResults/<tab>`. `getFacultyMeetingTimes` and `fetchLinkedSections` return JSON; the rest return HTML fragments. A bad term or CRN gets a 500 (`SectionRelationErrorPage`), which ends the session.

Instructor `bannerId`s last only for the session that handed them out. To open a contact card, get the instructors from `getFacultyMeetingTimes` (or `searchResults`), then `GET /ssb/contactCard/retrieveData?bannerId=<id>&termCode=<term>` with the same cookies.

```ts
import type { FacultyMeetingTimesResponse } from "@workspace/shared/types/reverse-engineered/section-relations/index";
```

## `course-details/`

`POST /ssb/courseSearchResults/<tab>`, the tabs of the catalog's course dialog: `getCourseCatalogDetails`, `getCourseDescription`, `getCourseAttributes`, `getRestrictions`, `getCorequisites`, `getPrerequisites`, `getCourseMutuallyExclusions` and `getFees`, plus `getSyllabus`, which Temple's page hides.

Each tab answers with an HTML fragment, so the response is a `string`. The types describe the data each fragment carries, with Banner's HTML escapes kept ("&amp;"), unlike `section-details/`. They were written from every tab of 178 courses (135 subjects), pulled as a guest on 2026-11-18:

| Term   | Name          | Courses |
| ------ | ------------- | ------- |
| 202620 | 2026 Summer I | 23      |
| 202636 | 2026 Fall     | 84      |
| 202703 | 2027 Spring   | 71      |

Prerequisites are parsed from Banner's CAPP text into areas, groups and requirements. Syllabus said "No Syllabus Information Available" for every course. The types were checked by running every parsed fragment (1,726, probes included), all 29 captured 500 pages and 549 forms through `tsc` with `satisfies`. A script checked 53 claims in the comments.

No session is needed:

1. `POST /ssb/courseSearchResults/getCourseCatalogDetails` with `term=202703&subjectCode=CIS&courseNumber=2168&first=first`.
2. The other tabs take the same form. `first=first` adds the hidden title spans (`CourseIdentity`).

`term` picks the catalog version in effect, not a term the course is offered in. Catalog, Prerequisites and Fees answer a 500 (`CourseCatalogErrorPage`) when the form doesn't name a course in effect for the term; the other tabs answer 200 with an empty state.

```ts
import type {
  CourseCatalogDetails,
  CoursePrerequisites,
} from "@workspace/shared/types/reverse-engineered/course-details/index";
```

## `common.ts`

Shapes more than one group uses: `Open<Known>`, a code list left open for codes Banner admins add later; `CodeDescription<Code>`, one lookup option; and `BannerErrorPage`, the data in the `<head>` of Banner's 404 and 500 pages. Groups whose routes have their own 500 messages extend it (`LookupErrorPage`, `SectionTabErrorPage`, …).

## Checks

`reverse-engineering/` at the repo root is gitignored scratch: the raw captures of each group, the scripts that pulled and parsed them (`scripts/<group>-*.py`), and discovery's crawl (`discovery/`: every JS bundle, the guest pages, each route's probe and the classified list in `routes-final.json`). Each group's checks are in `checks/<group>/`, `.ts` files that put captured data through the types with `satisfies`. Run them with:

```sh
packages/shared/node_modules/.bin/tsc -p reverse-engineering/checks/<group>/tsconfig.json
```

`checks/routes/`, written by `scripts/routes-checks.py`, checks `routes.ts` against `routes-final.json`.
