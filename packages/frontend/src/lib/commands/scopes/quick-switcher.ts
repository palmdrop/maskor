import { defineScope, defineScopeCommand } from "../define";

type QuickSwitcherContext = {
  isOpen: () => boolean;
  close: () => void;
  open: () => void;
};

export const quickSwitcherScope = defineScope<QuickSwitcherContext>("quick-switcher", {
  label: "Quick Switcher",
});

const open = defineScopeCommand(quickSwitcherScope, {
  id: "quick-switcher:open",
  label: "Open Quick Switcher",
  category: "other",
  hotkey: ["mod+o", "mod+p"],
  disabled: (ctx) => (ctx.isOpen() ? "Quick switcher is already open" : undefined),
  run: (ctx) => ctx.open(),
});

const close = defineScopeCommand(quickSwitcherScope, {
  id: "quick-switcher:close",
  label: "Close Quick Switcher",
  category: "other",
  hotkey: "esc",
  disabled: (ctx) => (!ctx.isOpen ? "Quick switcher is not open" : undefined),
  run: (ctx) => ctx.close(),
});

export const quickSwitcherCommands = [open, close] as const;
