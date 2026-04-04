import type { Section } from "@/types";
import { cn } from "@/lib/cn";

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

const BG_CLASSES = [
  "bg-indigo-400",
  "bg-emerald-400",
  "bg-pink-400",
  "bg-amber-400",
  "bg-blue-400",
  "bg-violet-400",
  "bg-orange-400",
  "bg-teal-400",
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

  function getBgClass(courseId: string): string {
    if (!courseColorMap.has(courseId)) {
      courseColorMap.set(courseId, BG_CLASSES[colorIdx % BG_CLASSES.length]);
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
      className="relative grid overflow-hidden rounded-lg border border-gray-200 text-xs"
      style={{
        gridTemplateColumns: "48px repeat(5, minmax(0, 1fr))",
        gridTemplateRows: `32px repeat(${hours.length}, 48px)`,
      }}
    >
      <div className="border-b border-gray-200 bg-gray-50" />
      {DAYS.map((d) => (
        <div
          key={d}
          className="flex items-center justify-center border-b border-l border-gray-200 bg-gray-50 font-semibold text-gray-700"
        >
          {DAY_LABELS[d]}
        </div>
      ))}

      {hours.map((h, row) => (
        <div
          key={h}
          className="flex items-start justify-center border-b border-gray-100 pt-0.5 text-xs text-gray-400"
          style={{ gridColumn: 1, gridRow: row + 2 }}
        >
          {minutesToLabel(h * 60)}
        </div>
      ))}

      {DAYS.map((_, di) =>
        hours.map((_, ri) => (
          <div
            key={`cell-${di}-${ri}`}
            className="border-b border-l border-gray-200"
            style={{ gridColumn: di + 2, gridRow: ri + 2 }}
          />
        )),
      )}

      {sections.map((section) => {
        const startMin = timeToMinutes(section.startTime);
        const endMin = timeToMinutes(section.endTime);
        const bgClass = getBgClass(section.courseId);

        return section.days.split("").map((day) => {
          const dayIndex = DAYS.indexOf(day);
          if (dayIndex === -1) return null;

          const topPct = ((startMin - START_HOUR * 60) / TOTAL_MINUTES) * 100;
          const heightPct = ((endMin - startMin) / TOTAL_MINUTES) * 100;

          return (
            <div
              key={`${section.crn}-${day}`}
              className="relative"
              style={{
                gridColumn: dayIndex + 2,
                gridRow: "2 / -1",
              }}
            >
              <div
                className={cn(
                  "absolute left-0.5 right-0.5 flex flex-col overflow-hidden rounded px-1 py-0.5 text-xs font-medium text-white",
                  bgClass,
                )}
                style={{
                  top: `${topPct}%`,
                  height: `${heightPct}%`,
                }}
              >
                <span className="font-bold">{section.courseId}</span>
                <span className="opacity-90">
                  {section.instructor.split(" ").pop()}
                </span>
                <span className="opacity-80">{section.location}</span>
              </div>
            </div>
          );
        });
      })}
    </div>
  );
}
