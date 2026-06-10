import * as React from "react";

import { Button } from "@/components/ui/button";

type BusyButtonProps = React.ComponentProps<typeof Button> & {
  isPending?: boolean;
  /** Label shown while `isPending`. Falls back to `children` when omitted. */
  pendingLabel?: React.ReactNode;
};

/**
 * Button that swaps its label and disables itself while a mutation is pending,
 * absorbing the `{isPending ? "…ing" : "Action"}` ternary repeated across dialogs.
 */
function BusyButton({
  isPending = false,
  pendingLabel,
  disabled,
  children,
  ...props
}: BusyButtonProps) {
  return (
    <Button disabled={disabled || isPending} {...props}>
      {isPending && pendingLabel !== undefined ? pendingLabel : children}
    </Button>
  );
}

export { BusyButton };
