import { defineScope, defineScopeCommand } from "../define";

export interface MarginContext {
  hasFragment: boolean;
  // Jump focus to the margin slot beside the fragment block at the cursor (creation is implicit —
  // typing in the slot conjures the comment). There is no separate margin save: the fragment editor's
  // save (`editor:save`) persists the fragment and the Margin together (margins-4 #13).
  commentBlock: () => void;
}

// Singleton scope published by the fragment editor while a Margin panel is mounted beside it.
export const marginScope = defineScope<MarginContext>("margin", { label: "Margin" });

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

export const marginCommands = [commentBlock] as const;
