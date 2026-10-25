"use client";

import { useId, useState, type FormEvent } from "react";
import {
  TEMPLE_SEASONS,
  splitTempleTerm,
  templeTermCode,
  templeTermName,
  type TempleSeasonCode,
} from "@workspace/shared/lib/terms";
import { Button } from "@workspace/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog";
import { Field, FieldError, FieldTitle } from "@workspace/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";

/** Years offered on either side of the term being edited, or of this year. */
const YEARS_AROUND = 6;
const FALL: TempleSeasonCode = "36";

interface TermDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The term being edited, or null to add one. */
  editing: { code: string; name: string; hasSections: boolean } | null;
  /** Terms already in the plan, which can't be picked again. */
  taken: ReadonlySet<string>;
  onSubmit: (code: string, name: string) => void;
}

/** Add a term, or change which term a planned one is, by season and year. */
export function TermDialog({ open, onOpenChange, ...props }: TermDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Mounted only while open, so each opening starts from `editing`. */}
        {open && <TermForm {...props} />}
      </DialogContent>
    </Dialog>
  );
}

function TermForm({
  editing,
  taken,
  onSubmit,
}: Omit<TermDialogProps, "open" | "onOpenChange">) {
  const seasonId = useId();
  const yearId = useId();
  const start = editing ? splitTempleTerm(editing.code) : null;
  const [firstYear] = useState(() => start?.year ?? new Date().getFullYear());
  const [season, setSeason] = useState<TempleSeasonCode>(start?.season ?? FALL);
  const [year, setYear] = useState(firstYear);

  const years = Array.from(
    { length: YEARS_AROUND * 2 + 1 },
    (_, i) => firstYear - YEARS_AROUND + i,
  );
  const code = templeTermCode(year, season);
  const name = templeTermName(code) ?? code;
  const unchanged = code === editing?.code;
  const alreadyPlanned = !unchanged && taken.has(code);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (alreadyPlanned || unchanged) return;
    onSubmit(code, name);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <DialogHeader>
        <DialogTitle>
          {editing ? `Change ${editing.name}` : "Add a term"}
        </DialogTitle>
        <DialogDescription>
          {editing
            ? editing.hasSections
              ? "Its courses move to the term you pick. Sections stay behind, since a CRN only works in its own term."
              : "Its courses move to the term you pick."
            : "Plan any term, including summers."}
        </DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-4">
        <Field>
          <FieldTitle id={seasonId}>Season</FieldTitle>
          <Select
            items={TEMPLE_SEASONS.map((s) => ({
              value: s.code,
              label: s.name,
            }))}
            value={season}
            onValueChange={(value) => value && setSeason(value)}
          >
            <SelectTrigger aria-labelledby={seasonId} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TEMPLE_SEASONS.map((s) => (
                <SelectItem key={s.code} value={s.code}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldTitle id={yearId}>Year</FieldTitle>
          <Select
            items={years.map((y) => ({ value: y, label: String(y) }))}
            value={year}
            onValueChange={(value) => value && setYear(value)}
          >
            <SelectTrigger aria-labelledby={yearId} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      {alreadyPlanned && (
        <FieldError>{name} is already in your plan.</FieldError>
      )}

      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={alreadyPlanned || unchanged}>
          {editing ? `Move to ${name}` : `Add ${name}`}
        </Button>
      </DialogFooter>
    </form>
  );
}
