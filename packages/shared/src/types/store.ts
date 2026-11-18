/**
 * Documents in the local-first store. The web app keeps them in IndexedDB; with
 * the extension installed, both read and write the extension's
 * chrome.storage.local through the bridge, so guest data is shared.
 */
import type {
  Audit,
  BulletinProgram,
  ChatMessage,
  ChatRequest,
} from "@workspace/api-client";
import type { TranscriptData } from "../lib/transcript";
export interface PlannedMeeting {
  /** Banner days, e.g. "TR"; empty for online and TBA. */
  days: string;
  /** Minutes after midnight, or null with no set time. */
  start: number | null;
  end: number | null;
  location: string;
  /** "MM/DD/YYYY", as Banner sends it. */
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
  /** Banner term code the student started in, which suggests their Bulletin year. */
  startTerm: string | null;
  program: SelectedProgram | null;
  keyboardShortcuts: boolean;
  /** Ratings on Banner's own pages. */
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

/** What "Auto-fill plan" remembers between runs. */
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

/** One request the extension sent: to Banner, TUportal or DARS with the student's sign-in, or to the BetterSSB API. */
export interface RequestLogEntry {
  method: string;
  /** The full URL, minus the cache-busting and session-id parameters. */
  url: string;
  /** The HTTP status; 0 for a redirect Banner wasn't followed through, null when it never answered. */
  status: number | null;
  /** When it was sent, or the latest of the repeats `count` stands for. */
  at: string;
  /** How many identical requests this entry stands for, when more than one. */
  count?: number;
}

/** The extension's requests, newest first. Only the extension writes it. */
export interface RequestLog {
  entries: RequestLogEntry[];
  updatedAt: string;
}

export interface StoreDocuments {
  settings: UserSettings;
  requestLog: RequestLog;
  audit: StoredAudit;
  transcript: StoredTranscript;
  advisorThreads: AdvisorThread[];
  planPreferences: PlanPreferences;
  [key: `plan:${string}`]: TermPlan;
}

export type StoreKey = keyof StoreDocuments;

export type StoreDocument = StoreDocuments[StoreKey];

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
