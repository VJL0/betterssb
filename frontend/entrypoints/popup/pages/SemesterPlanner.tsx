import { useState } from "react";
import type { Section } from "@/types";
import { Card, Button, Input } from "@/components/ui";
import { ScheduleGrid } from "@/components/schedule/ScheduleGrid";

interface PlannedCourse {
  courseId: string;
  title: string;
  credits: number;
  section?: Section;
}

export function SemesterPlanner() {
  const [courses, setCourses] = useState<PlannedCourse[]>([]);
  const [courseId, setCourseId] = useState("");
  const [title, setTitle] = useState("");
  const [credits, setCredits] = useState("3");

  function addCourse() {
    if (!courseId) return;
    setCourses((prev) => [
      ...prev,
      { courseId, title, credits: Number(credits) || 3 },
    ]);
    setCourseId("");
    setTitle("");
    setCredits("3");
  }

  function removeCourse(index: number) {
    setCourses((prev) => prev.filter((_, i) => i !== index));
  }

  const totalCredits = courses.reduce((sum, c) => sum + c.credits, 0);
  const sectionsForGrid = courses
    .filter((c) => c.section)
    .map((c) => c.section!);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <Card title="Add Course">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
          <Input
            label="Course ID"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            placeholder="CS 101"
          />
          <Input
            label="Credits"
            type="number"
            value={credits}
            onChange={(e) => setCredits(e.target.value)}
            placeholder="3"
          />
          <div style={{ gridColumn: "span 2" }}>
            <Input
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Intro to Computer Science"
            />
          </div>
        </div>
        <div style={{ marginTop: "10px" }}>
          <Button size="sm" variant="secondary" onClick={addCourse} disabled={!courseId}>
            Add Course
          </Button>
        </div>
      </Card>

      <Card title={`Plan — ${totalCredits} Credits`}>
        {courses.length === 0 ? (
          <div style={{ color: "#9ca3af", fontSize: "13px" }}>
            No courses added yet.
          </div>
        ) : (
          courses.map((c, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 0",
                borderBottom: i < courses.length - 1 ? "1px solid #f3f4f6" : "none",
                fontSize: "13px",
              }}
            >
              <div>
                <strong>{c.courseId}</strong>
                {c.title && <span style={{ color: "#6b7280" }}> — {c.title}</span>}
                <span style={{ color: "#9ca3af", marginLeft: "8px" }}>
                  {c.credits} cr
                </span>
              </div>
              <button
                onClick={() => removeCourse(i)}
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
          ))
        )}
      </Card>

      {sectionsForGrid.length > 0 && (
        <Card title="Weekly Schedule">
          <ScheduleGrid sections={sectionsForGrid} />
        </Card>
      )}
    </div>
  );
}
