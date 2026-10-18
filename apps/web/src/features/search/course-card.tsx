import { CheckIcon, PlusIcon } from "lucide-react";
import type { ReactNode } from "react";
import { shortInstructorName } from "@workspace/shared/lib/instructors";
import {
  formatTimeRange,
  parseClockTime,
} from "@workspace/shared/lib/meeting-times";
import { courseCode, planCourseColor } from "@workspace/shared/lib/plan";
import {
  meetingTimeToDays,
  primaryInstructorName,
} from "@workspace/shared/lib/sections";
import type { TermPlan } from "@workspace/shared/types/store";
import { Button } from "@workspace/ui/components/button";
import { CourseBadge } from "@workspace/ui/components/course-badge";
import { DayStrip } from "@workspace/ui/components/day-strip";
import { RmpBadge } from "@workspace/ui/components/rmp-badge";
import { SeatMeter } from "@workspace/ui/components/seat-meter";
import { Skeleton } from "@workspace/ui/components/skeleton";
import { cn } from "@workspace/ui/lib/utils";
import type { RatingLookup } from "@/hooks/use-ratings";
import type { ClassSection } from "@workspace/api-client";

export interface SectionRowActions {
  isPlanned: (crn: string) => boolean;
  onToggle: (section: ClassSection) => void;
  onPreview: (section: ClassSection | null) => void;
}

interface CourseCardProps extends SectionRowActions {
  sections: ClassSection[];
  plan: TermPlan;
  termName: string;
  ratings: ReadonlyMap<string, RatingLookup>;
  showRatings: boolean;
}

function sectionLabel(section: ClassSection): string {
  return `${courseCode(section.subject, section.courseNumber)} · ${section.sequenceNumber}`;
}

export function SectionMeetings({ section }: { section: ClassSection }) {
  return (
    <span className="flex flex-col gap-1">
      {section.meetingsFaculty.map(({ meetingTime: mt }, i) => {
        const days = meetingTimeToDays(mt);
        const timed = mt.beginTime && mt.endTime && days;
        return (
          <span key={i} className="flex flex-wrap items-center gap-2">
            {timed ? (
              <>
                <DayStrip days={days} />
                <span className="tabular-nums">
                  {formatTimeRange(
                    parseClockTime(mt.beginTime!),
                    parseClockTime(mt.endTime!),
                  )}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">No set time</span>
            )}
          </span>
        );
      })}
      <span className="text-xs text-muted-foreground">
        {[
          section.scheduleTypeDescription,
          section.instructionalMethodDescription,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </span>
  );
}

function room(section: ClassSection): string {
  const rooms = section.meetingsFaculty
    .map(({ meetingTime: mt }) =>
      [mt.buildingDescription, mt.room].filter(Boolean).join(" "),
    )
    .filter(Boolean);
  return [...new Set(rooms)].join(", ") || "Online or TBA";
}

export function SectionInstructor({
  section,
  ratings,
  showRatings,
}: {
  section: ClassSection;
  ratings: ReadonlyMap<string, RatingLookup>;
  showRatings: boolean;
}) {
  const name = primaryInstructorName(section);
  const rating = ratings.get(name);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span title={name}>{shortInstructorName(name)}</span>
      {showRatings &&
        name !== "TBA" &&
        (rating === undefined ? (
          <Skeleton aria-hidden className="h-5 w-24 rounded-2xl" />
        ) : (
          <RmpBadge rating={rating} />
        ))}
    </span>
  );
}

function PlanButton({
  section,
  planned,
  termName,
  onToggle,
}: {
  section: ClassSection;
  planned: boolean;
  termName: string;
  onToggle: (section: ClassSection) => void;
}) {
  const label = planned
    ? `Remove ${sectionLabel(section)} (CRN ${section.courseReferenceNumber}) from your ${termName} plan`
    : `Add ${sectionLabel(section)} (CRN ${section.courseReferenceNumber}) to your ${termName} plan`;
  return (
    <Button
      size="icon"
      variant={planned ? "default" : "outline"}
      aria-pressed={planned}
      aria-label={label}
      title={label}
      data-plan-button
      onClick={() => onToggle(section)}
    >
      {planned ? <CheckIcon /> : <PlusIcon />}
    </Button>
  );
}

/** One course from the search, with its sections as a table (stacked rows on phones). */
export function CourseCard({
  sections,
  plan,
  termName,
  ratings,
  showRatings,
  isPlanned,
  onToggle,
  onPreview,
}: CourseCardProps) {
  const first = sections[0]!;
  const code = courseCode(first.subject, first.courseNumber);
  const credits = first.creditHourLow ?? first.creditHours;
  const headingId = `course-${first.subjectCourse}`;

  const rowHandlers = (section: ClassSection) => ({
    onMouseEnter: () => onPreview(section),
    onMouseLeave: () => onPreview(null),
    onFocus: () => onPreview(section),
    onBlur: () => onPreview(null),
  });

  return (
    <article
      aria-labelledby={headingId}
      className="flex flex-col gap-2 rounded-3xl bg-card pt-4 pb-1 shadow-sm ring-1 ring-foreground/5"
    >
      <header className="flex flex-wrap items-center gap-x-2.5 gap-y-2 px-5">
        <CourseBadge
          code={code}
          color={planCourseColor(plan, first.subjectCourse)}
        />
        <h3 id={headingId} className="text-base font-medium">
          <span className="sr-only">{code} </span>
          {first.courseTitle}
        </h3>
        {credits != null && (
          <span className="text-muted-foreground tabular-nums">
            {credits} cr
          </span>
        )}
      </header>

      <div className="hidden overflow-x-auto px-3 md:block">
        <table className="w-full min-w-[46rem] text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="h-10 w-24 px-2 font-medium">
                Section
              </th>
              <th scope="col" className="h-10 px-2 font-medium">
                Meets
              </th>
              <th scope="col" className="h-10 px-2 font-medium">
                Instructor
              </th>
              <th scope="col" className="h-10 px-2 font-medium">
                Room
              </th>
              <th scope="col" className="h-10 w-40 px-2 font-medium">
                Seats
              </th>
              <th scope="col" className="h-10 w-12 px-2">
                <span className="sr-only">Plan</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => {
              const planned = isPlanned(section.courseReferenceNumber);
              return (
                <tr
                  key={section.courseReferenceNumber}
                  className={cn(
                    "border-b border-border last:border-0",
                    planned && "bg-muted/70",
                  )}
                  {...rowHandlers(section)}
                >
                  <td className="px-2 py-2 align-top whitespace-nowrap tabular-nums">
                    <span className="font-medium">
                      {section.sequenceNumber}
                    </span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      CRN {section.courseReferenceNumber}
                    </span>
                  </td>
                  <td className="px-2 py-2 align-top">
                    <SectionMeetings section={section} />
                  </td>
                  <td className="px-2 py-2 align-top">
                    <SectionInstructor
                      section={section}
                      ratings={ratings}
                      showRatings={showRatings}
                    />
                  </td>
                  <td className="px-2 py-2 align-top text-muted-foreground">
                    {room(section)}
                  </td>
                  <td className="px-2 py-2 align-top">
                    <SeatMeter {...section} size="sm" />
                  </td>
                  <td className="px-2 py-2 text-right align-top">
                    <PlanButton
                      section={section}
                      planned={planned}
                      termName={termName}
                      onToggle={onToggle}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col md:hidden">
        {sections.map((section) => {
          const planned = isPlanned(section.courseReferenceNumber);
          return (
            <li
              key={section.courseReferenceNumber}
              className={cn(
                "flex gap-3 border-t border-border px-5 py-3",
                planned && "bg-muted/70",
              )}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <MobileLine label="Section">
                  <span className="font-medium">{section.sequenceNumber}</span>{" "}
                  <span className="font-mono text-xs text-muted-foreground">
                    CRN {section.courseReferenceNumber}
                  </span>
                </MobileLine>
                <SectionMeetings section={section} />
                <SectionInstructor
                  section={section}
                  ratings={ratings}
                  showRatings={showRatings}
                />
                <span className="text-muted-foreground">{room(section)}</span>
                <SeatMeter {...section} size="sm" />
              </div>
              <PlanButton
                section={section}
                planned={planned}
                termName={termName}
                onToggle={onToggle}
              />
            </li>
          );
        })}
      </ul>
    </article>
  );
}

function MobileLine({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span>
      <span className="sr-only">{label}: </span>
      {children}
    </span>
  );
}
