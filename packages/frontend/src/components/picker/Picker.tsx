import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "cmdk";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PickerProps<T> {
  items: T[];
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  renderItem?: (item: T) => ReactNode;
  placeholder: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: T) => void;
}

export function Picker<T>({
  items,
  getKey,
  getLabel,
  renderItem,
  placeholder,
  open,
  onOpenChange,
  onSelect,
}: PickerProps<T>) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2",
            "overflow-hidden rounded-xl bg-popover text-popover-foreground ring-1 ring-foreground/10",
            "duration-100 outline-none",
            "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          )}
        >
          <DialogPrimitive.Title className="sr-only">{placeholder}</DialogPrimitive.Title>
          <Command loop>
            <CommandInput
              placeholder={placeholder}
              className="w-full border-b border-border bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <CommandList className="max-h-72 overflow-y-auto p-1">
              <CommandEmpty className="px-3 py-6 text-center text-sm text-muted-foreground">
                No items found.
              </CommandEmpty>
              {items.map((item) => (
                <CommandItem
                  key={getKey(item)}
                  value={getLabel(item)}
                  className="flex cursor-pointer items-center rounded px-2 py-1.5 text-sm data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                  onSelect={() => {
                    onSelect(item);
                    onOpenChange(false);
                  }}
                >
                  {renderItem ? renderItem(item) : getLabel(item)}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
