/**
 * Banner's header menu: `GET /ssb/selfServiceMenu/data` (the `menuEndPoint`
 * meta) and `GET /ssb/menu?type=Personal` (the "My Banner" feed). Both answer
 * 200 `text/xml;charset=UTF-8`, so the response is a `string`.
 *
 * Guests always get the 21-byte `<NavigationEntries />`, with or without
 * cookies (seen on 2026-11-18: `selfServiceMenu/data` 3 times, `menu` 6
 * times; one of each without cookies). Signed in, the user's HAR
 * captures (50 responses) hold a `<NavigationEntries>` with three
 * `<NavigationEntryValueObject … />` children, the same for both routes:
 * Personal Information, Financial Aid and Employee, each a link out to the
 * Banner 8 self-service at `prd-wlssb.temple.edu`.
 */

/**
 * The attributes of one `<NavigationEntryValueObject>`, single-quoted in the
 * XML. Every attribute was on every entry; all are strings.
 */
export interface NavigationEntry {
  /** "99-1", "99-5", "99-7". */
  id: string;
  menu: "Banner";
  /** Banner 8 package ("bmenu.P_GenMnu"). */
  form: string;
  /** The string "null". */
  path: "null";
  name: string;
  caption: string;
  type: "MENU";
  /** Absolute ("https://prd-wlssb.temple.edu/ssomanager/c/SSB?pkg=bmenu.P_GenMnu"). */
  url: string;
  /** "bmenu.P_MainMnu" on every entry. */
  parent: string;
  params: "";
  captionProperty: "false";
  /** Equal to `name` and `caption`. */
  pageCaption: string;
  isBanner9: "false";
}

/**
 * Query of `/ssb/menu`. Banner's header sends only `type=Personal` (its "My
 * Banner" feed); the main menu comes from `selfServiceMenu/data`, with no
 * query. Every combination below, and none at all, gave guests the same
 * `<NavigationEntries />` (6 calls).
 */
export interface MenuQuery {
  type?: "Personal";
  /**
   * The page whose menu entry to look up ("classSearch"), with `seq` its
   * position. Banner's `NavigationRC` only sends them when the page URL has
   * a `page=` parameter, which no registration page has.
   */
  pageName?: string;
  /** "1". */
  seq?: string;
}
