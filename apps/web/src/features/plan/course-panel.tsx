"use client";

import { useState } from "react";
import type { NeededRequirement } from "@workspace/shared/lib/dars";
import { Card } from "@workspace/ui/components/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs";
import { ButtonLink } from "@/components/button-link";
import { CatalogCourses } from "./catalog-courses";
import type { NewCourse } from "./course-drag";
import { ProgramCourses } from "./program-courses";
import { StillNeeded } from "./still-needed";

interface CoursePanelProps {
  /** The audit's requirements without a term, or null without an audit. */
  needed: {
    requirements: readonly NeededRequirement[];
    anyNeeded: boolean;
  } | null;
  /** The student's program page on the Bulletin, if they picked one. */
  programUrl: string | null;
  /** The Bulletin year courses are read from, "YYYY-YYYY". */
  bulletinYear: string;
  /** The subject the catalog opens with. */
  initialSubject: string | null;
  /** Where a course already is, such as "In Fall 2027" or "On your audit". */
  statusOf: (code: string) => string | null;
  targetName: string | null;
  onAdd: (course: NewCourse) => void;
}

/** W2.3 aside: courses to plan, from the audit, the program and the whole Bulletin. */
export function CoursePanel({
  needed,
  programUrl,
  bulletinYear,
  initialSubject,
  statusOf,
  targetName,
  onAdd,
}: CoursePanelProps) {
  const rows = { statusOf, targetName, onAdd };
  // Until a tab is picked, open the most specific one there's data for.
  const [picked, setPicked] = useState<string | null>(null);
  const tab =
    picked ?? (needed ? "needed" : programUrl ? "program" : "catalog");
  return (
    <Card
      aria-labelledby="course-panel-heading"
      className="gap-3 pt-4 pb-3 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)]"
      render={<aside />}
    >
      <div className="flex flex-col gap-1 px-4">
        <h2 id="course-panel-heading" className="text-base font-medium">
          Courses
        </h2>
        <p className="text-muted-foreground">
          {targetName ? (
            <>
              Drag a course onto a term, or add it to{" "}
              <span className="font-medium text-foreground">{targetName}</span>.
            </>
          ) : (
            "Add a term, then drag courses onto it."
          )}
        </p>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value: string) => setPicked(value)}
        className="min-h-0 flex-1 px-2"
      >
        <TabsList className="w-full">
          {needed && <TabsTrigger value="needed">Still needed</TabsTrigger>}
          <TabsTrigger value="program">Program</TabsTrigger>
          <TabsTrigger value="catalog">All courses</TabsTrigger>
        </TabsList>
        {needed && (
          <TabsContent
            value="needed"
            className="-mx-2 min-h-0 overflow-y-auto px-2"
          >
            <StillNeeded {...needed} targetName={targetName} onAdd={onAdd} />
          </TabsContent>
        )}
        <TabsContent
          value="program"
          className="-mx-2 min-h-0 overflow-y-auto px-2"
        >
          {programUrl ? (
            <ProgramCourses url={programUrl} {...rows} />
          ) : (
            <div className="mx-2 flex flex-col items-center gap-3 rounded-2xl border border-dashed p-4 text-center text-muted-foreground">
              Pick your academic program to see the courses it lists.
              <ButtonLink href="/settings" variant="outline" size="sm">
                Choose a program
              </ButtonLink>
            </div>
          )}
        </TabsContent>
        <TabsContent
          value="catalog"
          className="-mx-2 min-h-0 overflow-y-auto px-2"
        >
          <CatalogCourses
            year={bulletinYear}
            initialSubject={initialSubject}
            {...rows}
          />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
