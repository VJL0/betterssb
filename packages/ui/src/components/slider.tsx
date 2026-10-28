"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { cn } from "cn";

type SliderProps = Omit<
  SliderPrimitive.Root.Props<number>,
  "value" | "defaultValue" | "onValueChange"
> & {
  value: number;
  onValueChange: (value: number) => void;
  /** Names the thumb's range input for screen readers. */
  label: string;
  /** What a screen reader says for a value ("3.5 or higher"). */
  valueText?: (value: number) => string;
  /**
   * Which side of the thumb is highlighted: "start" for a maximum (values up
   * to the thumb pass), "end" for a minimum (values from the thumb up pass),
   * "none" while the slider filters nothing.
   */
  fill?: "start" | "end" | "none";
};

/** One value on a track, such as a minimum rating. */
function Slider({
  value,
  onValueChange,
  label,
  valueText,
  fill = "start",
  className,
  ...props
}: SliderProps) {
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      data-fill={fill}
      value={value}
      onValueChange={(next) => onValueChange(next)}
      // A centered thumb overhangs the track's ends by half its width; the
      // padding keeps it inside, so scrolling containers don't clip it.
      className={cn("group/slider w-full px-2", className)}
      {...props}
    >
      <SliderPrimitive.Control className="relative flex h-5 w-full touch-none items-center select-none data-disabled:cursor-not-allowed data-disabled:opacity-50">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-input group-data-[fill=end]/slider:bg-primary"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="h-full bg-primary group-data-[fill=end]/slider:bg-input group-data-[fill=none]/slider:bg-transparent"
          />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          getAriaLabel={() => label}
          getAriaValueText={
            valueText ? (_formatted, current) => valueText(current) : undefined
          }
          className="block size-4 shrink-0 rounded-full border-2 border-primary bg-background shadow-sm transition-[box-shadow] outline-none has-focus-visible:ring-3 has-focus-visible:ring-ring/30 data-dragging:ring-3 data-dragging:ring-ring/30"
        />
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
export type { SliderProps };
