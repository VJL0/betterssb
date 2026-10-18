/**
 * Types matching the Ellucian Self-Service Banner (SSB) JSON API responses.
 * Derived from HAR capture of prd-xereg.temple.edu.
 */

// ── Terms ───────────────────────────────────────────────────

export interface SSBCodeDescription {
  code: string;
  description: string;
}

export type SSBTerm = SSBCodeDescription;

// ── Section / search results ────────────────────────────────────────────────

export interface SSBFaculty {
  bannerId: string;
  courseReferenceNumber: string;
  displayName: string;
  emailAddress: string;
  primaryIndicator: boolean;
  term: string;
}

export interface SSBMeetingTime {
  /** "HHMM", or null for online and TBA sections. */
  beginTime: string | null;
  endTime: string | null;
  building: string;
  buildingDescription: string;
  campus: string;
  campusDescription: string;
  room: string;
  creditHourSession: number;
  hoursWeek: number;
  meetingType: string;
  meetingTypeDescription: string;
  startDate: string;
  endDate: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
}

export interface SSBMeetingFaculty {
  category: string;
  courseReferenceNumber: string;
  meetingTime: SSBMeetingTime;
  term: string;
}

export interface SSBSection {
  id: number;
  term: string;
  termDesc: string;
  courseReferenceNumber: string;
  partOfTerm: string;
  courseNumber: string;
  courseDisplay: string;
  subject: string;
  subjectDescription: string;
  sequenceNumber: string;
  campusDescription: string;
  scheduleTypeDescription: string;
  courseTitle: string;
  creditHours: number | null;
  creditHourLow: number;
  creditHourHigh: number | null;
  maximumEnrollment: number;
  enrollment: number;
  seatsAvailable: number;
  waitCapacity: number;
  waitCount: number;
  waitAvailable: number;
  openSection: boolean;
  subjectCourse: string;
  faculty: SSBFaculty[];
  meetingsFaculty: SSBMeetingFaculty[];
  instructionalMethod: string;
  instructionalMethodDescription: string;
  feeAmount: number | null;
  crossList: string | null;
  crossListCapacity: number | null;
  crossListCount: number | null;
  isSectionLinked: boolean;
  /** Groups linked sections (a lecture and its required lab); null when unlinked. */
  linkIdentifier: string | null;
  sectionAttributes: { code: string; description: string }[];
}

// ── Plan Ahead ──────────────────────────────────────────────────────────────

export interface SSBPlanAction {
  description: string;
  isDeleteAction: boolean;
  planCourseStatus: string;
}

// ── Class Registration (Register / Add-Drop) ────────────────────────────────

export interface SSBRegPlanCourse {
  activeIndicator: boolean;
  attached: boolean;
  courseDisplay: string;
  courseNumber: string;
  courseReferenceNumber: string;
  courseTitle: string;
  creditHours: number;
  gradingMode: string;
  gradingModeDescription: string;
  instructionalMethod: string;
  instructionalMethodDescription: string;
  instructors: SSBFaculty[];
  isRegistered: boolean;
  partOfTerm: string;
  partOfTermDescription: string;
  partOfTermStartDate: string;
  partOfTermEndDate: string;
  planNumber: number;
  planStatus: string;
  scheduleType: string;
  scheduleTypeDescription: string;
  section: string;
  sequenceNumber: number;
  subject: string;
  term: string;
  availableActions: SSBPlanAction[];
  authorizationRequired: boolean;
  criticalIndicator: boolean;
}

export interface SSBRegPlanHeader {
  id: number;
  description: string;
  editable: boolean;
  lastModified: string;
  preferredIndicator: boolean;
  sequenceNumber: number;
  sourceFormatName: string;
  sourcePersona: string;
  term: string;
  totalPlannedCreditHours: number;
  totalRegisteredHours: number;
  planCourses: SSBRegPlanCourse[];
}

export interface SSBGetPlansResponse {
  plans: SSBRegPlanHeader[];
  selectPlanConfig: {
    config: string;
    display: string;
    title: string;
    required: boolean;
    width: string;
  }[];
  getThirdPartyData: boolean;
}

export interface SSBAddCRNResult {
  success: boolean;
  term: string;
  courseReferenceNumber: string;
  model: unknown;
  message: string;
}

export interface SSBAddCRNRegistrationResponse {
  aaData: SSBAddCRNResult[];
  anyOLR: unknown[];
  anyAuthorizationRequired: unknown[];
}

/**
 * Payload for POST /classRegistration/submitRegistration/batch.
 *
 * The `update` array holds the full RegistrationTemporaryView model objects
 * returned by `addRegistrationItem` (or `addCRNRegistrationItems`).
 * The client passes these through opaquely.
 */
export interface SSBSubmitRegistrationBatchPayload {
  create: unknown[];
  update: unknown[];
  destroy: unknown[];
  uniqueSessionId: string;
}
