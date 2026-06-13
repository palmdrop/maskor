import { defineScope, defineScopeCommand } from "../define";

// Published by the open SplitFragmentDialog. The Confirm button dispatches
// `fragment-split:confirm` rather than calling the mutation inline, so a failed
// split surfaces through the command system's onFailure toast like every other
// composed action. `confirm` returns a promise that rejects on failure (see the
// command-failure contract in packages/frontend/CLAUDE.md).
export interface FragmentSplitContext {
  pieceCount: number;
  isPending: boolean;
  confirm: () => Promise<void>;
}

export const fragmentSplitScope = defineScope<FragmentSplitContext>("fragment-split", {
  label: "Split fragment",
});

const confirmSplit = defineScopeCommand(fragmentSplitScope, {
  id: "fragment-split:confirm",
  label: "Confirm split",
  category: "create",
  onFailure: "Failed to split fragment.",
  disabled: (ctx) =>
    ctx.isPending ? "Splitting…" : ctx.pieceCount <= 1 ? "1 piece — nothing to split" : undefined,
  run: (ctx) => ctx.confirm(),
});

export const fragmentSplitCommands = [confirmSplit] as const;
