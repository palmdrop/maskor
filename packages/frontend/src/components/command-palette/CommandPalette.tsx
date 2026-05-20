import { useState, useEffect, useMemo, useCallback } from "react";
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

function formatHotkeyParts(hotkey: string): string[] {
  const mac = isMac();
  return hotkey.toLowerCase().split("+").map((part) => {
    if (part === "mod") return mac ? "⌘" : "Ctrl";
    if (part === "shift") return "⇧";
    if (part === "alt") return mac ? "⌥" : "Alt";
    if (part === "ctrl") return "⌃";
    return KEY_GLYPHS[part] ?? part.toUpperCase();
  });
}

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

const CommandRow = ({ command }: { command: CommandDef }) => (
  <div className="flex w-full items-center justify-between gap-4">
    <span className="truncate">{command.label}</span>
    <div className="flex shrink-0 items-center gap-2">
      {command.disabledReason && (
        <span className="max-w-32 truncate text-xs text-muted-foreground/60">
          {command.disabledReason}
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

  const sortCommands = (commands: CommandDef[]): CommandDef[] =>
    [...commands].sort((a, b) => {
      const aDisabled = a.disabledReason != null;
      const bDisabled = b.disabledReason != null;
      if (aDisabled !== bDisabled) return aDisabled ? 1 : -1;
      return a.label.localeCompare(b.label);
    });

  const { viewScopedSections, globalSections } = useMemo(() => {
    const all = Array.from(getMap().values());

    // View-scoped: scope !== "global"
    const scopeMap = new Map<string, CommandDef[]>();
    for (const command of all) {
      if (command.scope === "global") continue;
      scopeMap.set(command.scope, [...(scopeMap.get(command.scope) ?? []), command]);
    }
    const viewScopedSections = Array.from(scopeMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([scope, commands]) => ({ scope, commands: sortCommands(commands) }));

    // Global: scope === "global", grouped by category
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
  }, [open]); // recompute when palette opens to pick up latest commands

  // Custom filter: score against label, penalise disabled commands so they sort last.
  const commandMap = useMemo(
    () => new Map(Array.from(getMap().values()).map((c) => [c.id, c])),
    [open],
  );

  const filter = useCallback(
    (value: string, search: string, keywords?: string[]) => {
      const command = commandMap.get(value);
      if (!command) return 0;
      const score = defaultFilter(command.label, search, keywords);
      if (command.disabledReason) return score > 0 ? score * 0.1 : 0;
      return score;
    },
    [commandMap],
  );

  const handleSelect = (command: CommandDef) => {
    if (command.disabledReason) return;
    run(command.id);
    setOpen(false);
  };

  const renderItems = (commands: CommandDef[]) =>
    commands.map((command) => (
      <CommandItem
        key={command.id}
        value={command.id}
        disabled={!!command.disabledReason}
        className={cn(
          "flex cursor-pointer items-center rounded px-2 py-1.5 text-sm data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
          command.disabledReason && "cursor-default opacity-50",
        )}
        onSelect={() => handleSelect(command)}
      >
        <CommandRow command={command} />
      </CommandItem>
    ));

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
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <Command loop filter={filter}>
            <CommandInput
              placeholder="Search commands…"
              className="w-full border-b border-border bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <CommandList className="max-h-80 overflow-y-auto p-1">
              <CommandEmpty className="px-3 py-6 text-center text-sm text-muted-foreground">
                No commands found.
              </CommandEmpty>

              {viewScopedSections.map(({ scope, commands }) => (
                <CommandGroup key={scope} heading={<SectionHeading>{scope}</SectionHeading>}>
                  {renderItems(commands)}
                </CommandGroup>
              ))}

              {globalSections.map(({ category, commands }) => (
                <CommandGroup
                  key={category}
                  heading={<SectionHeading>{CATEGORY_LABELS[category]}</SectionHeading>}
                >
                  {renderItems(commands)}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
