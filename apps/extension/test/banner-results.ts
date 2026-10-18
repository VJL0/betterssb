/**
 * Banner 9 class search results, as the grid renders them (structure taken
 * from Temple's Browse Classes page; names and numbers are made up).
 */

const ALL_DAYS = [
  ["Sunday", "S"],
  ["Monday", "M"],
  ["Tuesday", "T"],
  ["Wednesday", "W"],
  ["Thursday", "T"],
  ["Friday", "F"],
  ["Saturday", "S"],
] as const;

export interface FakeMeeting {
  days: string[];
  time: string | null;
  building?: string;
  room?: string;
}

export interface FakeRow {
  id: string;
  term?: string;
  crn: string;
  course: string;
  section: string;
  title?: string;
  meetings?: FakeMeeting[];
  seats?: [open: number, capacity: number];
  waitlist?: [open: number, capacity: number] | null;
  instructors?: string[];
}

function meetingHtml(term: string, crn: string, m: FakeMeeting): string {
  const pills = ALL_DAYS.map(
    ([name, letter]) =>
      `<li class="ui-state-default" data-name="${name}" data-abbreviation="${letter}" aria-checked="${m.days.includes(name)}"><div>${letter}</div></li>`,
  ).join("");
  const time = m.time
    ? `<span>${m.time.replace(/(\d+):(\d+)/g, "<span>$1</span>:<span>$2</span>")}</span>`
    : "";
  return `<div class="meeting"><div class="meeting-schedule"><span class="ui-pillbox" role="group" title="Class on: ${m.days.join(",")}"><div id="${term}.${crn}div"></div><div class="ui-pillbox-summary screen-reader">${m.days.join(",")}</div><ul aria-hidden="true">${pills}</ul></span>${time}</div><span class="tooltip-row"> <span>Type:&nbsp;</span>Lecture</span><span class="tooltip-row"> <span>Building: </span>${m.building ?? "None"}</span><span class="tooltip-row"> <span>Room: </span>${m.room ?? "None"}</span><span class="tooltip-row"> <span>Start Date: </span>01/11/2027</span><span class="tooltip-row"> <span>End Date: </span>05/04/2027</span></div>`;
}

function rowHtml(r: FakeRow): string {
  const term = r.term ?? "202703";
  const [open, capacity] = r.seats ?? [12, 30];
  const waitlist = r.waitlist === undefined ? [10, 10] : r.waitlist;
  const status = `<span class="status-bold">${open}</span> of ${capacity} seats remain.${
    waitlist
      ? `<br><span class="status-bold">${waitlist[0]}</span> of ${waitlist[1]} waitlist seats remain.`
      : ""
  }`;
  const instructors = (r.instructors ?? ["Ada Lovelace"])
    .map(
      (name, i) =>
        `<a class="email" href="mailto:x${i}@example.edu" tabindex="-1">${name}</a>${i === 0 ? " (Primary)" : ""} <br>`,
    )
    .join("");
  const meetings = (
    r.meetings ?? [
      { days: ["Tuesday", "Thursday"], time: "09:30 AM - 10:50 AM" },
    ]
  )
    .map((m) => meetingHtml(term, r.crn, m))
    .join("");
  return `<tr data-id="${r.id}">
    <td data-id="${r.id}" data-property="courseReferenceNumber" style="display:none">${r.crn}</td>
    <td data-id="${r.id}" data-property="subjectCourseSectionNumber" style="display:none">${r.course}, ${r.section}</td>
    <td data-id="${r.id}" data-property="courseTitle"><a class="section-details-link" href="#" data-attributes="${term},${r.crn}" tabindex="-1">${r.title ?? "Data Structures"}</a></td>
    <td data-id="${r.id}" data-property="meetingTime">${meetings}</td>
    <td data-id="${r.id}" data-property="status">${status}</td>
    <td data-id="${r.id}" data-property="instructor">${instructors}</td>
  </tr>`;
}

/** A results grid (`#table1`) holding these rows. */
export function bannerResultsHtml(rows: FakeRow[]): string {
  return `<div id="searchResultsTable"><table id="table1"><thead><tr><th data-property="courseReferenceNumber">CRN</th></tr></thead><tbody>${rows
    .map(rowHtml)
    .join("")}</tbody></table></div>`;
}
