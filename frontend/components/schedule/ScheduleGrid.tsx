import type { Section } from "@/types";

interface ScheduleGridProps {
  sections: Section[];
}

const DAYS = ["M", "T", "W", "R", "F"];
const DAY_LABELS: Record<string, string> = {
  M: "Mon",
  T: "Tue",
  W: "Wed",
  R: "Thu",
  F: "Fri",
};
const START_HOUR = 8;
const END_HOUR = 22;
const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60;

const COLORS = [
  "#818cf8",
  "#34d399",
  "#f472b6",
  "#fbbf24",
  "#60a5fa",
  "#a78bfa",
  "#fb923c",
  "#2dd4bf",
];

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToLabel(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return m === 0
    ? `${h12}${ampm}`
    : `${h12}:${String(m).padStart(2, "0")}${ampm}`;
}

export function ScheduleGrid({ sections }: ScheduleGridProps) {
  const courseColorMap = new Map<string, string>();
  let colorIdx = 0;

  function getColor(courseId: string): string {
    if (!courseColorMap.has(courseId)) {
      courseColorMap.set(courseId, COLORS[colorIdx % COLORS.length]);
      colorIdx++;
    }
    return courseColorMap.get(courseId)!;
  }

  const hours = Array.from(
    { length: END_HOUR - START_HOUR },
    (_, i) => START_HOUR + i,
  );

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "48px repeat(5, 1fr)",
        gridTemplateRows: `32px repeat(${hours.length}, 48px)`,
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        overflow: "hidden",
        fontSize: "11px",
        position: "relative",
      }}
    >
      <div
        style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}
      />
      {DAYS.map((d) => (
        <div
          key={d}
          style={{
            background: "#f9fafb",
            borderBottom: "1px solid #e5e7eb",
            borderLeft: "1px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 600,
            color: "#374151",
          }}
        >
          {DAY_LABELS[d]}
        </div>
      ))}

      {hours.map((h, row) => (
        <div
          key={h}
          style={{
            gridColumn: 1,
            gridRow: row + 2,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            paddingTop: "2px",
            color: "#9ca3af",
            borderBottom: "1px solid #f3f4f6",
            fontSize: "10px",
          }}
        >
          {minutesToLabel(h * 60)}
        </div>
      ))}

      {DAYS.map((_, di) =>
        hours.map((_, ri) => (
          <div
            key={`cell-${di}-${ri}`}
            style={{
              gridColumn: di + 2,
              gridRow: ri + 2,
              borderLeft: "1px solid #e5e7eb",
              borderBottom: "1px solid #f3f4f6",
            }}
          />
        )),
      )}

      {sections.map((section) => {
        const startMin = timeToMinutes(section.startTime);
        const endMin = timeToMinutes(section.endTime);
        const color = getColor(section.courseId);

        return section.days.split("").map((day) => {
          const dayIndex = DAYS.indexOf(day);
          if (dayIndex === -1) return null;

          const topPct = ((startMin - START_HOUR * 60) / TOTAL_MINUTES) * 100;
          const heightPct = ((endMin - startMin) / TOTAL_MINUTES) * 100;

          return (
            <div
              key={`${section.crn}-${day}`}
              style={{
                gridColumn: dayIndex + 2,
                gridRow: `2 / -1`,
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: `${topPct}%`,
                  height: `${heightPct}%`,
                  left: "2px",
                  right: "2px",
                  background: color,
                  borderRadius: "4px",
                  padding: "2px 4px",
                  color: "#fff",
                  fontSize: "10px",
                  fontWeight: 500,
                  overflow: "hidden",
                  lineHeight: 1.3,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <span style={{ fontWeight: 700 }}>{section.courseId}</span>
                <span style={{ opacity: 0.9 }}>
                  {section.instructor.split(" ").pop()}
                </span>
                <span style={{ opacity: 0.8 }}>{section.location}</span>
              </div>
            </div>
          );
        });
      })}
    </div>
  );
}
