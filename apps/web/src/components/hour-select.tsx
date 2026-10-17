import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { MINUTES_PER_HOUR } from "@workspace/shared/lib/meeting-times";

const FIRST_HOUR = 7;
const LAST_HOUR = 22;
const NOON_HOUR = 12;
const ANY = "any";

function hourOptions() {
  const options = [{ value: ANY, label: "Any time" }];
  for (let hour = FIRST_HOUR; hour <= LAST_HOUR; hour++) {
    const twelve = hour % NOON_HOUR || NOON_HOUR;
    options.push({
      value: String(hour * MINUTES_PER_HOUR),
      label: `${twelve}:00 ${hour >= NOON_HOUR ? "PM" : "AM"}`,
    });
  }
  return options;
}
const HOURS = hourOptions();

interface HourSelectProps {
  label: string;
  /** Minutes after midnight on the hour, or null for any time. */
  value: number | null;
  onChange: (minutes: number | null) => void;
  className?: string;
}

/** An hour of the day from 7 AM to 10 PM, or "Any time". */
export function HourSelect({
  label,
  value,
  onChange,
  className,
}: HourSelectProps) {
  return (
    <Select
      items={HOURS}
      value={value === null ? ANY : String(value)}
      onValueChange={(picked) =>
        onChange(picked === ANY || picked === null ? null : Number(picked))
      }
    >
      <SelectTrigger aria-label={label} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {HOURS.map((hour) => (
          <SelectItem key={hour.value} value={hour.value}>
            {hour.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
