import { useStorage } from "@/hooks/useStorage";
import { SchoolCombobox } from "@/components/SchoolCombobox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card";
import {
  Field,
  FieldContent,
  FieldLabel,
} from "@workspace/ui/components/field";
import { Switch } from "@workspace/ui/components/switch";
import type { RMPSchool } from "@workspace/shared/types";

export function RateMyProfessorPage() {
  const [school, setSchool] = useStorage<RMPSchool | null>(
    "betterssb:school",
    null,
  );
  const [enableRmp, setEnableRmp] = useStorage("betterssb:enableRmp", true);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Pick your school so professor lookups match Rate My Professor. Ratings
        show on course and plan pages when enabled.
      </p>

      <Card size="sm">
        <CardHeader>
          <CardTitle>School</CardTitle>
        </CardHeader>
        <CardContent>
          <Field>
            <FieldLabel htmlFor="rmp-school" className="sr-only">
              School
            </FieldLabel>
            <SchoolCombobox
              id="rmp-school"
              value={school}
              onSelect={(s) => void setSchool(s)}
            />
          </Field>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Display</CardTitle>
        </CardHeader>
        <CardContent>
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="rmp-enabled">
                Show professor ratings on Banner pages
              </FieldLabel>
            </FieldContent>
            <Switch
              id="rmp-enabled"
              checked={enableRmp}
              onCheckedChange={(checked) => void setEnableRmp(checked)}
            />
          </Field>
        </CardContent>
      </Card>
    </div>
  );
}
