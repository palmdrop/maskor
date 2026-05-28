import { useState, useRef, useEffect, useCallback } from "react";
import { Command } from "cmdk";
import { Popover as PopoverPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

// Mirrors validateCategoryPath in @maskor/shared. Inlined here because the
// shared barrel re-exports a pino-based logger that crashes in the browser.
const SEGMENT_REGEX = /^[\p{L}\p{N} _-]+$/u;

export const validateCategoryPathClient = (raw: string): string | null => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  if (trimmed.startsWith("/") || trimmed.endsWith("/"))
    throw new Error("Category must not start or end with a slash");
  if (trimmed.startsWith(".") || trimmed.endsWith("."))
    throw new Error("Category must not start or end with a dot");

  for (const segment of trimmed.split("/")) {
    if (segment.length === 0)
      throw new Error("Category must not contain empty segments (doubled slashes)");
    if (segment === "." || segment === "..")
      throw new Error("Category must not contain `.` or `..` segments");
    if (!SEGMENT_REGEX.test(segment))
      throw new Error(
        "Category segments may only contain letters, numbers, spaces, hyphens, and underscores",
      );
  }

  return trimmed;
};

type Props = {
  serverValue: string | null | undefined;
  existingCategories: string[];
  onChange: (value: string | null) => void;
  error?: string | null;
};

export const CategoryField = ({ serverValue, existingCategories, onChange, error }: Props) => {
  const [inputText, setInputText] = useState(serverValue ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const commandRef = useRef<HTMLDivElement>(null);

  // Sync input from server only when the user is not editing
  useEffect(() => {
    if (!isFocused) {
      setInputText(serverValue ?? "");
      setValidationError(null);
    }
  }, [serverValue, isFocused]);

  const filtered = existingCategories
    .filter((category) =>
      inputText.length === 0 ? true : category.toLowerCase().startsWith(inputText.toLowerCase()),
    )
    .sort((a, b) => a.localeCompare(b));

  const handleChange = useCallback(
    (text: string) => {
      setInputText(text);
      try {
        const validated = validateCategoryPathClient(text);
        setValidationError(null);
        onChange(validated);
      } catch (err) {
        setValidationError((err as Error).message);
      }
    },
    [onChange],
  );

  const handleSelect = useCallback(
    (value: string) => {
      setInputText(value);
      setValidationError(null);
      onChange(value || null);
      setOpen(false);
      inputRef.current?.blur();
    },
    [onChange],
  );

  const displayError = validationError ?? error;

  return (
    <div className="flex flex-col gap-2">
      <Label>Category</Label>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Anchor asChild>
          <Input
            ref={inputRef}
            value={inputText}
            placeholder="e.g. world/places (empty for root)"
            onChange={(event) => {
              handleChange(event.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              setIsFocused(true);
              setOpen(true);
            }}
            onBlur={() => {
              setIsFocused(false);
              setTimeout(() => setOpen(false), 150);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(false);
                inputRef.current?.blur();
                return;
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
        {filtered.length > 0 && (
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
                  {filtered.map((option) => (
                    <Command.Item
                      key={option}
                      value={option}
                      onSelect={handleSelect}
                      className={cn(
                        "cursor-pointer rounded-md px-2 py-1.5 text-sm font-mono outline-none",
                        "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
                      )}
                    >
                      {option}
                    </Command.Item>
                  ))}
                </Command.List>
              </Command>
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        )}
      </PopoverPrimitive.Root>
      {displayError && <p className="text-xs text-destructive">{displayError}</p>}
    </div>
  );
};
