import type { GeneratedSchedule } from "@/types";
import { Card, Button, Badge } from "@/components/ui";
import { ScheduleGrid } from "./ScheduleGrid";

interface ScheduleCardProps {
  schedule: GeneratedSchedule;
  index: number;
  onSelect: () => void;
}

export function ScheduleCard({ schedule, index, onSelect }: ScheduleCardProps) {
  return (
    <Card>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <div>
          <span style={{ fontWeight: 600, fontSize: "15px", color: "#1f2937" }}>
            Option {index + 1}
          </span>
          <Badge
            text={`Score: ${schedule.score.toFixed(1)}`}
            color={
              schedule.score >= 80
                ? "green"
                : schedule.score >= 60
                  ? "yellow"
                  : "red"
            }
          />
        </div>
        <Button size="sm" onClick={onSelect}>
          Select
        </Button>
      </div>

      {schedule.warnings.length > 0 && (
        <div
          style={{
            marginBottom: "10px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          {schedule.warnings.map((w, i) => (
            <div
              key={i}
              style={{
                fontSize: "12px",
                color: "#92400e",
                background: "#fef3c7",
                padding: "4px 8px",
                borderRadius: "6px",
              }}
            >
              {w}
            </div>
          ))}
        </div>
      )}

      <ScheduleGrid sections={schedule.sections} />
    </Card>
  );
}
