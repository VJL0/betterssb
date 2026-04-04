import { useState, useEffect, useCallback } from "react";
import type { Section, SchedulePreferences, GeneratedSchedule } from "@/types";
import type {
  SSBTerm,
  SSBSection,
  SSBSectionSearchResponse,
} from "@/types/ssb";
import { sendMessage } from "@/lib/messaging";
import { ssbSectionToInternal } from "@/lib/ssb-api";
import { Button, Input, Card } from "@/components/ui";
import { ScheduleCard } from "@/components/schedule/ScheduleCard";
import { cn } from "@/lib/cn";

export function ScheduleBuilder() {
  const [terms, setTerms] = useState<SSBTerm[]>([]);
  const [selectedTerm, setSelectedTerm] = useState("");
  const [courseQuery, setCourseQuery] = useState("");
  const [ssbSections, setSSBSections] = useState<SSBSection[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selectedSections, setSelectedSections] = useState<Section[]>([]);
  const [schedules, setSchedules] = useState<GeneratedSchedule[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const [prefDays, setPrefDays] = useState("");
  const [earliest, setEarliest] = useState("08:00");
  const [latest, setLatest] = useState("22:00");

  useEffect(() => {
    (async () => {
      try {
        const res = await sendMessage({ type: "SSB_GET_TERMS", payload: {} });
        if (res.success && Array.isArray(res.data)) {
          setTerms(res.data as SSBTerm[]);
          if ((res.data as SSBTerm[]).length > 0) {
            setSelectedTerm((res.data as SSBTerm[])[0].code);
          }
        }
      } catch {
        // Terms will stay empty — user can still manually search
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

  function addSSBSection(ssb: SSBSection) {
    const internals = ssbSectionToInternal(ssb);
    setSelectedSections((prev) => {
      const existingCRNs = new Set(prev.map((s) => s.crn));
      const newOnes = internals.filter((s) => !existingCRNs.has(s.crn));
      return [...prev, ...newOnes];
    });
  }

  function removeSection(crn: string) {
    setSelectedSections((prev) => prev.filter((s) => s.crn !== crn));
  }

  async function generate() {
    if (selectedSections.length === 0) return;
    setGenerating(true);
    setGenError(null);

    const preferences: SchedulePreferences = {
      preferredDays: prefDays
        ? prefDays.split(",").map((d) => d.trim())
        : undefined,
      earliestTime: earliest || undefined,
      latestTime: latest || undefined,
    };

    try {
      const response = await sendMessage({
        type: "GENERATE_SCHEDULE",
        payload: { sections: selectedSections, preferences },
      });

      if (response.success) {
        setSchedules(response.data as GeneratedSchedule[]);
      } else {
        setGenError(response.error ?? "Failed to generate schedules");
      }
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setGenerating(false);
    }
  }

  function formatMeetingDays(section: SSBSection): string {
    return section.meetingsFaculty
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
        return `${mt.meetingTypeDescription}: ${days} ${start}-${end} (${mt.buildingDescription} ${mt.room})`;
      })
      .join(" | ");
  }

  return (
    <div className="flex flex-col gap-3">
      <Card title="Search Sections">
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
        <Card title={`Results (${ssbSections.length} sections)`}>
          <div className="max-h-64 overflow-y-auto">
            {ssbSections.map((sec) => {
              const primaryInstructor =
                sec.faculty.find((f) => f.primaryIndicator)?.displayName ??
                sec.faculty[0]?.displayName ??
                "TBA";
              const isAdded = selectedSections.some(
                (s) => s.crn === sec.courseReferenceNumber,
              );

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
                        {primaryInstructor} · {sec.instructionalMethodDescription}
                      </span>
                      <br />
                      <span className="text-xs text-gray-500">
                        {formatMeetingDays(sec)}
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
                        {sec.waitCount > 0 && ` · ${sec.waitCount} waitlisted`}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant={isAdded ? "secondary" : "primary"}
                      onClick={() => addSSBSection(sec)}
                      disabled={isAdded}
                    >
                      {isAdded ? "Added" : "Add"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {selectedSections.length > 0 && (
        <Card title={`Selected (${selectedSections.length})`}>
          {selectedSections.map((s) => (
            <div
              key={`${s.crn}-${s.days}-${s.startTime}`}
              className="flex items-center justify-between border-b border-gray-100 py-1.5 text-sm last:border-0"
            >
              <span>
                <strong>{s.courseId}</strong> — CRN {s.crn} — {s.days}{" "}
                {s.startTime}–{s.endTime}
              </span>
              <button
                type="button"
                onClick={() => removeSection(s.crn)}
                className="cursor-pointer border-0 bg-transparent text-sm text-red-600"
              >
                Remove
              </button>
            </div>
          ))}
        </Card>
      )}

      <Card title="Preferences">
        <div className="grid grid-cols-2 gap-2">
          <Input
            label="Preferred Days"
            value={prefDays}
            onChange={(e) => setPrefDays(e.target.value)}
            placeholder="M,W,F"
          />
          <div />
          <Input
            label="Earliest"
            type="time"
            value={earliest}
            onChange={(e) => setEarliest(e.target.value)}
          />
          <Input
            label="Latest"
            type="time"
            value={latest}
            onChange={(e) => setLatest(e.target.value)}
          />
        </div>
      </Card>

      <Button
        onClick={generate}
        loading={generating}
        disabled={selectedSections.length === 0}
      >
        Generate Schedules
      </Button>

      {genError && (
        <div className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">
          {genError}
        </div>
      )}

      {schedules.map((s, i) => (
        <ScheduleCard
          key={i}
          schedule={s}
          index={i}
          onSelect={() => {
            const crns = s.sections.map((sec) => sec.crn).join(", ");
            void navigator.clipboard.writeText(crns);
          }}
        />
      ))}
    </div>
  );
}
