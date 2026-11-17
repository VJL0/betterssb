/**
 * Banner stores a CRN in five characters, and schools that number from 1000
 * have four-digit ones (4354). Shorter numbers are far more likely a typo.
 */
const CRN = /^\d{4,5}$/;

export const MAX_CRN_LENGTH = 5;
export const CRN_FORMAT_ERROR = "A CRN is 4 or 5 digits, like 41207.";

export function isCrn(text: string): boolean {
  return CRN.test(text);
}
