import * as React from "react";

import { cn } from "@/lib/utils";
import { Button, type buttonVariants } from "@/components/ui/button";
import { BusyButton } from "@/components/ui/busy-button";
import { FieldError } from "@/components/ui/field-error";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { VariantProps } from "class-variance-authority";

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  /** Body content rendered between the header and footer. */
  body?: React.ReactNode;
  /** Error line rendered below the body (e.g. a mutation error message). */
  error?: string | null;
  confirmLabel: React.ReactNode;
  /** Label shown on the confirm button while `isPending`. */
  pendingLabel?: React.ReactNode;
  cancelLabel?: React.ReactNode;
  variant?: VariantProps<typeof buttonVariants>["variant"];
  onConfirm: () => void;
  isPending?: boolean;
  disabled?: boolean;
  className?: string;
};

/**
 * A Cancel + confirm modal built on Dialog + DialogFooter + BusyButton.
 * The confirm button swaps to `pendingLabel` and disables while pending;
 * Cancel closes via the dialog's `onOpenChange`.
 */
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  error,
  confirmLabel,
  pendingLabel,
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  isPending = false,
  disabled = false,
  className,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-md", className)} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {body}

        <FieldError>{error}</FieldError>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isPending}>
              {cancelLabel}
            </Button>
          </DialogClose>
          <BusyButton
            variant={variant}
            onClick={onConfirm}
            isPending={isPending}
            pendingLabel={pendingLabel}
            disabled={disabled}
          >
            {confirmLabel}
          </BusyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { ConfirmDialog };
