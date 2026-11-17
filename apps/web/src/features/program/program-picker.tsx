"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleXIcon, InfoIcon } from "lucide-react";
import Link from "next/link";
import { useId, useMemo } from "react";
import { queryError, type BulletinProgram } from "@workspace/api-client";
import { listBulletinProgramsOptions } from "@workspace/api-client/query";
import {
  startTermOptions,
  suggestedBulletinYear,
} from "@workspace/shared/lib/bulletin";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@workspace/ui/components/combobox";
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@workspace/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { useSettings } from "@/hooks/use-settings";

/** Matches shown while searching; the full list is about 900 programs. */
const PROGRAMS_SHOWN = 50;
const NO_PROGRAMS: BulletinProgram[] = [];

/** "Computer Science BS", as the Bulletin titles program pages. */
export function programLabel(
  program: Pick<BulletinProgram, "name" | "degree">,
): string {
  return `${program.name} ${program.degree}`;
}

/**
 * The start term's Bulletin programs and the saved pick among them. A program
 * saved from another year's Bulletin isn't picked here.
 */
export function useBulletinPrograms() {
  const { settings, update } = useSettings();
  const year = settings.startTerm
    ? suggestedBulletinYear(settings.startTerm)
    : null;
  const programs = useQuery({
    ...listBulletinProgramsOptions({
      query: { year: year ?? "" },
      meta: { errorMessage: "Couldn't load programs from the Bulletin." },
    }),
    enabled: year !== null,
    // A Bulletin's program list doesn't change once it's published.
    staleTime: Infinity,
  });
  // The index also lists programs with no page of their own, which have no requirements to show.
  const options = useMemo(
    () => programs.data?.programs.filter((p) => p.url) ?? NO_PROGRAMS,
    [programs.data],
  );
  // When the suggested year isn't online, the closest earlier year stands in.
  const shownYear = programs.data?.bulletinYear ?? year;
  const standIn = programs.data !== undefined && shownYear !== year;
  const selected =
    settings.program?.bulletinYear === shownYear ? settings.program : null;
  const selectedOption = selected
    ? (options.find((p) => p.url === selected.url) ?? null)
    : null;
  return {
    settings,
    update,
    year,
    programs,
    options,
    shownYear,
    standIn,
    selectedOption,
  };
}

/**
 * Two steps: the term the student started at Temple suggests a Bulletin year,
 * and that year's programs fill a searchable list, linked to the Bulletin for
 * reference. The program's requirements are left to the planner and audit.
 */
export function ProgramPicker() {
  const {
    settings,
    update,
    year,
    programs,
    options,
    shownYear,
    standIn,
    selectedOption,
  } = useBulletinPrograms();
  // The popup is only rendered once opened, so the prerendered page never shows this list.
  const startTerms = useMemo(() => startTermOptions(new Date()), []);
  const startTermId = useId();
  const programId = useId();

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(14rem,100%),1fr))] gap-4">
        <Field>
          <FieldTitle id={startTermId}>First term at Temple</FieldTitle>
          <Select
            items={startTerms.map((t) => ({ value: t.code, label: t.name }))}
            value={settings.startTerm}
            onValueChange={(code) => {
              if (typeof code === "string" && code !== settings.startTerm) {
                // Another year's Bulletin has its own program pages.
                void update({ startTerm: code, program: null });
              }
            }}
          >
            <SelectTrigger aria-labelledby={startTermId} className="w-full">
              <SelectValue placeholder="Choose a term" />
            </SelectTrigger>
            <SelectContent>
              {startTerms.map((t) => (
                <SelectItem key={t.code} value={t.code}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            Sets which year's degree requirements apply to you.
          </FieldDescription>
        </Field>

        <Field data-disabled={!year}>
          <FieldLabel htmlFor={programId}>Major</FieldLabel>
          <Combobox
            items={options}
            value={selectedOption}
            onValueChange={(program: BulletinProgram | null) =>
              void update({
                program:
                  program && shownYear
                    ? {
                        name: program.name,
                        degree: program.degree,
                        url: program.url,
                        bulletinYear: shownYear,
                      }
                    : null,
                major: program ? programLabel(program) : "",
              })
            }
            itemToStringLabel={(program: BulletinProgram) =>
              programLabel(program)
            }
            itemToStringValue={(program) => program.url}
            isItemEqualToValue={(a, b) => a.url === b.url}
            limit={PROGRAMS_SHOWN}
            disabled={!programs.isSuccess}
          >
            <ComboboxInput
              id={programId}
              className="w-full"
              placeholder={
                !year
                  ? "Pick your first term"
                  : programs.isPending
                    ? "Loading…"
                    : "Search majors"
              }
              disabled={!programs.isSuccess}
              showClear={selectedOption !== null}
            />
            <ComboboxContent>
              <ComboboxEmpty>No matches</ComboboxEmpty>
              <ComboboxList>
                {(program: BulletinProgram) => (
                  <ComboboxItem key={program.url} value={program}>
                    <span className="flex min-w-0 flex-col">
                      <span>{programLabel(program)}</span>
                      <span className="text-xs text-muted-foreground">
                        <span className="capitalize">{program.level}</span>
                        {program.note && ` · ${program.note}`}
                      </span>
                    </span>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          {programs.data && (
            <FieldDescription>
              From the{" "}
              <a
                href={programs.data.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2"
              >
                {programs.data.bulletinYear} Bulletin
              </a>
              .
            </FieldDescription>
          )}
        </Field>
      </div>

      {standIn && (
        <Alert variant="info">
          <InfoIcon />
          <AlertTitle>Using the {shownYear} Bulletin</AlertTitle>
          <AlertDescription>
            {year} isn't online yet, so newer courses may be missing. Check your{" "}
            <Link href="/records" className="underline underline-offset-2">
              degree audit
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      {programs.isError && (
        <Alert variant="destructive">
          <CircleXIcon />
          <AlertTitle>Couldn't load programs</AlertTitle>
          <AlertDescription>
            {queryError(programs.error)?.message ??
              "Couldn't load programs from the Bulletin."}{" "}
            Reload to try again.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
