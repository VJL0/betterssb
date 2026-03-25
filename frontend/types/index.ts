// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  pictureUrl: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// ---------------------------------------------------------------------------
// Courses & Sections
// ---------------------------------------------------------------------------

export interface Course {
  id: string;
  subject: string;
  courseNumber: string;
  title: string;
  credits: number;
  description: string;
}

export interface Section {
  crn: string;
  courseId: string;
  instructor: string;
  days: string;
  startTime: string;
  endTime: string;
  location: string;
  seatsAvailable: number;
  maxSeats: number;
  term: string;
}

export interface Professor {
  name: string;
  department: string;
  rmpId?: string;
}

export interface RMPRating {
  professorName: string;
  department: string;
  overallRating: number;
  wouldTakeAgainPct?: number;
  difficulty: number;
  numRatings: number;
  topTags: string[];
  rmpUrl: string;
}

export interface SchedulePreferences {
  preferredDays?: string[];
  earliestTime?: string;
  latestTime?: string;
  maxGapMinutes?: number;
  minGapMinutes?: number;
}

export interface GeneratedSchedule {
  sections: Section[];
  score: number;
  warnings: string[];
}

export interface TranscriptCourse {
  subject: string;
  courseNumber: string;
  title: string;
  grade: string;
  credits: number;
  term: string;
}

export interface TranscriptData {
  courses: TranscriptCourse[];
  gpa?: number;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface PrerequisiteCheck {
  courseId: string;
  satisfied: boolean;
  missingPrereqs: string[];
}

// ---------------------------------------------------------------------------
// Degree requirements — mirrors backend DegreeProgram models
// ---------------------------------------------------------------------------

export type SelectionType = "required" | "select_one" | "select_n";

export interface CourseRef {
  subject: string;
  number: string;
  title: string;
  credits?: number;
  writingIntensive: boolean;
  bulletinUrl: string;
}

export interface CourseOption {
  courses: CourseRef[];
  isHonorsVariant: boolean;
}

export interface RequirementItem {
  selectionType: SelectionType;
  description: string;
  credits?: number;
  creditsRange: string;
  options: CourseOption[];
  footnotes: string[];
}

export interface RequirementGroup {
  name: string;
  items: RequirementItem[];
  constraints: string[];
}

export interface RequirementCategory {
  name: string;
  totalCredits: string;
  description: string;
  groups: RequirementGroup[];
  notes: string[];
}

export interface LabScienceSequence {
  department: string;
  scienceALabel: string;
  scienceBLabel: string;
  scienceAOptions: CourseOption[];
  scienceBOptions: CourseOption[];
  footnotes: string[];
}

export interface PlanCourse {
  course?: CourseOption;
  placeholder: string;
  credits: string;
}

export interface PlanSemester {
  term: "Fall" | "Spring" | "Summer";
  courses: PlanCourse[];
  totalCredits: string;
}

export interface PlanYear {
  year: number;
  semesters: PlanSemester[];
}

export interface SuggestedPlan {
  years: PlanYear[];
  totalCredits: string;
  footnotes: string[];
}

export interface DegreeProgram {
  name: string;
  degreeType: string;
  programCode: string;
  college: string;
  bulletinUrl: string;
  bulletinYear: string;
  totalCredits: string;
  categories: RequirementCategory[];
  labScienceSequences: LabScienceSequence[];
  suggestedPlan?: SuggestedPlan;
  distinctionCriteria: string[];
  footnotes: string[];
}
