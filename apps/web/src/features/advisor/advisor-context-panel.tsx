import { useId } from "react";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field";
import { Card } from "@workspace/ui/components/card";
import { Switch } from "@workspace/ui/components/switch";

export type SourceId = "audit" | "transcript" | "plan";

export interface ContextSource {
  id: SourceId;
  label: string;
  /** What's saved, or why there's nothing to share. */
  description: string;
  available: boolean;
  on: boolean;
}

/** Which of the student's records go with each question. */
export function AdvisorContextPanel({
  sources,
  onToggle,
}: {
  sources: readonly ContextSource[];
  onToggle: (id: SourceId, on: boolean) => void;
}) {
  const ids = useId();
  return (
    <Card
      aria-labelledby={`${ids}-heading`}
      className="gap-4 p-4"
      render={<aside />}
    >
      <h2 id={`${ids}-heading`} className="text-base font-medium">
        What the advisor sees
      </h2>
      {sources.map((source) => (
        <Field key={source.id} orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor={`${ids}-${source.id}`}>
              {source.label}
            </FieldLabel>
            <FieldDescription>{source.description}</FieldDescription>
          </FieldContent>
          <Switch
            id={`${ids}-${source.id}`}
            checked={source.available && source.on}
            disabled={!source.available}
            onCheckedChange={(on) => onToggle(source.id, on)}
          />
        </Field>
      ))}
      <p className="text-xs text-muted-foreground">
        This isn't your academic advisor. Check big decisions with them.
      </p>
    </Card>
  );
}
