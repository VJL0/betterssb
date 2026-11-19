/**
 * `GET /ssb/dateConverter` (and `/ssb/dateConverter/data`, which answers the
 * same), the server side of the jQuery multicalendar date pickers: it
 * converts a date between the Gregorian and an Islamic calendar. Banner's
 * page calls it with `dataType: "text"` only when the i18n map names a second
 * calendar (`default.calendar2`); Temple's names only "gregorian", so its
 * pages never do. Open to guests, no cookies needed.
 *
 * Answers 200 `text/html;charset=utf-8` with the converted date as plain
 * text, so the response is a `string`: "06/07/1448" for "11/18/2026" to
 * `islamic-civil`, "06/08/1448" to `islamic-umalqura`, and "11/18/2026" back.
 * Parsing is lenient: "13/45/2026" rolls over to February 14, 2027
 * ("09/07/1448"). A date it cannot parse ("tomorrow") answers 200 with the
 * 5 bytes "error". Seen on 2026-11-18, 9 calls with params and 3 without.
 */

/**
 * The query the multicalendar's `gregorianToIslamic` converter sends:
 * `date` plus its `extraParams`. Missing `date` or `fromULocale` is a 500
 * page ("Date must be supplied. Expression: params.date", "Assertion failed:
 * assert fromULocaleString | null"), which ends the session like every 500.
 */
export interface DateConverterQuery {
  /** Required. In `fromDateFormat` ("11/18/2026"). */
  date: string;
  /**
   * The non-Gregorian side, either way: "islamic-civil" (Banner's islamic
   * converters) or "islamic-umalqura" (its Umm al-Qura ones).
   */
  calendar: string;
  /** Java `SimpleDateFormat` pattern; Banner always sends "MM/dd/yyyy". */
  fromDateFormat: string;
  /** Pattern of the answer: "yyyy-MM-dd" gave "1448-06-07". */
  toDateFormat: string;
  /**
   * ICU locale with a calendar keyword: "en_US@calendar=gregorian" (the
   * `default.calendar.gregorian.translation` message) or
   * "ar_SA@calendar=islamic-civil". Banner reads the Islamic one from
   * `default.calendar.islamic.ulocale`, which Temple's map lacks.
   */
  toULocale: string;
  /** Required; same format as `toULocale`. */
  fromULocale: string;
}
