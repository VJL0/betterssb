import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { useSettings } from "@/hooks/use-settings";
import { useTerms } from "@/hooks/use-terms";

/** The global term. Every page plans for this term; it's saved in settings. */
export function TermSelect({ className }: { className?: string }) {
  const terms = useTerms();
  const { settings, update } = useSettings();
  const current = settings.term ?? terms.terms[0]?.code ?? null;
  const items = terms.terms.map((t) => ({ value: t.code, label: t.name }));

  if (terms.status !== "ready") {
    return (
      <span className="text-sm text-muted-foreground">
        {terms.status === "loading" ? "Loading terms…" : "Terms unavailable"}
      </span>
    );
  }

  return (
    <Select
      items={items}
      value={current}
      onValueChange={(code) => {
        if (typeof code === "string") void update({ term: code });
      }}
    >
      <SelectTrigger aria-label="Term" className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
