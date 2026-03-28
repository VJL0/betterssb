/**
 * Types matching the Ellucian Self-Service Banner (SSB) JSON API responses.
 * Derived from HAR capture of prd-xereg.temple.edu.
 */

// ── Lookup / Filter types ───────────────────────────────────────────────────

export interface SSBCodeDescription {
  code: string;
  description: string;
}

export type SSBTerm = SSBCodeDescription;
export type SSBSubject = SSBCodeDescription;
export type SSBCollege = SSBCodeDescription;
export type SSBDivision = SSBCodeDescription;
export type SSBAttribute = SSBCodeDescription;

// ── Course catalog search ───────────────────────────────────────────────────

export interface SSBCourse {
  id: number;
  termEffective: string;
  courseNumber: string;
  courseDisplay: string;
  subject: string;
  subjectCode: string;
  college: string;
  collegeCode: string;
  department: string;
  departmentCode: string;
  courseTitle: string;
  creditHourHigh: number | null;
  creditHourLow: number;
  creditHourIndicator: string | null;
  subjectDescription: string;
  courseDescription: string;
  division: string;
  termStart: string;
  termEnd: string;
  preRequisiteCheckMethodCde: string;
}

export interface SSBCourseSearchResponse {
  success: boolean;
  totalCount: number;
  data: SSBCourse[];
  pageOffset: number;
  pageMaxSize: number;
  coursesFetchedCount: number;
  pathMode: string;
}

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
  beginTime: string;
  endTime: string;
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
  sectionAttributes: { code: string; description: string }[];
}

export interface SSBSectionSearchResponse {
  success: boolean;
  totalCount: number;
  data: SSBSection[];
  pageOffset: number;
  pageMaxSize: number;
  sectionsFetchedCount: number;
  pathMode: string;
}

// ── Enrollment info ─────────────────────────────────────────────────────────

export interface SSBEnrollmentInfo {
  maximumEnrollment: number;
  enrollment: number;
  seatsAvailable: number;
  waitCapacity: number;
  waitCount: number;
  waitAvailable: number;
}

// ── Contact card (instructor details) ───────────────────────────────────────

export interface SSBContactCard {
  name: string;
  email: string;
  phone: string;
  office: string;
}

// ── Search filter params ────────────────────────────────────────────────────

export interface SSBCourseSearchParams {
  txt_subject?: string;
  txt_courseNumber?: string;
  txt_term: string;
  txt_college?: string;
  txt_division?: string;
  txt_attribute?: string;
  txt_keywordall?: string;
  txt_courseTitle?: string;
  txt_course_number_range_From?: string;
  txt_course_number_range_To?: string;
  txt_credithourlow?: string;
  txt_credithourhigh?: string;
  pageOffset?: number;
  pageMaxSize?: number;
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
}

export interface SSBSectionSearchParams {
  txt_subjectcoursecombo?: string;
  txt_subject?: string;
  txt_courseNumber?: string;
  txt_term: string;
  txt_college?: string;
  txt_division?: string;
  txt_attribute?: string;
  pageOffset?: number;
  pageMaxSize?: number;
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
}

// ── Plan Ahead ──────────────────────────────────────────────────────────────

export interface SSBPlanAction {
  description: string;
  isDeleteAction: boolean;
  planCourseStatus: string;
}

export interface SSBPlanCourse {
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
  partOfTerm: string;
  partOfTermDescription: string;
  partOfTermStartDate: string;
  partOfTermEndDate: string;
  planStatus: string;
  scheduleType: string;
  scheduleTypeDescription: string;
  subject: string;
  term: string;
  section?: string;
  availableActions: SSBPlanAction[];
  id: number | null;
  isRegistered: boolean;
}

export interface SSBAddPlanItemResponse {
  success: boolean;
  model: SSBPlanCourse;
}

export interface SSBPlanEvent {
  courseReferenceNumber: string;
  courseNumber: string;
  courseTitle: string;
  subject: string;
  creditHours: number;
  term: string;
  section?: string;
  meetingTime?: SSBMeetingTime;
  faculty?: SSBFaculty[];
  category?: string;
}

export interface SSBPlanBatchPayload {
  create: SSBPlanCourse[];
  update: SSBPlanCourse[];
  destroy: SSBPlanCourse[];
  uniqueSessionId: string;
}

export interface SSBSaveTermParams {
  mode: string;
  term: string;
  uniqueSessionId: string;
}

// ── Registration History ────────────────────────────────────────────────────

export interface SSBRegistration {
  courseReferenceNumber: string;
  courseNumber: string;
  courseDisplay: string;
  courseTitle: string;
  subject: string;
  subjectDescription: string;
  sequenceNumber: string;
  creditHour: number;
  billHour: number;
  grade: string | null;
  gradeMidTerm: string | null;
  statusIndicator: string;
  statusDescription: string;
  courseRegistrationStatusDescription: string;
  termDescription: string;
  campusDescription: string;
  scheduleDescription: string;
  instructionalMethodDescription: string;
  gradingModeDescription: string;
  levelDescription: string;
  partOfTermDescription: string;
  startDate: string;
  completionDate: string;
  addDate: string;
  registrationStatusDate: string;
  instructorNames: string[];
  faculty: SSBFaculty[];
  meetingTimes: SSBMeetingTime[];
  term: string;
}

export interface SSBRegistrationHistoryResponse {
  data: {
    registrations: SSBRegistration[];
    totalCredit: string;
    totalBill: string;
    totalCeu: string;
    minHours: string;
    maxHours: string;
  };
}

export interface SSBRegistrationEvent {
  id: number;
  title: string;
  start: string;
  end: string;
  editable: boolean;
  allDay: boolean;
  className: string;
  term: string;
  crn: string;
  subject: string;
  courseNumber: string;
}

export interface SSBRegistrationSection {
  billHours: number;
  campus: string;
  campusDescription: string;
  courseDisplay: string;
  courseNumber: string;
  courseReferenceNumber: string;
  courseTitle: string;
  creditHours: number;
  faculty: SSBFaculty[];
  meetingTimes: SSBMeetingTime[];
  meetingsFaculty: SSBMeetingFaculty[];
  scheduleType: string;
  scheduleTypeDescription: string;
  sequenceNumber: string;
  subject: string;
  subjectCourse: string;
  subjectDescription: string;
  term: string;
  gradingMode: string;
  gradingModeDescription: string;
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

export interface SSBAddRegistrationItemResponse {
  success: boolean;
  courseReferenceNumber: string;
  model: unknown;
  message: string;
}

export interface SSBFeeSummaryItem {
  code: string;
  detail: string;
  feeAmount: string;
  description: string | null;
  courseReferenceNumber: string | null;
}

export interface SSBTuitionFeeResponse {
  data: {
    currencies: {
      feeSummaryList: SSBFeeSummaryItem[];
      totalAmount: number;
      totalAmountFormatted: string;
      currencyCode: string;
      isCurrencyValid: boolean;
    }[];
    totalCreditHours: string;
    term: string;
  };
}

export interface SSBTermSearchParams {
  term: string;
  studyPath?: string;
  studyPathText?: string;
  altPin?: string;
  startDatepicker?: string;
  endDatepicker?: string;
  uniqueSessionId: string;
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
