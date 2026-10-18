const BANNER_TERM_NAME = /^(\d{4})\s+(.+)$/;
const VIEW_ONLY = /\s*\(view only\)\s*/i;

/** Banner marks past terms "(View Only)": their schedule can be read but not registered for. */
export function isViewOnlyTerm(bannerDescription: string): boolean {
  return VIEW_ONLY.test(bannerDescription);
}

/** Banner names terms year first ("2027 Spring"); students read "Spring 2027". */
export function formatTermName(bannerDescription: string): string {
  const plain = bannerDescription.replace(VIEW_ONLY, " ").trim();
  const match = BANNER_TERM_NAME.exec(plain);
  return match ? `${match[2]} ${match[1]}` : plain;
}
