import { useState, useRef } from "react";
import { Command } from "cmdk";
import { Popover as PopoverPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { Input } from "./input";

export type OptionGroup = { label: string | null; options: string[] };

type Props = {
  availableOptions?: string[];
  groups?: OptionGroup[];
  placeholder?: string;
  onSelect: (value: string) => void;
  onCreate?: (query: string) => void | Promise<void>;
};

export function TagCombobox({
  availableOptions,
  groups,
  placeholder = "Add — type to filter",
  onSelect,
  onCreate,
}: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const commandRef = useRef<HTMLDivElement>(null);

  const trimmedQuery = query.trim();

  const allOptions = groups ? groups.flatMap((g) => g.options) : (availableOptions ?? []);

  const filteredGroups: OptionGroup[] = groups
    ? groups
        .map((g) => ({
          label: g.label,
          options: g.options.filter((option) =>
            option.toLowerCase().includes(query.toLowerCase()),
          ),
        }))
        .filter((g) => g.options.length > 0)
    : [
        {
          label: null,
          options: (availableOptions ?? []).filter((option) =>
            option.toLowerCase().includes(query.toLowerCase()),
          ),
        },
      ];

  const showCreate =
    !!onCreate &&
    trimmedQuery.length > 0 &&
    !allOptions.some((option) => option.toLowerCase() === trimmedQuery.toLowerCase());

  const hasOptions = filteredGroups.some((g) => g.options.length > 0);

  function handleSelect(value: string) {
    onSelect(value);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  async function handleCreate() {
    if (!onCreate) return;
    try {
      await onCreate(trimmedQuery);
      setQuery("");
      setOpen(false);
      inputRef.current?.blur();
    } catch {
      // Parent surfaces the error; keep the query so the user can retry or edit.
    }
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Anchor asChild>
        <Input
          ref={inputRef}
          value={query}
          placeholder={placeholder}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setOpen(false);
              inputRef.current?.blur();
              return;
            }

            if (event.key === "Enter" && open) {
              const firstOption = filteredGroups[0]?.options[0];
              const singleOption = hasOptions && filteredGroups.flatMap((g) => g.options).length === 1;
              if (showCreate || singleOption) {
                event.preventDefault();
                // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                showCreate ? handleCreate() : firstOption && handleSelect(firstOption);
                return;
              }
            }

            if (["ArrowUp", "ArrowDown", "Enter"].includes(event.key) && open) {
              event.preventDefault();
              commandRef.current?.dispatchEvent(
                new KeyboardEvent("keydown", { key: event.key, bubbles: true }),
              );
            }
          }}
        />
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          onOpenAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (inputRef.current?.contains(event.target as Node)) {
              event.preventDefault();
              return;
            }
            setOpen(false);
          }}
          side="bottom"
          align="start"
          sideOffset={4}
          className={cn(
            "z-50 w-(--radix-popper-anchor-width) rounded-lg border border-input bg-popover text-popover-foreground shadow-md",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          )}
        >
          <Command ref={commandRef} shouldFilter={false}>
            <Command.List className="max-h-48 overflow-y-auto p-1">
              {!hasOptions && !showCreate && (
                <Command.Empty className="py-2 px-3 text-sm text-muted-foreground">
                  No options available.
                </Command.Empty>
              )}
              {filteredGroups.map((group) =>
                group.label ? (
                  <Command.Group
                    key={group.label}
                    heading={group.label}
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:font-mono"
                  >
                    {group.options.map((option) => (
                      <Command.Item
                        key={option}
                        value={option}
                        onSelect={handleSelect}
                        className={cn(
                          "cursor-pointer rounded-md px-2 py-1.5 text-sm outline-none",
                          "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
                        )}
                      >
                        {option}
                      </Command.Item>
                    ))}
                  </Command.Group>
                ) : (
                  group.options.map((option) => (
                    <Command.Item
                      key={option}
                      value={option}
                      onSelect={handleSelect}
                      className={cn(
                        "cursor-pointer rounded-md px-2 py-1.5 text-sm outline-none",
                        "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
                      )}
                    >
                      {option}
                    </Command.Item>
                  ))
                ),
              )}
              {showCreate && (
                <Command.Item
                  key="__create"
                  value={`__create:${trimmedQuery}`}
                  onSelect={handleCreate}
                  className={cn(
                    "cursor-pointer rounded-md px-2 py-1.5 text-sm outline-none text-muted-foreground",
                    "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
                  )}
                >
                  Create <span className="font-mono text-foreground">{trimmedQuery}</span>
                </Command.Item>
              )}
            </Command.List>
          </Command>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
