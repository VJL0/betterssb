/**
 * Every route a guest can call, keyed by "METHOD path" with paths relative to
 * `/StudentRegistrationSsb`, and the routes that send a guest to sign in.
 * Built from discovery's crawl on 2026-11-18, which classified 165 routes
 * (81 guest, 78 sign-in, 6 broken) from Banner's JS bundles (the five only
 * signed-in pages load included), the guest pages, the user's signed-in HARs
 * and a probe of each, and from each group's captures. A last crawl from
 * `/ssb/registration` reached 61 routes and no new one.
 *
 * `request` is the query string of a GET or the urlencoded form of a POST,
 * every value a string as Banner sends it, or `never` when Banner's page
 * sends nothing. The dialog tabs and `term/search` answer a GET with the same
 * fields the same way. HTML, XML, CSS and plain-text answers are a `string`;
 * the type named in the comment is the data they carry. A request Banner
 * can't serve gets its 500 page instead (a `string`, `BannerErrorPage` or the
 * group's extension of it), and a 500 ends the session.
 *
 * "No session" means the route answered requests without cookies. "A term
 * pick" means the cookies of a session that ran `POST /ssb/term/search`
 * first, which a 500 or a later `term/termSelection` undoes.
 *
 * Open to guests but left out: `POST /ssb/userPreference/saveLocale` and
 * `saveUsageTracking`, which change settings and were never sent with a
 * body. Broken for guests: `GET /ssb/term`, `GET /ssb/contactCard` and
 * `GET /ssb/term/termSelection` without `mode` are 500 pages;
 * `POST /ssb/searchResults/getExtras` (named by the class search page),
 * `GET /ssb/classSearch/get_division`, `GET /ssb/registration/getTerms` and
 * `GET /ssb/term/getTerms` are 404 pages.
 */

import type {
  AboutResponse,
  DateConverterQuery,
  JsonCallbackQuery,
  KeepAliveResponse,
  LocalesResponse,
  MenuQuery,
  ResetDataFormRequest,
  ResetDataFormResponse,
  ServerInfoResponse,
  ShortcutResponse,
  CustomLogoutQuery,
  StorageAccessLogoutResponse,
  ThemeQuery,
  UsageTrackingResponse,
} from "./app/index";
import type {
  GetAttributeResponse,
  GetCampusResponse,
  GetCollegeResponse,
  GetDepartmentResponse,
  GetInstructionalMethodResponse,
  GetInstructorResponse,
  GetLevelResponse,
  GetPartOfTermResponse,
  GetScheduleTypeResponse,
  GetSessionResponse,
  GetSubjectResponse,
  InstructorQuery,
  LookupQuery,
  PagedLookupQuery,
  PartOfTermQuery,
} from "./class-search/index";
import type { CourseDetailsForm } from "./course-details/index";
import type {
  CatalogResetForm,
  CourseSearchGetDivisionResponse,
  CourseSearchGetSubjectResponse,
  CourseSearchResultsQuery,
  CourseSearchResultsResponse,
  ViewSectionsQuery,
  ViewSectionsResponse,
} from "./course-search/index";
import type {
  SearchResultsQuery,
  SearchResultsResponse,
} from "./search-results/index";
import type {
  ClassDetailsForm,
  SectionDetailsForm,
} from "./section-details/index";
import type {
  ContactCardQuery,
  ContactCardResponse,
  FacultyMeetingTimesQuery,
  FacultyMeetingTimesResponse,
  FacultyMeetingTimesWithSection,
  LinkedSectionsQuery,
  LinkedSectionsResponse,
  SectionTabForm,
} from "./section-relations/index";
import type {
  GetTermsQuery,
  GetTermsResponse,
  SaveTermQuery,
  SaveTermResponse,
  TermSearchForm,
  TermSearchQuery,
  TermSearchResponse,
  TermSelectionQuery,
} from "./terms/index";

export interface GuestRoutes {
  /**
   * Where `GET /StudentRegistrationSsb` redirects; a 374-byte page whose meta
   * refresh opens `ssb/registration`. No session.
   */
  "GET /": { request: never; response: string };
  /**
   * The landing page (`LandingConfig`), whose two browse tiles are the only
   * ones that work for a guest. No session; a first visit sets the cookies.
   */
  "GET /ssb/registration": { request: never; response: string };
  /** The same landing page under its full action name. No session. */
  "GET /ssb/registration/registration": { request: never; response: string };
  /**
   * Grails' own Sign In form, where the header's Sign In item lands from the
   * term, class search and catalog pages (also served at
   * `/ssb/term/login/auth`, `/ssb/classSearch/login/auth` and
   * `/ssb/courseSearch/login/auth`). Temple signs in through CAS; never
   * submit it. Opened only from guest sessions.
   */
  "GET /login/auth": { request: never; response: string };
  /**
   * Where `/login/cas` sends a request without a CAS ticket; "OK" is its only
   * text. Opened once, from a guest session.
   */
  "GET /login/error": { request: never; response: string };
  /**
   * The Sign In form's forgot-password target, which Temple's form never
   * shows; a bare GET is the same form asking for a user name. Never send it
   * a username. No session.
   */
  "GET /login/resetPassword": { request: never; response: string };
  /**
   * The log-out-or-return-home prompt (`CustomLogoutPage`) that the
   * `/login/error` page's OK button opens with `error=true`. Leaves the
   * session alone.
   */
  "GET /logout/customLogout": {
    request: CustomLogoutQuery;
    response: string;
  };
  /**
   * Ellucian Experience's unload beacon. bannerWeb sends it only inside
   * Experience's iframe, so never at Temple. No session.
   */
  "GET /storageAccess/logout": {
    request: never;
    response: StorageAccessLogoutResponse;
  };

  /** The About dialog's app name and version. No session. */
  "GET /ssb/about/data": {
    request: JsonCallbackQuery;
    response: AboutResponse;
  };
  /** The About dialog's answering server node. No session. */
  "GET /ssb/serverInfo/index": {
    request: JsonCallbackQuery;
    response: ServerInfoResponse;
  };
  /** The inactivity prompt's "keep alive" button. No session. */
  "GET /ssb/keepAlive/data": { request: never; response: KeepAliveResponse };
  /**
   * The header menu (`menuEndPoint`), XML that is always
   * `<NavigationEntries />` for a guest (`NavigationEntry` is what a
   * signed-in menu holds). No session.
   */
  "GET /ssb/selfServiceMenu/data": { request: never; response: string };
  /** The "My Banner" menu feed, XML; the same empty list for a guest. No session. */
  "GET /ssb/menu": { request: MenuQuery; response: string };
  /** The keyboard-shortcut dialog; Temple configures none. No session. */
  "GET /ssb/shortcut/data": { request: never; response: ShortcutResponse };
  /**
   * The app's copy of Temple's theme CSS. Banner's pages link Ellucian's
   * theme server instead, so they never call it. No session.
   */
  "GET /ssb/theme/getTheme": { request: ThemeQuery; response: string };
  /**
   * Islamic-calendar conversion for the date pickers, as plain text.
   * Temple's pages never call it because its i18n names only "gregorian". No
   * session.
   */
  "GET /ssb/dateConverter": { request: DateConverterQuery; response: string };
  /** The same converter under its `data` action. No session. */
  "GET /ssb/dateConverter/data": {
    request: DateConverterQuery;
    response: string;
  };
  /** Usage-tracking consent (`usageTrackingURL`); a guest gets `{}`. No session. */
  "GET /ssb/userPreference/fetchUsageTracking": {
    request: never;
    response: UsageTrackingResponse;
  };
  /** The Tools menu's language picker. No session. */
  "GET /ssb/userPreference/locales": {
    request: never;
    response: LocalesResponse;
  };

  /**
   * The "Select a Term" page (`TermSelectionPage`) of Browse Classes
   * (`mode=search`) or the catalog (`mode=courseSearch`). Opening it clears
   * the session's term pick. For a guest the sign-in modes are a
   * `LandingRedirectPath` and no `mode` is a 500. No session.
   */
  "GET /ssb/term/termSelection": {
    request: TermSelectionQuery;
    response: string;
  };
  /**
   * The term page's Continue: picks the session's term and answers the mode
   * page's `fwdURL`. Every search needs it first. `mode` goes in the query
   * string, the rest in the form. No session; the first call sets the
   * cookies.
   */
  "POST /ssb/term/search": {
    request: TermSearchQuery & TermSearchForm;
    response: TermSearchResponse;
  };
  /**
   * The term picker's save on change. Guest pages never call it, and it
   * changed nothing visible (no term pick). No session.
   */
  "GET /ssb/term/saveTerm": {
    request: SaveTermQuery;
    response: SaveTermResponse;
  };
  /** The class search's term picker. No session. */
  "GET /ssb/classSearch/getTerms": {
    request: GetTermsQuery;
    response: GetTermsResponse;
  };
  /** The catalog's term picker, which adds the orientation terms. No session. */
  "GET /ssb/courseSearch/getTerms": {
    request: GetTermsQuery;
    response: GetTermsResponse;
  };

  /**
   * The Browse Classes page (`ClassSearchBootstraps`). Needs a term pick;
   * without one it redirects to the landing page.
   */
  "GET /ssb/classSearch/classSearch": { request: never; response: string };
  /** The controller's default action, the same page (one call, after a term pick). */
  "GET /ssb/classSearch": { request: never; response: string };
  /**
   * The class search, one page of sections. Needs a term pick, and caches the
   * session's first search until `resetDataForm`. In a `mode=courseSearch`
   * session the same route is the catalog's "View Sections"
   * (`ViewSectionsQuery`, `ViewSectionsResponse`).
   */
  "GET /ssb/searchResults/searchResults": {
    request: SearchResultsQuery | ViewSectionsQuery;
    response: SearchResultsResponse | ViewSectionsResponse;
  };
  /**
   * The controller's default action: with no `txt_term` it answers
   * `SearchResultsOtherTerm` (one call, after a term pick).
   */
  "GET /ssb/searchResults": {
    request: never;
    response: SearchResultsResponse;
  };
  /**
   * "Search Again": empties the session's cached sections and keeps its term
   * pick. Needs the session it resets.
   */
  "POST /ssb/classSearch/resetDataForm": {
    request: ResetDataFormRequest;
    response: ResetDataFormResponse;
  };
  /**
   * The Subject picker, paged by `offset` and `max`; without either it is a
   * 500 (`LookupErrorPage`). No session.
   */
  "GET /ssb/classSearch/get_subject": {
    request: PagedLookupQuery;
    response: GetSubjectResponse;
  };
  /**
   * The Campus picker, whole whatever the paging says. Its codes filter by
   * the section's campus. No term pick needed.
   */
  "GET /ssb/classSearch/get_campus": {
    request: LookupQuery;
    response: GetCampusResponse;
  };
  /** The College picker. No term pick needed. */
  "GET /ssb/classSearch/get_college": {
    request: LookupQuery;
    response: GetCollegeResponse;
  };
  /** The Attribute picker. No term pick needed. */
  "GET /ssb/classSearch/get_attribute": {
    request: LookupQuery;
    response: GetAttributeResponse;
  };
  /** The Instructional Method picker. No term pick needed. */
  "GET /ssb/classSearch/get_instructionalMethod": {
    request: LookupQuery;
    response: GetInstructionalMethodResponse;
  };
  /**
   * The Instructor picker. Its codes are numbers the cookie session hands
   * out, so call it and `searchResults` with the same cookies: a code from
   * another session makes the search a 500.
   */
  "GET /ssb/classSearch/get_instructor": {
    request: InstructorQuery;
    response: GetInstructorResponse;
  };
  /** The Part of Term picker; without a `term` key it is a 500. No term pick needed. */
  "GET /ssb/classSearch/get_partOfTerm": {
    request: PartOfTermQuery;
    response: GetPartOfTermResponse;
  };
  /** The Session (day, evening, weekend) picker. No term pick needed. */
  "GET /ssb/classSearch/get_session": {
    request: LookupQuery;
    response: GetSessionResponse;
  };
  /** No picker on Temple's page, and always `[]`. No term pick needed. */
  "GET /ssb/classSearch/get_department": {
    request: LookupQuery;
    response: GetDepartmentResponse;
  };
  /** No picker on Temple's page, and always `[]`. No term pick needed. */
  "GET /ssb/classSearch/get_level": {
    request: LookupQuery;
    response: GetLevelResponse;
  };
  /** No picker on Temple's page, and always `[]`. No term pick needed. */
  "GET /ssb/classSearch/get_scheduleType": {
    request: LookupQuery;
    response: GetScheduleTypeResponse;
  };

  /**
   * The section dialog's Class Details tab (`ClassDetails`), the one it opens
   * on. No session; a form that doesn't name a section of the term is a 500
   * (`SectionTabErrorPage`).
   */
  "POST /ssb/searchResults/getClassDetails": {
    request: ClassDetailsForm;
    response: string;
  };
  /** Course Description tab: the catalog text plus the section's own. No session. */
  "POST /ssb/searchResults/getCourseDescription": {
    request: SectionDetailsForm;
    response: string;
  };
  /** Catalog tab: the course's entry as of the section's term. No session. */
  "POST /ssb/searchResults/getSectionCatalogDetails": {
    request: SectionDetailsForm;
    response: string;
  };
  /** Attributes tab, the row's `sectionAttributes` again. No session. */
  "POST /ssb/searchResults/getSectionAttributes": {
    request: SectionDetailsForm;
    response: string;
  };
  /** Bookstore tab: one bkstr.com link. No session. */
  "POST /ssb/searchResults/getSectionBookstoreDetails": {
    request: SectionDetailsForm;
    response: string;
  };
  /** Fees tab, every fee where the row shows only the largest. No session. */
  "POST /ssb/searchResults/getFees": {
    request: SectionDetailsForm;
    response: string;
  };
  /** Enrollment/Waitlist tab: the row's six seat counts. No session. */
  "POST /ssb/searchResults/getEnrollmentInfo": {
    request: SectionDetailsForm;
    response: string;
  };
  /**
   * Instructor/Meeting Times tab, sent with `$.getJSON`. No session, but its
   * `bannerId`s only work in the session that got them. `first=first` adds
   * the section object.
   */
  "GET /ssb/searchResults/getFacultyMeetingTimes": {
    request: FacultyMeetingTimesQuery;
    response: FacultyMeetingTimesResponse | FacultyMeetingTimesWithSection;
  };
  /**
   * Restrictions tab. No session; a bad term or CRN is a 500
   * (`SectionRelationErrorPage`).
   */
  "POST /ssb/searchResults/getRestrictions": {
    request: SectionTabForm;
    response: string;
  };
  /** Prerequisites tab, a CAPP rule table or an empty state. No session. */
  "POST /ssb/searchResults/getSectionPrerequisites": {
    request: SectionTabForm;
    response: string;
  };
  /** Corequisites tab; rows are rare. No session. */
  "POST /ssb/searchResults/getCorequisites": {
    request: SectionTabForm;
    response: string;
  };
  /** Mutual Exclusion tab. No session. */
  "POST /ssb/searchResults/getCourseMutuallyExclusions": {
    request: SectionTabForm;
    response: string;
  };
  /** Cross List Courses tab: the group's other sections. No session. */
  "POST /ssb/searchResults/getXlstSections": {
    request: SectionTabForm;
    response: string;
  };
  /** The linked-sections dialog; `linkedData` was empty for every section sampled. No session. */
  "GET /ssb/searchResults/fetchLinkedSections": {
    request: LinkedSectionsQuery;
    response: LinkedSectionsResponse;
  };
  /** Linked Sections tab, which Temple's page doesn't render. No session. */
  "POST /ssb/searchResults/getLinkedSections": {
    request: SectionTabForm;
    response: string;
  };
  /** Syllabus tab, which Temple's page doesn't render. No session. */
  "POST /ssb/searchResults/getSyllabus": {
    request: SectionTabForm;
    response: string;
  };
  /**
   * The instructor contact card. Needs the cookies of the session that handed
   * out the `bannerId`, but no term pick. It answers far more about the
   * instructor than the card shows.
   */
  "GET /ssb/contactCard/retrieveData": {
    request: ContactCardQuery;
    response: ContactCardResponse;
  };

  /**
   * The Browse Course Catalog page (`CourseSearchBootstraps`). Needs a term
   * pick in either mode; without one it redirects to the landing page.
   */
  "GET /ssb/courseSearch/courseSearch": { request: never; response: string };
  /** The controller's default action, the same page (one call, after a term pick). */
  "GET /ssb/courseSearch": { request: never; response: string };
  /**
   * The catalog search, one page of courses. Needs a term pick in either
   * mode, and caches the session's first search until `resetDataForm`.
   */
  "GET /ssb/courseSearchResults/courseSearchResults": {
    request: CourseSearchResultsQuery;
    response: CourseSearchResultsResponse;
  };
  /**
   * The controller's default action: the session's cached catalog search
   * with default paging (one call: `totalCount` 64 but `data` empty,
   * `pageMaxSize` 20).
   */
  "GET /ssb/courseSearchResults": {
    request: never;
    response: CourseSearchResultsResponse;
  };
  /**
   * "Search Again" and "Return to catalog": empty the cached courses, the
   * cached sections or both. Needs the session it resets.
   */
  "POST /ssb/courseSearch/resetDataForm": {
    request: CatalogResetForm;
    response: ResetDataFormResponse;
  };
  /**
   * The catalog's Subject picker, every subject of the term's catalog; without
   * `offset` or `max` it is a 500. No session.
   */
  "GET /ssb/courseSearch/get_subject": {
    request: PagedLookupQuery;
    response: CourseSearchGetSubjectResponse;
  };
  /** The catalog's College picker, the class search's list. No session. */
  "GET /ssb/courseSearch/get_college": {
    request: LookupQuery;
    response: GetCollegeResponse;
  };
  /** The catalog's Division picker, always GR and UG. No session. */
  "GET /ssb/courseSearch/get_division": {
    request: LookupQuery;
    response: CourseSearchGetDivisionResponse;
  };
  /** The catalog's Attribute picker, the class search's list. No session. */
  "GET /ssb/courseSearch/get_attribute": {
    request: LookupQuery;
    response: GetAttributeResponse;
  };
  /** No picker on Temple's catalog page, and always `[]`. No session. */
  "GET /ssb/courseSearch/get_department": {
    request: LookupQuery;
    response: GetDepartmentResponse;
  };
  /** No picker on Temple's catalog page, and always `[]`. No session. */
  "GET /ssb/courseSearch/get_level": {
    request: LookupQuery;
    response: GetLevelResponse;
  };
  /** No picker on Temple's catalog page, and always `[]`. No session. */
  "GET /ssb/courseSearch/get_scheduleType": {
    request: LookupQuery;
    response: GetScheduleTypeResponse;
  };

  /**
   * The course dialog's Catalog tab (`CourseCatalogDetails`). No session;
   * `term` picks the catalog version in effect, and a form that names no
   * course in effect is a 500 (`CourseCatalogErrorPage`).
   */
  "POST /ssb/courseSearchResults/getCourseCatalogDetails": {
    request: CourseDetailsForm;
    response: string;
  };
  /** Course Description tab; a bad form gets the empty state. No session. */
  "POST /ssb/courseSearchResults/getCourseDescription": {
    request: CourseDetailsForm;
    response: string;
  };
  /** Attributes tab; a bad form gets the empty state. No session. */
  "POST /ssb/courseSearchResults/getCourseAttributes": {
    request: CourseDetailsForm;
    response: string;
  };
  /** Restrictions tab; a bad form gets the empty state. No session. */
  "POST /ssb/courseSearchResults/getRestrictions": {
    request: CourseDetailsForm;
    response: string;
  };
  /** Corequisites tab; a bad form gets the empty state. No session. */
  "POST /ssb/courseSearchResults/getCorequisites": {
    request: CourseDetailsForm;
    response: string;
  };
  /**
   * Prerequisites tab, CAPP text parsed into areas. No session; a bad form is
   * a 500 (`CourseCatalogErrorPage`).
   */
  "POST /ssb/courseSearchResults/getPrerequisites": {
    request: CourseDetailsForm;
    response: string;
  };
  /** Mutual Exclusion tab; a bad form gets the empty state. No session. */
  "POST /ssb/courseSearchResults/getCourseMutuallyExclusions": {
    request: CourseDetailsForm;
    response: string;
  };
  /** Fees tab. No session; a bad form is a 500 (`CourseCatalogErrorPage`). */
  "POST /ssb/courseSearchResults/getFees": {
    request: CourseDetailsForm;
    response: string;
  };
  /**
   * Syllabus tab, which Temple's page doesn't render; empty for every course
   * and form tried. No session.
   */
  "POST /ssb/courseSearchResults/getSyllabus": {
    request: CourseDetailsForm;
    response: string;
  };
}

/**
 * Routes that answer a guest with a 302 to Temple's CAS login (the exact
 * `Location` is in `SignInRedirectPath`). The ones that change registration
 * or plan state were never requested as a guest; every action of their
 * controllers that was probed redirected. What each does comes from Banner's
 * JS bundles and pages, with the user's signed-in HARs where they hold it.
 *
 * The other sign-in routes don't reach CAS: the `registration`, `plan` and
 * `preReg` modes of `term/termSelection` redirect to the landing page
 * (`LandingRedirectPath`), `GET /logout` is a 500 page, `GET /login/cas`
 * without a ticket goes to `/login/error`, and `POST /login/authenticate`
 * takes credentials and was never called.
 */
export type SignInRoute =
  /** The `/ssb` root (and `/ssb/`), not a page. */
  | "GET /ssb"
  /** Shown when an app meant for Ellucian Experience opens outside its iframe. */
  | "GET /error/standaloneApplication"
  /** Where the header's Sign In item lands from the landing page. */
  | "GET /ssb/login/auth"
  /** Where the inactivity prompt goes when nobody answers; 302 to `timeoutPage` first. */
  | "GET /logout/timeout"
  /** The timed-out page `/logout/timeout` forwards to. */
  | "GET /ssb/logout/timeoutPage"
  /**
   * Target of the Register, Plan and Prepare tiles; signed in, it forwards to
   * `term/termSelection` in that mode (HAR). Redirects for `mode=search` too.
   */
  | "GET /ssb/registration/registerPostSignIn"
  /** The View Registration Information page (`a#regHistoryLink`). */
  | "GET /ssb/registrationHistory/registrationHistory"
  /** Its term picker's list (never called signed in, so unseen). */
  | "GET /ssb/registrationHistory/getTerms"
  /** The Prepare for Registration page that `term/search?mode=preReg` forwards to. */
  | "GET /ssb/prepareRegistration/prepareRegistration"
  /** Its term picker's list (never called signed in, so unseen). */
  | "GET /ssb/prepareRegistration/getTerms"
  /** The contact card's photo, even in a session that picked a term. */
  | "GET /ssb/registrationPicture/picture"
  /** The Help link's base URL, even with `X-Requested-With`. */
  | "GET /ssb/help/url"
  /** Banner's i18n message bundle. */
  | "GET /ssb/i18n"
  /** Where the header's brand link goes when `globalGuestProxyBaseURL` is set. */
  | "GET /ssb/proxy/onReturn"
  /** Switches the signed-in user's persona; a bare guest GET redirected. */
  | "POST /ssb/personaSelection/selectPersona"
  /** Security question setup. */
  | "GET /ssb/securityQA"
  /** The signed-in user's student attributes. */
  | "GET /ssb/studentAttributes"
  /** Banner's survey page. */
  | "GET /ssb/survey/survey"
  /** Records that the user answered or dismissed the survey (bannerWeb). */
  | "GET /ssb/survey/updateSurveyStatus"
  /** The Experience beacon under `/ssb`, bannerCommon's literal. */
  | "GET /ssb/storageAccess/logout"
  /** The Tools menu's theme editor (admin). */
  | "GET /ssb/themeEditor"
  /** The Tools menu's i18n properties upload (admin). */
  | "GET /ssb/uploadProperties"
  /** Web App Extensibility metadata for page customisations. */
  | "GET /ssb/webAppExtensibility"
  /** The menu XML the header falls back to after `/ssb/menu`. */
  | "GET /ssb/xml/navigation.xml"
  /** The theme route outside `/ssb`; `/ssb/theme/getTheme` is open. */
  | "GET /theme/getTheme"
  /** bannerWeb's extension loader. */
  | "GET /webadmin/extensions"
  /** The Register for Classes page. */
  | "GET /ssb/classRegistration/classRegistration"
  /** Term list of the registration term picker (signed in: `GetTermsResponse`, HAR). */
  | "GET /ssb/classRegistration/getTerms"
  /** The Summary panel's items. */
  | "GET /ssb/classRegistration/getRegistrationItems"
  /** Calendar events of the Schedule tab. */
  | "GET /ssb/classRegistration/getRegistrationEvents"
  /** Meeting details for the schedule's list view. */
  | "GET /ssb/classRegistration/getMeetingInformationForRegistrations"
  /** Looks up a CRN typed into Enter CRNs before it is added. */
  | "GET /ssb/classRegistration/getSectionDetailsFromCRN"
  /** The student's plans for the Plans tab. */
  | "GET /ssb/classRegistration/getPlans"
  /** The Plans panel. */
  | "GET /ssb/classRegistration/renderMyPlans"
  /** The Schedule and Options panel. */
  | "GET /ssb/classRegistration/renderMySchedule"
  /** The tuition and fee detail dialog. */
  | "GET /ssb/classRegistration/renderTuitionFeeDetail"
  /** The schedule's Print button. */
  | "GET /ssb/classRegistration/print"
  /** The schedule's Email button; sends an email, so never requested. */
  | "GET /ssb/classRegistration/email"
  /** An open-learning section's end date from its start date. */
  | "GET /ssb/classRegistration/getOLREndDate"
  /** An open-learning section's start date from its end date. */
  | "GET /ssb/classRegistration/getOLRStartDate"
  /** Opens the multi-term registration dialog. */
  | "GET /ssb/classRegistration/getMultiTermPopup"
  /** Enter CRNs' Add to Summary (HAR: 11 POSTs, all 200 JSON). Never requested. */
  | "POST /ssb/classRegistration/addCRNRegistrationItems"
  /** A search result's Add button: one section into the summary. Never requested. */
  | "GET /ssb/classRegistration/addRegistrationItem"
  /** The linked-sections dialog's Add All. Never requested. */
  | "GET /ssb/classRegistration/addAllLinkedSections"
  /** Confirms the drops Banner makes along with a change. Never requested. */
  | "GET /ssb/classRegistration/autoDropConfirm"
  /** Opens the authorization-code dialog for an item being added. Never requested. */
  | "POST /ssb/classRegistration/getAddAuthorizationRegistrationItem"
  /** Submits or cancels the typed authorization codes. Never requested. */
  | "GET /ssb/classRegistration/finishAddAuthorizationPopup"
  /** Opens the open-learning dates dialog for an item being added. Never requested. */
  | "POST /ssb/classRegistration/getOLRRegistrationItem"
  /** Confirms the open-learning dates picked. Never requested. */
  | "GET /ssb/classRegistration/finishOLRPopup"
  /**
   * Adds the sections picked across several terms to the summary
   * (`#saveButton[data-multi-registration-endpoint]`): `dataMap` is JSON,
   * `[{"register":"true"}, {"term", "courseReferenceNumber"}…]`, and the
   * answer's `aaData` holds each term's registrations and failures.
   * Requested only bare, as a guest.
   */
  | "GET /ssb/classRegistration/addMultiTermClassRegistrations"
  /** Confirms or cancels multi-term registration. Never requested. */
  | "GET /ssb/classRegistration/finishMultiTermPopup"
  /** Checks the alternate PINs typed in the multi-term dialog. Never requested. */
  | "GET /ssb/classRegistration/multiTermPopupAltPins"
  /** Discards the summary's unsaved changes (HAR: 1 GET). Never requested. */
  | "GET /ssb/classRegistration/reset"
  /**
   * The summary's Submit: registers, drops and changes sections. The page
   * names `submitRegistration`; bannerWeb's batch sync appends `/batch`
   * (HAR: 33 POSTs). Never requested.
   */
  | "POST /ssb/classRegistration/submitRegistration/batch"
  /** Submit for one term's summary when several terms are open. Never requested. */
  | "POST /ssb/classRegistration/submitSummaryRegistration"
  /** Submit for the multi-term summary. Never requested. */
  | "POST /ssb/classRegistration/submitMultiSummaryRegistration"
  /** The Plan Ahead start page listing the student's plans. */
  | "GET /ssb/plan/selectPlan"
  /** The Plan Ahead editor. */
  | "GET /ssb/plan/plan"
  /** Term list of the planning term picker (signed in: `GetTermsResponse`, HAR). */
  | "GET /ssb/plan/getTerms"
  /** The plan's items. */
  | "GET /ssb/plan/getRegistrationItems"
  /** Calendar events of the plan being edited. */
  | "GET /ssb/plan/getPlanEvents"
  /** Meeting details of the plan's sections. */
  | "GET /ssb/plan/getMeetingInformationForPlan"
  /** Open-learning end date for a planned section. */
  | "GET /ssb/plan/getOLREndDate"
  /** Open-learning start date for a planned section. */
  | "GET /ssb/plan/getOLRStartDate"
  /** Adds a course or section to the plan (HAR: 1 POST). Never requested. */
  | "POST /ssb/plan/addPlanItem"
  /** Adds a whole linked-section group to the plan. Never requested. */
  | "GET /ssb/plan/addAllPlannedLinkedSections"
  /** Opens the open-learning dates dialog for a planned section. Never requested. */
  | "POST /ssb/plan/getOLRRegistrationItem"
  /** Confirms the open-learning dates of a planned section. Never requested. */
  | "GET /ssb/plan/finishOLRPopup"
  /** Saves the note on a plan or a plan item. Never requested. */
  | "POST /ssb/plan/savePlanNote"
  /** Marks a plan as the preferred one. Never requested. */
  | "POST /ssb/plan/makePreferred"
  /** Deletes a plan from the start page. Never requested. */
  | "POST /ssb/plan/delete"
  /** Saves the plan being edited; `/batch` as for `submitRegistration`. Never requested. */
  | "POST /ssb/plan/submitPlan/batch";
