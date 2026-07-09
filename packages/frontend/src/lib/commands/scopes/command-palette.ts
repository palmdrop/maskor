import { defineScope, defineScopeCommand } from "../define";

type CommandPaletteContext = {
  isOpen: () => boolean;
  close: () => void;
  // An optional command id jumps the palette straight to that command's arg picker on open — the way
  // the rich-toolbar "Insert link" button reaches `editor:insert-link`'s entity picker without the
  // user typing. Omitted → the palette opens on the command list as usual.
  open: (initialCommandId?: string) => void;
};

export const commandPaletteScope = defineScope<CommandPaletteContext>("command-palette", {
  label: "Command Palette",
});

const open = defineScopeCommand(commandPaletteScope, {
  id: "command-palette:open",
  label: "Open Command Palette",
  category: "other",
  hotkey: ["mod+k", "mod+shift+p"],
  disabled: (ctx) => (ctx.isOpen() ? "Command palette is already open" : undefined),
  // A caller may pass a command id to jump straight to that command's arg picker (the rich-toolbar
  // "Insert link" button). The palette-open command stays void-typed at the catalog level — this is a
  // UI-open, not a picker command — so callers pass the id through `run`'s untyped runtime arg.
  run: (ctx, initialCommandId?: string) => ctx.open(initialCommandId),
});

const close = defineScopeCommand(commandPaletteScope, {
  id: "command-palette:close",
  label: "Close Command Palette",
  category: "other",
  hotkey: "esc",
  disabled: (ctx) => (!ctx.isOpen ? "Command palette is not open" : undefined),
  run: (ctx) => ctx.close(),
});

export const commandPaletteCommands = [open, close] as const;
