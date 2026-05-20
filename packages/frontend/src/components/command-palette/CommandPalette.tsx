import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, defaultFilter } from "cmdk";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { useCommandsContext } from "@lib/commands/CommandsProvider";
import type { CommandCategory, CommandDef } from "@lib/commands/types";

// --- Hotkey formatting ---

const isMac = () => typeof navigator !== "undefined" && /mac/i.test(navigator.platform);

const KEY_GLYPHS: Record<string, string> = {
  enter: "↵",
  escape: "⎋",
  backspace: "⌫",
  tab: "⇥",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
};

const formatHotkeyParts = (hotkey: string): string[] => {
  const mac = isMac();
  return hotkey.toLowerCase().split("+").map((part) => {
    if (part === "mod") return mac ? "⌘" : "Ctrl";
    if (part === "shift") return "⇧";
    if (part === "alt") return mac ? "⌥" : "Alt";
    if (part === "ctrl") return "⌃";
    return KEY_GLYPHS[part] ?? part.toUpperCase();
  });
};

const HotkeyBadge = ({ hotkey }: { hotkey: string }) => (
  <div className="flex shrink-0 items-center gap-0.5">
    {formatHotkeyParts(hotkey).map((part, index) => (
      <kbd
        key={index}
        className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-muted px-1 font-mono text-[10px] leading-none text-muted-foreground"
      >
        {part}
      </kbd>
    ))}
  </div>
);

// --- Command row ---

const CommandRow = ({
  command,
  effectiveDisabledReason,
}: {
  command: CommandDef;
  effectiveDisabledReason?: string;
}) => (
  <div className="flex w-full items-center justify-between gap-4">
    <span className="truncate">
      {command.label}
      {command.arg ? "…" : ""}
    </span>
    <div className="flex shrink-0 items-center gap-2">
      {effectiveDisabledReason && (
        <span className="max-w-32 truncate text-xs text-muted-foreground/60">
          {effectiveDisabledReason}
        </span>
      )}
      {command.hotkey && <HotkeyBadge hotkey={command.hotkey} />}
    </div>
  </div>
);

// --- Section heading ---

const SectionHeading = ({ children }: { children: string }) => (
  <div className="px-2 py-1 text-xs font-medium text-muted-foreground">{children}</div>
);

// --- Arg loading skeleton ---

const ARG_SKELETON_WIDTHS = ["60%", "45%", "75%", "50%"];

const ArgLoadingSkeleton = () => (
  <>
    {ARG_SKELETON_WIDTHS.map((width) => (
      <div
        key={width}
        data-testid="arg-skeleton"
        className="flex items-center px-2 py-1.5"
      >
        <div className="h-4 animate-pulse rounded bg-muted" style={{ width }} />
      </div>
    ))}
  </>
);

// --- Effective disabled reason ---

const getEffectiveDisabledReason = (command: CommandDef): string | undefined => {
  if (command.disabledReason) return command.disabledReason;
  if (command.arg && Array.isArray(command.arg.items) && command.arg.items.length === 0) {
    return "No items available";
  }
  return undefined;
};

// --- Global category ordering ---

const CATEGORY_ORDER: CommandCategory[] = ["navigation", "create", "project", "other"];
const CATEGORY_LABELS: Record<CommandCategory, string> = {
  navigation: "Navigation",
  create: "Create",
  project: "Project",
  other: "Other",
};

// --- CommandPalette ---

export const CommandPalette = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [step, setStep] = useState<"commands" | "args">("commands");
  const [savedQuery, setSavedQuery] = useState("");
  const [activeArgCommand, setActiveArgCommand] = useState<CommandDef | null>(null);
  const [argItems, setArgItems] = useState<unknown[]>([]);
  const [argLoading, setArgLoading] = useState(false);
  // Bumped on every transition out of an in-flight arg load (Esc, close, picking
  // a different command). Resolutions whose generation no longer matches are
  // discarded so a slow promise from a prior selection can't clobber the
  // current picker's state.
  const argGenerationRef = useRef(0);

  const { getMap, run } = useCommandsContext();

  // Capture-phase listener intercepts Cmd+K and Cmd+Shift+P before editors see them.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return;
      const isK = !event.shiftKey && event.key.toLowerCase() === "k";
      const isShiftP = event.shiftKey && event.key.toLowerCase() === "p";
      if (!isK && !isShiftP) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);

  // Reset all step state when palette closes.
  useEffect(() => {
    if (!open) {
      argGenerationRef.current++;
      setStep("commands");
      setQuery("");
      setSavedQuery("");
      setActiveArgCommand(null);
      setArgItems([]);
      setArgLoading(false);
    }
  }, [open]);

  const sortCommands = (commands: CommandDef[]): CommandDef[] =>
    [...commands].sort((a, b) => {
      const aDisabled = getEffectiveDisabledReason(a) != null;
      const bDisabled = getEffectiveDisabledReason(b) != null;
      if (aDisabled !== bDisabled) return aDisabled ? 1 : -1;
      return a.label.localeCompare(b.label);
    });

  const { viewScopedSections, globalSections } = useMemo(() => {
    const all = Array.from(getMap().values());

    const scopeMap = new Map<string, CommandDef[]>();
    for (const command of all) {
      if (command.scope === "global") continue;
      scopeMap.set(command.scope, [...(scopeMap.get(command.scope) ?? []), command]);
    }
    const viewScopedSections = Array.from(scopeMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([scope, commands]) => ({ scope, commands: sortCommands(commands) }));

    const categoryMap = new Map<CommandCategory, CommandDef[]>(
      CATEGORY_ORDER.map((category) => [category, []]),
    );
    for (const command of all) {
      if (command.scope !== "global") continue;
      categoryMap.get(command.category)?.push(command);
    }
    const globalSections = CATEGORY_ORDER.flatMap((category) => {
      const commands = sortCommands(categoryMap.get(category) ?? []);
      return commands.length > 0 ? [{ category, commands }] : [];
    });

    return { viewScopedSections, globalSections };
    // Snapshot-at-open: sections are computed once per palette opening so
    // section order doesn't reshuffle while the user is typing. Per-row state
    // (disabledReason, arg) stays live because commands are Proxies into the
    // registry; only the grouping/sort order is frozen.
  }, [open]);

  const commandMap = useMemo(
    () => new Map(Array.from(getMap().values()).map((c) => [c.id, c])),
    [open],
  );

  const commandFilter = useCallback(
    (value: string, search: string, keywords?: string[]) => {
      const command = commandMap.get(value);
      if (!command) return 0;
      const score = defaultFilter(command.label, search, keywords);
      const disabled = getEffectiveDisabledReason(command);
      if (disabled) return score > 0 ? score * 0.1 : 0;
      return score;
    },
    [commandMap],
  );

  const handleSelectCommand = async (command: CommandDef) => {
    const effectiveDisabled = getEffectiveDisabledReason(command);
    if (effectiveDisabled) return;

    if (!command.arg) {
      run(command.id);
      setOpen(false);
      return;
    }

    // Transition to arg picker.
    const generation = ++argGenerationRef.current;
    setSavedQuery(query);
    setQuery("");
    setActiveArgCommand(command);
    setStep("args");
    setArgItems([]);
    setArgLoading(true);

    try {
      const resolvedItems =
        typeof command.arg.items === "function"
          ? await (command.arg.items as () => unknown[] | Promise<unknown[]>)()
          : (command.arg.items as unknown[]);
      if (argGenerationRef.current !== generation) return;
      setArgItems(resolvedItems);
    } catch (error) {
      if (argGenerationRef.current !== generation) return;
      console.error("[command-palette] Failed to load arg items:", error);
      setOpen(false);
    } finally {
      if (argGenerationRef.current === generation) {
        setArgLoading(false);
      }
    }
  };

  const handleSelectArg = (item: unknown) => {
    if (!activeArgCommand) return;
    run(activeArgCommand.id, item);
    setOpen(false);
  };

  const handleEscapeKeyDown = (event: Event) => {
    if (step === "args") {
      event.preventDefault();
      argGenerationRef.current++;
      setStep("commands");
      setQuery(savedQuery);
      setSavedQuery("");
      setActiveArgCommand(null);
      setArgItems([]);
      setArgLoading(false);
    }
  };

  const renderCommandItems = (commands: CommandDef[]) =>
    commands.map((command) => {
      const effectiveDisabledReason = getEffectiveDisabledReason(command);
      return (
        <CommandItem
          key={command.id}
          value={command.id}
          disabled={!!effectiveDisabledReason}
          className={cn(
            "flex cursor-pointer items-center rounded px-2 py-1.5 text-sm data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
            effectiveDisabledReason && "cursor-default opacity-50",
          )}
          onSelect={() => void handleSelectCommand(command)}
        >
          <CommandRow command={command} effectiveDisabledReason={effectiveDisabledReason} />
        </CommandItem>
      );
    });

  const renderArgItems = () => {
    if (argLoading) return <ArgLoadingSkeleton />;
    if (!activeArgCommand?.arg) return null;
    const { arg } = activeArgCommand;
    return argItems.map((item) => (
      <CommandItem
        key={arg.getKey(item)}
        value={arg.getLabel(item)}
        className="flex cursor-pointer items-center rounded px-2 py-1.5 text-sm data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
        onSelect={() => handleSelectArg(item)}
      >
        {arg.renderItem ? arg.renderItem(item) : arg.getLabel(item)}
      </CommandItem>
    ));
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
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
          onEscapeKeyDown={handleEscapeKeyDown}
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <Command loop filter={step === "commands" ? commandFilter : undefined}>
            <CommandInput
              placeholder={
                step === "args"
                  ? (activeArgCommand?.arg?.placeholder ?? "Select…")
                  : "Search commands…"
              }
              value={query}
              onValueChange={setQuery}
              className="w-full border-b border-border bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <CommandList className="max-h-80 overflow-y-auto p-1">
              {step === "commands" ? (
                <>
                  <CommandEmpty className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No commands found.
                  </CommandEmpty>
                  {viewScopedSections.map(({ scope, commands }) => (
                    <CommandGroup key={scope} heading={<SectionHeading>{scope}</SectionHeading>}>
                      {renderCommandItems(commands)}
                    </CommandGroup>
                  ))}
                  {globalSections.map(({ category, commands }) => (
                    <CommandGroup
                      key={category}
                      heading={<SectionHeading>{CATEGORY_LABELS[category]}</SectionHeading>}
                    >
                      {renderCommandItems(commands)}
                    </CommandGroup>
                  ))}
                </>
              ) : (
                <>
                  <CommandEmpty className="px-3 py-6 text-center text-sm text-muted-foreground">
                    No items found.
                  </CommandEmpty>
                  {renderArgItems()}
                </>
              )}
            </CommandList>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
