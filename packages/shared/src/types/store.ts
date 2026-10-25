import type {
  Audit,
  BulletinProgram,
  ChatMessage,
  ChatRequest,
  TranscriptData,
} from "@workspace/api-client";
/**
 * Documents in the local-first store. The web app keeps them in IndexedDB; with
 * the extension installed, both read and write the extension's
 * chrome.storage.local through the bridge, so guest data is shared.
 */

export interface PlannedMeeting {
  /** Banner days string, e.g. "TR". Empty for online and TBA. */
  days: string;
  /** Minutes after midnight, or null with no set time. */
  start: number | null;
  end: number | null;
  location: string;
  /** First and last day of class, as Banner sends them ("01/11/2027"). */
  startDate: string | null;
  endDate: string | null;
}

export interface PlannedSection {
  crn: string;
  /** Banner's subjectCourse, e.g. "CIS2168"; one course color per value. */
  courseId: string;
  /** Display form, e.g. "CIS 2168". */
  courseCode: string;
  section: string;
  title: string;
  credits: number | null;
  /** Lecture, Laboratory… */
  scheduleType: string;
  instructor: string;
  meetings: PlannedMeeting[];
  addedAt: string;
}

/**
 * A course planned for a term without a section yet: a future term whose
 * schedule isn't posted, or a requirement placeholder like "CIS elective".
 */
export interface PlannedCourse {
  id: string;
  /** "CIS 3715", or null for a placeholder. */
  code: string | null;
  title: string;
  credits: number | null;
  /** The audit requirement it fills, if any. */
  requirement: string | null;
  addedAt: string;
}

export interface TermPlan {
  term: string;
  termDescription: string;
  sections: PlannedSection[];
  courses: PlannedCourse[];
  /** Course color order, saved so colors never shuffle (see assignCourseColorOrder). */
  colorOrder: Record<string, number>;
  updatedAt: string;
}

/** The program a student picked from a Bulletin's academic programs index. */
export interface SelectedProgram extends Pick<
  BulletinProgram,
  "name" | "degree" | "url"
> {
  /**
   * "YYYY-YYYY", the Bulletin the program came from: the start term's suggested
   * year, or the closest earlier year online when that one isn't. Not Temple's
   * official record.
   */
  bulletinYear: string;
}

export interface UserSettings {
  /** Banner term code the app opens to. */
  term: string | null;
  major: string;
  /** Temple term code the student started in, which suggests their Bulletin year. */
  startTerm: string | null;
  program: SelectedProgram | null;
  keyboardShortcuts: boolean;
  /** Ratings, seats, plan tags and the plan dock on Banner's own pages. */
  bannerOverlay: boolean;
  updatedAt: string;
}

export interface StoredAudit {
  audit: Audit;
  storedAt: string;
}

export interface StoredTranscript {
  transcript: TranscriptData;
  storedAt: string;
}

export interface AdvisorThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: string;
  /** Provider that last completed a reply; older chats start with Gemini. */
  provider?: ChatRequest["provider"];
  effort?: ChatRequest["effort"];
}

/** How early the student wants a requirement planned, or "skip" to leave it out. */
export type PlanPriority = "high" | "normal" | "low" | "skip";

/** What "Optimize plan" remembers between runs. */
export interface PlanPreferences {
  /** By audit requirement code; a requirement without one is "normal". */
  priorities: Record<string, PlanPriority>;
  /** The course picked where the audit lists several, by requirement part key ("CISS.TBS#1"). */
  choices: Record<string, string>;
  /** The most credits to place in a term. */
  creditsPerTerm: number;
  /** Whether summer terms take courses too. */
  includeSummers: boolean;
  updatedAt: string;
}

export interface StoreDocuments {
  settings: UserSettings;
  audit: StoredAudit;
  transcript: StoredTranscript;
  advisorThreads: AdvisorThread[];
  planPreferences: PlanPreferences;
  [key: `plan:${string}`]: TermPlan;
}

export type StoreKey = keyof StoreDocuments;

export interface LocalStore {
  get<K extends StoreKey>(key: K): Promise<StoreDocuments[K] | null>;
  set<K extends StoreKey>(key: K, value: StoreDocuments[K]): Promise<void>;
  delete(key: StoreKey): Promise<void>;
  keys(): Promise<StoreKey[]>;
  /** Called with the key whenever a document changes, here or in another tab. */
  subscribe(listener: (key: StoreKey) => void): () => void;
}

/** Banner connection, which only the extension can see. */
export type BannerConnection = "connected" | "not-connected" | "signed-out";
