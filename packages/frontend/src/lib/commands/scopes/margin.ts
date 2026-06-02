import { defineScope, defineScopeCommand } from "../define";

export interface MarginContext {
  hasFragment: boolean;
  canSave: boolean;
  save: () => void;
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

export const marginCommands = [save] as const;
