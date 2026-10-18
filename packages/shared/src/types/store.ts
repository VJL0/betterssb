/**
 * Documents in the local-first store. The web app keeps them in IndexedDB; with
 * the extension installed, both read and write the extension's
 * chrome.storage.local through the bridge, so guest data is shared.
 */
import type { Audit } from "./dars";
import type { ChatMessage, TranscriptData } from "./index";

export interface PlannedMeeting {
  /** Banner days string, e.g. "TR". Empty for online and TBA. */
  days: string;
  /** Minutes after midnight, or null with no set time. */
  start: number | null;
  end: number | null;
  location: string;
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

export interface TermPlan {
  term: string;
  termDescription: string;
  sections: PlannedSection[];
  /** Course color order, saved so colors never shuffle (see assignCourseColorOrder). */
  colorOrder: Record<string, number>;
  updatedAt: string;
}

export interface SchoolChoice {
  /** Rate My Professors school id, used for rating lookups. */
  id: string;
  name: string;
}

export interface UserSettings {
  school: SchoolChoice | null;
  /** Banner term code the app opens to. */
  term: string | null;
  major: string;
  keyboardShortcuts: boolean;
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
}

export interface StoreDocuments {
  settings: UserSettings;
  audit: StoredAudit;
  transcript: StoredTranscript;
  advisorThreads: AdvisorThread[];
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
