import { defineScope, defineScopeCommand } from "../define";

type CommandPaletteContext = {
  isOpen: () => boolean;
  close: () => void;
  open: () => void;
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
  run: (ctx) => ctx.open(),
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
