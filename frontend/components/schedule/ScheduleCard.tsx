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
      <div className="mb-3 flex items-center justify-between">
        <div>
          <span className="text-base font-semibold text-gray-800">
            Option {index + 1}
          </span>
          <Badge
            className="ml-2 align-middle"
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
        <div className="mb-2.5 flex flex-col gap-1">
          {schedule.warnings.map((w, i) => (
            <div
              key={i}
              className="rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-900"
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
