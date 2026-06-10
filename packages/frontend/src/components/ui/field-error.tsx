import * as React from "react";

import { cn } from "@/lib/utils";

function FieldError({ className, children, ...props }: React.ComponentProps<"p">) {
  if (!children) return null;
  return (
    <p data-slot="field-error" className={cn("text-xs text-destructive", className)} {...props}>
      {children}
    </p>
  );
}

export { FieldError };
