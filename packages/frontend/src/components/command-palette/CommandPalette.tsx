import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { CommandEmpty, CommandGroup, CommandItem, defaultFilter } from "cmdk";
import { cn } from "@/lib/utils";
import { Picker } from "@/components/picker/Picker";
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
  return hotkey
    .toLowerCase()
    .split("+")
    .map((part) => {
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
      <div key={width} data-testid="arg-skeleton" className="flex items-center px-2 py-1.5">
        <div className="h-4 animate-pulse rounded bg-muted" style={{ width }} />
      </div>
    ))}
  </>
);

// --- Effective disabled reason ---

const getEffectiveDisabledReason = (command: CommandDef): string | undefined => {
  if (command.disabledReason) return command.disabledReason;
  // `items` is always a thunk on the legacy view — possibly async — so we
  // can't auto-detect empty arg sets here without invoking it on every
  // render. Authors who want the "No items available" indicator return it
  // from `disabled()` directly (cheap, sync, can read ctx).
  return undefined;
};

// --- Global category ordering ---

const CATEGORY_ORDER: CommandCategory[] = ["navigation", "create", "project", "other"];
const CATEGORY_LABELS: Record<CommandCategory, string> = {
  navigation: "Navigation",
  create: "Create",
  project: "Project",
  other: "Other",
  attach: "Attach",
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

  const { getMap, run, getActiveScopes } = useCommandsContext();

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

  // During an active search we collapse sections and render every command in
  // a single flat list. cmdk then sorts by relevance across the whole catalog
  // — section grouping is a *browsing* aid; once the user is typing they want
  // ranking, not grouping. The grouped view is kept for the empty-query state.
  const isSearching = query.trim().length > 0;

  const { viewScopedSections, globalSections, flatCommands } = useMemo(() => {
    const all = Array.from(getMap().values());

    // Active scopes already arrive innermost-first; we render in that order
    // so the most-recently-mounted scope appears at the top of the palette.
    const activeScopes = getActiveScopes();
    const scopeMap = new Map<string, CommandDef[]>();
    for (const command of all) {
      if (command.scope === "global") continue;
      scopeMap.set(command.scope, [...(scopeMap.get(command.scope) ?? []), command]);
    }
    const viewScopedSections = activeScopes.flatMap((active) => {
      const commands = scopeMap.get(active.meta.label);
      if (!commands) return [];
      return [{ scope: active.meta.label, commands: sortCommands(commands) }];
    });

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

    const flatCommands = [
      ...viewScopedSections.flatMap((section) => section.commands),
      ...globalSections.flatMap((section) => section.commands),
    ];

    return { viewScopedSections, globalSections, flatCommands };
    // Snapshot-at-open: sections are computed once per palette opening so
    // section order doesn't reshuffle while the user is typing. Per-row state
    // (disabledReason, arg) stays live because the legacy views into the v2
    // catalog use getters that read ctx through ref on every access.
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
      // `items` is always a parameterless thunk on the legacy view —
      // scope-bound commands have their ctx already captured by the
      // provider before this code runs.
      const resolvedItems = (await command.arg.items()) as unknown[];
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
    <Picker
      open={open}
      onOpenChange={setOpen}
      placeholder={
        step === "args" ? (activeArgCommand?.arg?.placeholder ?? "Select…") : "Search commands…"
      }
      query={query}
      onQueryChange={setQuery}
      filter={step === "commands" ? commandFilter : undefined}
      title="Command palette"
      onEscapeKeyDown={handleEscapeKeyDown}
    >
      {step === "commands" ? (
        <>
          <CommandEmpty className="px-3 py-6 text-center text-sm text-muted-foreground">
            No commands found.
          </CommandEmpty>
          {isSearching ? (
            renderCommandItems(flatCommands)
          ) : (
            <>
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
          )}
        </>
      ) : (
        <>
          <CommandEmpty className="px-3 py-6 text-center text-sm text-muted-foreground">
            No items found.
          </CommandEmpty>
          {renderArgItems()}
        </>
      )}
    </Picker>
  );
};
