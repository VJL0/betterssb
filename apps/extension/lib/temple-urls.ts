/**
 * Temple University's Banner, Banner Self-Service, DARS and TUportal, the
 * only sites the extension reaches. Plain constants, so wxt.config.ts can
 * read them at build time too.
 */

export const BANNER_ORIGIN = "https://prd-xereg.temple.edu";
/** Banner's registration pages: the content script, host permission and tab lookups. */
export const BANNER_PAGES = `${BANNER_ORIGIN}/StudentRegistrationSsb/*`;
/**
 * Banner's "Register for Classes" entry: signs the student in if needed and
 * lands on term selection. Not the `/ssb/registration` landing page, which
 * ends a signed-in session.
 */
export const BANNER_REGISTRATION_URL = `${BANNER_ORIGIN}/StudentRegistrationSsb/ssb/registration/registerPostSignIn?mode=registration`;

/**
 * Self-Service Banner's other app, StudentSelfService, with its own session
 * and sign-in: the student's academic transcript.
 */
export const SELF_SERVICE_ORIGIN = "https://prd-xe.temple.edu";
export const SELF_SERVICE_PAGES = `${SELF_SERVICE_ORIGIN}/StudentSelfService/*`;
/** All levels (`level=`) of the Advising Transcript (`type=ADV`), as Self-Service's own page asks. */
export const TRANSCRIPT_DATA_URL = `${SELF_SERVICE_ORIGIN}/StudentSelfService/ssb/academicTranscript/academicTranscriptPageData?level=&type=ADV`;

export const DARS_ORIGIN = "https://prd-dars.temple.edu";
export const DARS_PAGES = `${DARS_ORIGIN}/selfservice/*`;

export const TUPORTAL_ORIGIN = "https://tuportal6.temple.edu";
export const TUPORTAL_PAGES = `${TUPORTAL_ORIGIN}/*`;
/** TUportal's priority registration countdown: the student's registration time per term. */
export const PRIORITY_REGISTRATION_URL = `${TUPORTAL_ORIGIN}/html/TEMPLE/apps/tup/Countdown/PriorityRegistration/PriorityRegistration.jsp`;
