import type { ReactNode } from "react";
import { Label } from "@components/ui/label";

type Props = {
  /** Ties the `<Label htmlFor>` to the control. */
  id?: string;
  label: ReactNode;
  description?: ReactNode;
  error?: string | null;
  /** The control element — a Switch, or a Slider. */
  control: ReactNode;
  /**
   * A value readout (e.g. "16px", "80%"). Its presence selects the stacked slider layout
   * (label + readout above the full-width control); without it the row is the inline switch
   * layout (label + description on the left, control on the right).
   */
  valueLabel?: ReactNode;
};

/**
 * Presentational layout for one project setting: label, optional description, a control slot,
 * and an optional error line. State (value / draft / save / error) comes from `useProjectSetting`
 * at the call site — this component holds none.
 */
export const SettingRow = ({ id, label, description, error, control, valueLabel }: Props) => {
  if (valueLabel !== undefined) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={id}>{label}</Label>
          <span className="text-sm text-muted-foreground tabular-nums">{valueLabel}</span>
        </div>
        {control}
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <Label htmlFor={id}>{label}</Label>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {control}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
};
