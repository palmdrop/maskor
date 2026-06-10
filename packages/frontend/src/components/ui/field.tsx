import * as React from "react";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/ui/field-error";

type FieldControlProps = {
  id: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
};

type FieldProps = {
  label: React.ReactNode;
  description?: React.ReactNode;
  error?: string | null;
  className?: string;
  labelClassName?: string;
  /**
   * Render the control, wired to the generated id and aria attributes.
   * Spread the supplied props onto the control element:
   * `{(control) => <Input {...control} value={…} />}`
   */
  children: (control: FieldControlProps) => React.ReactNode;
};

function Field({ label, description, error, className, labelClassName, children }: FieldProps) {
  const id = React.useId();
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div data-slot="field" className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} className={labelClassName}>
        {label}
      </Label>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })}
      {description && (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {description}
        </p>
      )}
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}

export { Field };
