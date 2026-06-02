import { useLayoutEffect, useRef } from "react";
import { Command, CommandInput, CommandList } from "cmdk";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { consumeFocusClaim } from "@lib/focus-intent";

export interface PickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placeholder: string;
  query: string;
  onQueryChange: (query: string) => void;
  filter?: (value: string, search: string, keywords?: string[]) => number;
  title: string;
  onEscapeKeyDown?: (event: Event) => void;
  children: ReactNode;
}

export function Picker({
  open,
  onOpenChange,
  placeholder,
  query,
  onQueryChange,
  filter,
  title,
  onEscapeKeyDown,
  children,
}: PickerProps) {
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // useLayoutEffect fires before Radix's own useEffect focus trap activates,
  // so document.activeElement is still the editor/button at capture time.
  useLayoutEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
    }
  }, [open]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "fixed top-[20%] left-1/2 z-50 w-full max-w-lg -translate-x-1/2",
            "overflow-hidden rounded-xl bg-popover text-popover-foreground ring-1 ring-foreground/10",
            "duration-100 outline-none",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          )}
          onEscapeKeyDown={onEscapeKeyDown}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            // A command run from the palette may intend to move focus elsewhere (e.g. the comment
            // gesture focusing the new comment field). If it registered a claim, honour it instead of
            // restoring focus to the previously-focused element.
            const claim = consumeFocusClaim();
            if (claim) {
              claim();
            } else {
              returnFocusRef.current?.focus();
            }
            returnFocusRef.current = null;
          }}
        >
          <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          <Command loop filter={filter}>
            <CommandInput
              placeholder={placeholder}
              value={query}
              onValueChange={onQueryChange}
              className="w-full border-b border-border bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <CommandList className="max-h-80 overflow-y-auto p-1">{children}</CommandList>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
