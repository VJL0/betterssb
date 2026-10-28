import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Slider } from "@workspace/ui/components/slider";
import { axeViolations } from "../test/axe";

function MinimumRating({ onChange }: { onChange?: (value: number) => void }) {
  const [value, setValue] = useState(1);
  return (
    <Slider
      label="Minimum instructor rating"
      min={1}
      max={5}
      step={0.5}
      value={value}
      fill="end"
      valueText={(v) => `${v} or higher`}
      onValueChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

describe("Slider", () => {
  it("is a named range input that says its value", () => {
    render(<MinimumRating />);
    const slider = screen.getByRole("slider", {
      name: "Minimum instructor rating",
    });
    expect(slider.getAttribute("aria-valuetext")).toBe("1 or higher");
  });

  it("moves by its step with the arrow keys", () => {
    const onChange = vi.fn();
    render(<MinimumRating onChange={onChange} />);
    const slider = screen.getByRole("slider");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith(1.5);
    expect(slider.getAttribute("aria-valuetext")).toBe("1.5 or higher");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<MinimumRating />);
    expect(await axeViolations(container)).toEqual([]);
  });
});
