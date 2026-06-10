import * as React from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type SegmentedControlOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
  title?: string;
};

type SegmentedControlProps<T extends string> = {
  options: readonly SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Disables the whole control (e.g. while a mutation is pending). */
  disabled?: boolean;
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  "aria-label"?: string;
};

/**
 * A row of mutually-exclusive options rendered as buttons: the selected option
 * uses the `default` variant, the rest `outline`. Replaces the hand-rolled
 * `variant={value === x ? "default" : "outline"}` button rows.
 */
function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  size = "sm",
  className,
  "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-slot="segmented-control"
      className={cn("flex gap-1", className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Button
            key={option.value}
            type="button"
            size={size}
            variant={selected ? "default" : "outline"}
            aria-pressed={selected}
            disabled={disabled || option.disabled}
            title={option.title}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

export { SegmentedControl };
export type { SegmentedControlOption };
