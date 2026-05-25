import { defineScope, defineScopeCommand } from "../define";

export interface FragmentEditorContext {
  hasFragment: boolean;
  isDiscarded: boolean;
  discard: () => void;
  restore: () => void;
}

export const fragmentEditorScope = defineScope<FragmentEditorContext>("fragment-editor", {
  label: "Fragment",
});

const discard = defineScopeCommand(fragmentEditorScope, {
  id: "fragment:discard",
  label: "Discard fragment",
  // TODO: previous catalog used "navigation" — likely incorrect; "other" fits better
  category: "other",
  disabled: (ctx) =>
    !ctx.hasFragment
      ? "No fragment to discard"
      : ctx.isDiscarded
        ? "Fragment is already discarded"
        : undefined,
  run: (ctx) => ctx.discard(),
});

const restore = defineScopeCommand(fragmentEditorScope, {
  id: "fragment:restore",
  label: "Restore fragment",
  category: "other",
  disabled: (ctx) =>
    !ctx.hasFragment
      ? "No fragment to restore"
      : !ctx.isDiscarded
        ? "Fragment is not discarded"
        : undefined,
  run: (ctx) => ctx.restore(),
});

export const fragmentEditorCommands = [discard, restore] as const;
