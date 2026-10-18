/** Types mirror apps/api/app/modules/dars/schemas.py (camelCase over the wire). */

export type AuditStatus = "complete" | "incomplete" | "in_progress" | "none";

export interface Progress {
  credits: number | null;
  courses: number | null;
  gpa: number | null;
}

export interface AuditCourse {
  term: string;
  course: string;
  title: string;
  credits: number | null;
  grade: string;
  inProgress: boolean;
}

export interface SubRequirement {
  number: string;
  title: string;
  status: AuditStatus;
  earned: Progress | null;
  inProgress: Progress | null;
  needs: Progress | null;
  courses: AuditCourse[];
  selectFrom: string[];
}

export interface Requirement {
  code: string;
  category: string;
  title: string;
  status: AuditStatus;
  notes: string[];
  earned: Progress | null;
  inProgress: Progress | null;
  needs: Progress | null;
  subrequirements: SubRequirement[];
}

export interface Audit {
  studentName: string;
  programTitle: string;
  programCode: string;
  catalogYear: string;
  preparedOn: string;
  complete: boolean | null;
  requirements: Requirement[];
}
