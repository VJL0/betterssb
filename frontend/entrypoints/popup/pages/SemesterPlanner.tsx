import { useState, useEffect, useCallback } from "react";
import type {
  SSBTerm,
  SSBSection,
  SSBSectionSearchResponse,
} from "@/types/ssb";
import { sendMessage } from "@/lib/messaging";
import { Card, Button, Input } from "@/components/ui";
import { cn } from "@/lib/cn";

interface PlannedItem {
  crn: string;
  subject: string;
  courseNumber: string;
  courseTitle: string;
  creditHours: number;
  instructor: string;
  meetingSummary: string;
  section: SSBSection;
}

export function SemesterPlanner() {
  const [terms, setTerms] = useState<SSBTerm[]>([]);
  const [selectedTerm, setSelectedTerm] = useState("");
  const [courseQuery, setCourseQuery] = useState("");
  const [ssbSections, setSSBSections] = useState<SSBSection[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [planned, setPlanned] = useState<PlannedItem[]>([]);
  const [addingCrns, setAddingCrns] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const res = await sendMessage({
          type: "SSB_PLAN_GET_TERMS",
          payload: {},
        });
        if (res.success && Array.isArray(res.data)) {
          setTerms(res.data as SSBTerm[]);
          if ((res.data as SSBTerm[]).length > 0) {
            setSelectedTerm((res.data as SSBTerm[])[0].code);
          }
        }
      } catch {
        const fallback = await sendMessage({
          type: "SSB_GET_TERMS",
          payload: {},
        });
        if (fallback.success && Array.isArray(fallback.data)) {
          setTerms(fallback.data as SSBTerm[]);
          if ((fallback.data as SSBTerm[]).length > 0) {
            setSelectedTerm((fallback.data as SSBTerm[])[0].code);
          }
        }
      }
    })();
  }, []);

  const searchSections = useCallback(async () => {
    if (!courseQuery.trim() || !selectedTerm) return;
    setSearching(true);
    setSearchError(null);

    try {
      const res = await sendMessage({
        type: "SSB_SEARCH_SECTIONS",
        payload: {
          txt_subjectcoursecombo: courseQuery.trim().replace(/\s+/g, ""),
          txt_term: selectedTerm,
          pageMaxSize: 50,
        },
      });

      if (res.success) {
        const body = res.data as SSBSectionSearchResponse;
        setSSBSections(body.data ?? []);
        if ((body.data ?? []).length === 0) {
          setSearchError(
            "No sections found. Try a different course (e.g. CIS2168).",
          );
        }
      } else {
        setSearchError(res.error ?? "Search failed. Is your SSB tab open?");
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }, [courseQuery, selectedTerm]);

  async function addToPlan(sec: SSBSection) {
    setAddingCrns((prev) => new Set(prev).add(sec.courseReferenceNumber));
    try {
      await sendMessage({
        type: "SSB_PLAN_SAVE_TERM",
        payload: { term: selectedTerm },
      });

      const res = await sendMessage({
        type: "SSB_PLAN_ADD_ITEM",
        payload: { term: selectedTerm, crn: sec.courseReferenceNumber },
      });

      if (res.success) {
        const primaryInstructor =
          sec.faculty.find((f) => f.primaryIndicator)?.displayName ??
          sec.faculty[0]?.displayName ??
          "TBA";

        const meetingSummary = sec.meetingsFaculty
          .map((mf) => {
            const mt = mf.meetingTime;
            let days = "";
            if (mt.monday) days += "M";
            if (mt.tuesday) days += "T";
            if (mt.wednesday) days += "W";
            if (mt.thursday) days += "R";
            if (mt.friday) days += "F";
            const start = mt.beginTime
              ? `${mt.beginTime.slice(0, 2)}:${mt.beginTime.slice(2)}`
              : "";
            const end = mt.endTime
              ? `${mt.endTime.slice(0, 2)}:${mt.endTime.slice(2)}`
              : "";
            return `${days} ${start}-${end}`;
          })
          .join(", ");

        setPlanned((prev) => [
          ...prev,
          {
            crn: sec.courseReferenceNumber,
            subject: sec.subject,
            courseNumber: sec.courseNumber,
            courseTitle: sec.courseTitle,
            creditHours: sec.creditHourLow,
            instructor: primaryInstructor,
            meetingSummary,
            section: sec,
          },
        ]);
      }
    } catch {
      // silently fail — user can retry
    } finally {
      setAddingCrns((prev) => {
        const next = new Set(prev);
        next.delete(sec.courseReferenceNumber);
        return next;
      });
    }
  }

  function removeFromPlan(crn: string) {
    setPlanned((prev) => prev.filter((p) => p.crn !== crn));
  }

  const totalCredits = planned.reduce((sum, p) => sum + p.creditHours, 0);
  const plannedCrns = new Set(planned.map((p) => p.crn));

  return (
    <div className="flex flex-col gap-3">
      <Card title="Plan Ahead — Search Courses">
        <div className="flex flex-col gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold">Term</label>
            <select
              value={selectedTerm}
              onChange={(e) => setSelectedTerm(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            >
              {terms.length === 0 && <option value="">Loading terms...</option>}
              {terms.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.description}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Input
                label="Course (e.g. CIS2168)"
                value={courseQuery}
                onChange={(e) => setCourseQuery(e.target.value)}
                placeholder="CIS2168"
                onKeyDown={(e) => e.key === "Enter" && searchSections()}
              />
            </div>
            <Button
              size="sm"
              onClick={searchSections}
              loading={searching}
              disabled={!courseQuery.trim() || !selectedTerm}
            >
              Search
            </Button>
          </div>
        </div>

        {searchError && (
          <div className="mt-2 text-xs text-amber-800">{searchError}</div>
        )}
      </Card>

      {ssbSections.length > 0 && (
        <Card title={`Sections (${ssbSections.length})`}>
          <div className="max-h-64 overflow-y-auto">
            {ssbSections.map((sec) => {
              const primaryInstructor =
                sec.faculty.find((f) => f.primaryIndicator)?.displayName ??
                sec.faculty[0]?.displayName ??
                "TBA";
              const isPlanned = plannedCrns.has(sec.courseReferenceNumber);
              const isAdding = addingCrns.has(sec.courseReferenceNumber);

              return (
                <div
                  key={sec.courseReferenceNumber}
                  className="border-b border-gray-100 py-2 text-xs last:border-0"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <strong>
                        {sec.subject} {sec.courseNumber}-{sec.sequenceNumber}
                      </strong>{" "}
                      (CRN: {sec.courseReferenceNumber})
                      <br />
                      <span className="text-gray-500">{sec.courseTitle}</span>
                      <br />
                      <span className="text-gray-500">
                        {primaryInstructor} ·{" "}
                        {sec.instructionalMethodDescription}
                      </span>
                      <br />
                      <span
                        className={cn(
                          "text-xs font-semibold",
                          sec.seatsAvailable > 0
                            ? "text-green-600"
                            : "text-red-600",
                        )}
                      >
                        {sec.seatsAvailable}/{sec.maximumEnrollment} seats
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant={isPlanned ? "secondary" : "primary"}
                      onClick={() => addToPlan(sec)}
                      loading={isAdding}
                      disabled={isPlanned || isAdding}
                    >
                      {isPlanned ? "Planned" : "Plan"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card title={`My Plan — ${totalCredits} Credits`}>
        {planned.length === 0 ? (
          <div className="text-sm text-gray-400">
            Search for courses above and add them to your plan.
          </div>
        ) : (
          planned.map((p) => (
            <div
              key={p.crn}
              className="flex items-center justify-between border-b border-gray-100 py-2 text-sm last:border-0"
            >
              <div>
                <strong>
                  {p.subject} {p.courseNumber}
                </strong>
                <span className="text-gray-500"> — {p.courseTitle}</span>
                <br />
                <span className="text-xs text-gray-400">
                  CRN {p.crn} · {p.instructor} · {p.meetingSummary} ·{" "}
                  {p.creditHours} cr
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeFromPlan(p.crn)}
                className="cursor-pointer border-0 bg-transparent text-sm text-red-600"
              >
                Remove
              </button>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
