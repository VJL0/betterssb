/**
 * `GET /ssb/contactCard/retrieveData`, JSON: the card that pops up from an
 * instructor's name in the class search grid and in the Instructor/Meeting
 * Times tab. Written from 24 cards fetched as a guest on 2026-11-18, terms
 * 202703 and 202636: 22 for every instructor of 7 sections, in one session
 * (13 distinct records, as some taught several of the sections, and 2 empty),
 * plus discovery's card for another instructor and for a made-up
 * `bannerId`. Saved, redacted, in
 * reverse-engineering/section-relations/contactCard/.
 *
 * Privacy: the response is far more than the card shows. Temple's card
 * config enables only the name, department, email and photo, but the JSON
 * also carries the person's directory (office) address, job title and
 * Banner record metadata. Only name and email are public in the class
 * search, so the saved captures replace every name, email, `bannerId`,
 * street, city, zip, phone and user name with "<redacted N chars>", and nothing
 * here should be shown or stored beyond what the card itself shows.
 *
 * The 500 for a bad request is `ContactCardErrorPage`.
 */

import type { CodeDescription, Open } from "../common";
import type { BannerDate } from "../search-results/meeting";
import type { College } from "../section-details/codes";

export interface ContactCardResponse {
  data: ContactCard | EmptyContactCard;
}

export interface ContactCard {
  facultyCardPopupConfig: ContactCardFieldConfig[];
  personData: ContactCardPerson;
  message: "";
}

/**
 * Sent for 2 of the 22 session cards, with a `bannerId` the session had
 * just handed out, and for the made-up `bannerId` "000000000" (discovery's
 * probe); "99999999" got the error page instead.
 */
export interface EmptyContactCard {
  facultyCardPopupConfig: ContactCardFieldConfig[];
  personData: [];
  message: "No information is available at this time.";
}

/**
 * The fields Temple's card shows, the same five in the same order on every
 * card: facultyCardPopup, facultyName, facultyDepartment, facultyEmail,
 * facultyPhoto. Banner's profileCard script reads each `config` and fills
 * only those; "facultyCardPopup" makes it show `message`, "facultyPhoto"
 * loads `/ssb/registrationPicture/picture?bannerId=`.
 */
export interface ContactCardFieldConfig {
  config: ContactCardField;
  /** The same text as `title` ("Faculty Email Address"). */
  display: string;
  title: string;
  /** True only on "facultyName". */
  required: boolean;
}

/**
 * Seen: the first five. The rest are the other fields profileCard knows,
 * which Temple doesn't enable.
 */
export type ContactCardField = Open<
  | "facultyCardPopup"
  | "facultyName"
  | "facultyDepartment"
  | "facultyEmail"
  | "facultyPhoto"
  | "facultyTitle"
  | "facultyAddress"
  | "facultyPhone"
>;

/** Counts below are over the 21 cards with a person (14 distinct records). */
export interface ContactCardPerson {
  /**
   * The class search's `displayName` for the same person (20 of the 20
   * compared; discovery's card wasn't).
   */
  displayName: string;
  /** The class search's `emailAddress`, null where that is (20 of 20). */
  email: string | null;
  /** The `bannerId` that was sent, echoed back (20 of 20). */
  bannerId: string;
  /** "Y" on all 21. */
  scheduleIndicator: "Y";
  /** "N" on 9, null on 12. */
  advisorIndicator: "N" | null;
  /** Set on all 21 ("Clinician Educator Professor", "Volunteer Faculty"). */
  title: BannerLookup;
  /**
   * One entry on 17, null on 4. profileCard shows the first entry's
   * `department.description`.
   */
  deptAndCollegeInformation: [DepartmentAndCollege] | null;
  /** The "Temple Directory" address; null on 6 (on all 4 without a department). */
  address: ContactCardAddress | null;
  /** Null on all 21; profileCard would show its `displayPhone`. */
  telephone: null;
}

/**
 * A Banner validation-table row as GORM serializes it. `class` is the same
 * Hibernate class name on every one, not the table's.
 */
export interface BannerDomainObject {
  class: "org.grails.orm.hibernate.cfg.HibernatePersistentEntity";
  id: number;
  version: number;
  lastModified: BannerDate;
  /** A Banner user name where set ("<redacted 10 chars>" in the captures). */
  lastModifiedBy: string | null;
  dataOrigin: string | null;
}

export interface BannerLookup extends BannerDomainObject {
  code: string;
  /** HTML-escaped ("Music &amp; Dance, Boyer College"). */
  description: string;
}

/** A reference to a row the response doesn't expand. */
export interface BannerReference<Class extends string> {
  class: Class;
  id: number;
}

/**
 * Hibernate's own bookkeeping leaking into the JSON: always eight empty
 * objects.
 */
export type GormDynamicFinders = Record<string, never>[];

export interface DepartmentAndCollege {
  /** "ME" on 13 of 17, "BC" on 2, "BU" and "LA" on 1. */
  college: ContactCardCollege;
  /** Four digits ("0520"); "0000" "Undeclared" on 9 of 17. */
  department: ContactCardDepartment;
  /** The term the assignment started ("201103", "2011 Spring"). */
  termEffective: TermEffective;
  termTo: null;
  homeIndicator: true;
  percentage: 100;
  id: number;
  version: number;
  lastModified: BannerDate;
  dataOrigin: null;
  gormDynamicFinders: GormDynamicFinders;
}

export interface ContactCardCollege extends BannerLookup {
  code: College;
  lastModifiedBy: string;
  dataOrigin: string;
  /** A three- or four-digit statistics code ("050", "2200"). */
  statisticsCanadianInstitution: string;
  addressStreetLine1: null;
  addressStreetLine2: null;
  addressStreetLine3: null;
  addressStreetLine4: null;
  addressCity: null;
  addressState: null;
  addressCountry: null;
  addressZipCode: null;
  houseNumber: null;
  districtDivision: null;
  systemRequiredIndicator: null;
  voiceResponseMessageNumber: null;
}

export interface ContactCardDepartment extends BannerLookup {
  lastModifiedBy: null;
  dataOrigin: null;
  /** "Y" on 9 of 17 (every "0000"), else null. */
  systemRequiredIndicator: "Y" | null;
  voiceResponseMessageNumber: null;
}

/** A term row: `code` is the six-digit term, `description` its name. */
export interface TermEffective extends BannerLookup {
  lastModifiedBy: null;
  dataOrigin: null;
  startDate: BannerDate;
  endDate: BannerDate;
  housingStartDate: BannerDate;
  housingEndDate: BannerDate;
  /** Two two-digit years: "2122" for 2021–22. */
  financialAidProcessingYear: string;
  financialAidTerm: "1";
  financialAidPeriod: 1;
  financialEndPeriod: 12;
  systemReqInd: null;
  financeSummerIndicator: null;
  acyr_code: BannerReference<"net.hedtech.banner.general.system.AcademicYear">;
  trmt_code: BannerReference<"net.hedtech.banner.general.system.TermType">;
}

/** Seen 15 times, every one in Pennsylvania. */
export interface ContactCardAddress {
  addressType: DirectoryAddressType;
  streetLine1: string;
  /** Null on 3 of 15. */
  streetLine2: string | null;
  /** Set on 5 of 15. */
  streetLine3: string | null;
  streetLine4: null;
  city: string;
  /** Unlike the other lookups, only a code and description. */
  state: CodeDescription;
  /** Five digits or ZIP+4 ("19122", "19140-5104"). */
  zip: string;
  /** Set on 6 of 15 ("42101", "PA-Philadelphia"). */
  county: ContactCardCounty | null;
  /** Null on 1 of 15, the one whose `dataOrigin` is "Banner". */
  nation: ContactCardNation | null;
  /** "PORTAL" on 14 of 15, "Banner" on 1. */
  dataOrigin: Open<"PORTAL" | "Banner">;
  fromDate: BannerDate;
  toDate: null;
  sequenceNumber: number;
  reviewedIndicator: "N";
  reviewedUser: string;
  userData: string;
  id: number;
  version: number;
  lastModified: BannerDate;
  addressSource: null;
  carrierRoute: null;
  correctionDigit: null;
  countryPhone: null;
  deliveryPoint: null;
  goodsAndServiceTaxTaxId: null;
  houseNumber: null;
  phoneArea: null;
  phoneExtension: null;
  phoneNumber: null;
  statusIndicator: null;
  gormDynamicFinders: GormDynamicFinders;
}

export interface DirectoryAddressType extends BannerLookup {
  code: "TU";
  description: "Temple Directory";
  lastModifiedBy: null;
  dataOrigin: null;
  systemRequiredIndicator: "N";
  telephoneType: BannerReference<"net.hedtech.banner.general.system.TelephoneType">;
}

export interface ContactCardCounty extends BannerLookup {
  lastModifiedBy: null;
  dataOrigin: null;
  guid: string;
  isoCode: null;
  fipsCode: null;
}

/** Banner's nation row: it has `nation` where the others have `description`. */
export interface ContactCardNation extends BannerDomainObject {
  lastModifiedBy: null;
  dataOrigin: null;
  /** Banner's own nation code ("157"), not ISO. */
  code: string;
  nation: string;
  capital: string;
  area: number;
  population: number;
  /** ISO 3166 alpha-2 ("US"), like `scodIso` and `sevisEquiv`. */
  ediEquiv: string;
  scodIso: string;
  sevisEquiv: string;
  guid: string;
  lmsEquiv: null;
  postalMask: null;
  telephoneMask: null;
  statscan: null;
  ssaReportingEquiv: null;
}
