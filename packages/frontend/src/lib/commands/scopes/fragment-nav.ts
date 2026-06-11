import { defineScope, defineScopeCommand } from "../define";

// Previous/Next over the fragment-list ordering, published by FragmentPage (which
// owns the editor ref + active fragment) while it renders inside FragmentListPage.
// The list's filtered order arrives via FragmentListOrderContext; the target uuids
// and boundary flags are derived from it. Composition (save-then-navigate) lives
// here — the component publishes only primitives.
export interface FragmentNavContext {
  hasNext: boolean;
  hasPrevious: boolean;
  nextUuid: string | null;
  previousUuid: string | null;
  // Save the current fragment; rejects on failure so navigation is aborted and the
  // command's onFailure toast fires. A no-op when the editor is clean.
  save: () => Promise<void>;
  goToFragment: (uuid: string) => void;
}

export const fragmentNavScope = defineScope<FragmentNavContext>("fragment-nav", {
  label: "Fragment",
});

const next = defineScopeCommand(fragmentNavScope, {
  id: "fragments:next",
  label: "Next fragment",
  category: "navigation",
  hotkey: "mod+enter",
  disabled: (ctx) => (ctx.hasNext ? undefined : "No next fragment"),
  onFailure: "Couldn't save the fragment — staying put.",
  run: async (ctx) => {
    await ctx.save();
    if (ctx.nextUuid) ctx.goToFragment(ctx.nextUuid);
  },
});

const previous = defineScopeCommand(fragmentNavScope, {
  id: "fragments:previous",
  label: "Previous fragment",
  category: "navigation",
  disabled: (ctx) => (ctx.hasPrevious ? undefined : "No previous fragment"),
  onFailure: "Couldn't save the fragment — staying put.",
  run: async (ctx) => {
    await ctx.save();
    if (ctx.previousUuid) ctx.goToFragment(ctx.previousUuid);
  },
});

export const fragmentNavCommands = [next, previous] as const;
