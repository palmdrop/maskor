import { defineScope, defineScopeCommand } from "../define";

export interface MarginContext {
  hasFragment: boolean;
  canSave: boolean;
  save: () => void;
  // Anchor a comment to the fragment block at the cursor: inject the marker, seed a comment stub
  // with the block excerpt, and move focus to the Margin panel.
  commentBlock: () => void;
}

// Singleton scope published by the fragment editor while a Margin panel is mounted beside it.
export const marginScope = defineScope<MarginContext>("margin", { label: "Margin" });

const save = defineScopeCommand(marginScope, {
  id: "margin:save",
  label: "Save margin",
  category: "navigation",
  disabled: (ctx) => (ctx.canSave ? undefined : "Nothing to save"),
  run: (ctx) => ctx.save(),
});

const commentBlock = defineScopeCommand(marginScope, {
  id: "margin:comment-block",
  label: "Comment this block",
  category: "other",
  // A modifier hotkey so the command fires before the editor and, in vim, is intercepted before any
  // normal-mode binding (no double-trigger) — see command-palette.md precedence rules.
  hotkey: "mod+shift+m",
  disabled: (ctx) => (ctx.hasFragment ? undefined : "No fragment to comment"),
  run: (ctx) => ctx.commentBlock(),
});

export const marginCommands = [save, commentBlock] as const;
