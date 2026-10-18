import type { GeneratedSchedule } from "@workspace/shared/types";
import { Badge } from "@workspace/ui/components/badge";
import { Button } from "@workspace/ui/components/button";
import { Card, CardContent } from "@workspace/ui/components/card";
import { ScheduleGrid } from "./ScheduleGrid";

interface ScheduleCardProps {
  schedule: GeneratedSchedule;
  index: number;
  onSelect: () => void;
}

export function ScheduleCard({ schedule, index, onSelect }: ScheduleCardProps) {
  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <span className="text-base font-semibold text-foreground">
              Option {index + 1}
            </span>
            <Badge
              className="ml-2 align-middle"
              variant={
                schedule.score >= 80
                  ? "success"
                  : schedule.score >= 60
                    ? "warning"
                    : "destructive"
              }
            >
              Score: {schedule.score.toFixed(1)}
            </Badge>
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
                className="rounded-md bg-warning/10 px-2 py-1 text-xs text-warning"
              >
                {w}
              </div>
            ))}
          </div>
        )}

        <ScheduleGrid sections={schedule.sections} />
      </CardContent>
    </Card>
  );
}
