import { useState } from "react";
import type { Section, SchedulePreferences, GeneratedSchedule } from "@/types";
import { sendMessage } from "@/lib/messaging";
import { Button, Input, Card } from "@/components/ui";
import { ScheduleCard } from "@/components/schedule/ScheduleCard";

export function ScheduleBuilder() {
  const [sections, setSections] = useState<Section[]>([]);
  const [schedules, setSchedules] = useState<GeneratedSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [crn, setCrn] = useState("");
  const [courseId, setCourseId] = useState("");
  const [instructor, setInstructor] = useState("");
  const [days, setDays] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [location, setLocation] = useState("");

  const [prefDays, setPrefDays] = useState("");
  const [earliest, setEarliest] = useState("08:00");
  const [latest, setLatest] = useState("22:00");

  function addSection() {
    if (!crn || !courseId) return;
    const section: Section = {
      crn,
      courseId,
      instructor,
      days,
      startTime,
      endTime,
      location,
      seatsAvailable: 0,
      maxSeats: 0,
      term: "",
    };
    setSections((prev) => [...prev, section]);
    setCrn("");
    setCourseId("");
    setInstructor("");
    setDays("");
    setLocation("");
  }

  function removeSection(index: number) {
    setSections((prev) => prev.filter((_, i) => i !== index));
  }

  async function generate() {
    if (sections.length === 0) return;
    setLoading(true);
    setError(null);

    const preferences: SchedulePreferences = {
      preferredDays: prefDays ? prefDays.split(",").map((d) => d.trim()) : undefined,
      earliestTime: earliest || undefined,
      latestTime: latest || undefined,
    };

    try {
      const response = await sendMessage({
        type: "GENERATE_SCHEDULE",
        payload: { sections, preferences },
      });

      if (response.success) {
        setSchedules(response.data as GeneratedSchedule[]);
      } else {
        setError(response.error ?? "Failed to generate schedules");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <Card title="Add Section">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <Input label="CRN" value={crn} onChange={(e) => setCrn(e.target.value)} placeholder="12345" />
          <Input label="Course ID" value={courseId} onChange={(e) => setCourseId(e.target.value)} placeholder="CS 101" />
          <Input label="Instructor" value={instructor} onChange={(e) => setInstructor(e.target.value)} placeholder="Smith" />
          <Input label="Days" value={days} onChange={(e) => setDays(e.target.value)} placeholder="MWF" />
          <Input label="Start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <Input label="End" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          <Input label="Location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Room 101" />
        </div>
        <div style={{ marginTop: "10px" }}>
          <Button size="sm" variant="secondary" onClick={addSection} disabled={!crn || !courseId}>
            Add Section
          </Button>
        </div>
      </Card>

      {sections.length > 0 && (
        <Card title={`Sections (${sections.length})`}>
          {sections.map((s, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "6px 0",
                borderBottom: i < sections.length - 1 ? "1px solid #f3f4f6" : "none",
                fontSize: "13px",
              }}
            >
              <span>
                <strong>{s.courseId}</strong> — {s.crn} — {s.days} {s.startTime}–{s.endTime}
              </span>
              <button
                onClick={() => removeSection(i)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#dc2626",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontFamily: "inherit",
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </Card>
      )}

      <Card title="Preferences">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <Input label="Preferred Days" value={prefDays} onChange={(e) => setPrefDays(e.target.value)} placeholder="M,W,F" />
          <div />
          <Input label="Earliest" type="time" value={earliest} onChange={(e) => setEarliest(e.target.value)} />
          <Input label="Latest" type="time" value={latest} onChange={(e) => setLatest(e.target.value)} />
        </div>
      </Card>

      <Button onClick={generate} loading={loading} disabled={sections.length === 0}>
        Generate Schedules
      </Button>

      {error && (
        <div style={{ color: "#dc2626", fontSize: "13px", padding: "8px 12px", background: "#fee2e2", borderRadius: "8px" }}>
          {error}
        </div>
      )}

      {schedules.map((s, i) => (
        <ScheduleCard
          key={i}
          schedule={s}
          index={i}
          onSelect={() => {
            const crns = s.sections.map((sec) => sec.crn).join(", ");
            navigator.clipboard.writeText(crns);
          }}
        />
      ))}
    </div>
  );
}
