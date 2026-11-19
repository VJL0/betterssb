import type { SectionAttributeCode } from "./codes";

export interface SectionAttribute {
  class: "net.hedtech.banner.student.schedule.SectionDegreeProgramAttributeDecorator";
  code: SectionAttributeCode;
  description: string;
  courseReferenceNumber: string;
  termCode: string;
  /** False on every attribute seen. */
  isZTCAttribute: boolean;
}
