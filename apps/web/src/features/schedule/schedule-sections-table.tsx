import { courseCode, planCourseColor } from "@workspace/shared/lib/plan";
import type { TermPlan } from "@workspace/shared/types/store";
import { Card } from "@workspace/ui/components/card";
import { CourseBadge } from "@workspace/ui/components/course-badge";
import { SeatMeter } from "@workspace/ui/components/seat-meter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import type { RatingLookup } from "@/hooks/use-ratings";
import {
  SectionInstructor,
  SectionMeetings,
} from "@/features/search/course-card";
import type { ClassSection } from "@workspace/api-client";

interface ScheduleSectionsTableProps {
  heading: string;
  sections: readonly ClassSection[];
  plan: TermPlan;
  ratings: ReadonlyMap<string, RatingLookup>;
  showRatings: boolean;
}

/** Every section in the chosen schedule, with CRNs to register with. */
export function ScheduleSectionsTable({
  heading,
  sections,
  plan,
  ratings,
  showRatings,
}: ScheduleSectionsTableProps) {
  return (
    <Card
      aria-labelledby="schedule-sections-heading"
      className="gap-2 pt-4 pb-1"
      render={<section />}
    >
      <h2 id="schedule-sections-heading" className="px-5 text-base font-medium">
        {heading}
      </h2>
      {/* Under 640px tables become stacked items (W-Mobile). */}
      <ul className="flex flex-col divide-y px-5 pb-3 sm:hidden">
        {sections.map((section) => (
          <li
            key={section.courseReferenceNumber}
            className="flex flex-col gap-2 py-3"
          >
            <span className="flex items-center gap-2">
              <CourseBadge
                code={courseCode(section.subject, section.courseNumber)}
                color={planCourseColor(plan, section.subjectCourse)}
              />
              <span className="min-w-0 truncate">{section.courseTitle}</span>
            </span>
            <span className="text-muted-foreground tabular-nums">
              Section {section.sequenceNumber} · CRN{" "}
              {section.courseReferenceNumber}
            </span>
            <SectionMeetings section={section} />
            <SectionInstructor
              section={section}
              ratings={ratings}
              showRatings={showRatings}
            />
            <SeatMeter {...section} size="sm" />
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto px-3 sm:block">
        <Table className="min-w-[45rem]">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Course</TableHead>
              <TableHead scope="col">Section</TableHead>
              <TableHead scope="col">Meets</TableHead>
              <TableHead scope="col">Instructor</TableHead>
              <TableHead scope="col">Seats</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sections.map((section) => (
              <TableRow key={section.courseReferenceNumber}>
                <TableCell className="align-top">
                  <span className="flex items-center gap-2">
                    <CourseBadge
                      code={courseCode(section.subject, section.courseNumber)}
                      color={planCourseColor(plan, section.subjectCourse)}
                    />
                    <span className="whitespace-normal">
                      {section.courseTitle}
                    </span>
                  </span>
                </TableCell>
                <TableCell className="align-top tabular-nums">
                  {section.sequenceNumber}{" "}
                  <span className="text-muted-foreground">
                    · CRN {section.courseReferenceNumber}
                  </span>
                </TableCell>
                <TableCell className="align-top">
                  <SectionMeetings section={section} />
                </TableCell>
                <TableCell className="align-top">
                  <SectionInstructor
                    section={section}
                    ratings={ratings}
                    showRatings={showRatings}
                  />
                </TableCell>
                <TableCell className="align-top">
                  <SeatMeter {...section} size="sm" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
