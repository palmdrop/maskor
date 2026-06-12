import { defineScope, defineScopeCommand } from "../define";

// Shown when a save-then-advance (or save-then-close, or save-then-retarget) is
// aborted because the save failed. Shared so the commands' onFailure and the
// host pages' direct retarget path surface identical wording.
export const FRAGMENT_NAV_SAVE_FAILED_MESSAGE = "Couldn't save the fragment — staying put.";

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
  // Present only when the editor is an overlay over a host surface (Overview /
  // Preview). Closes the overlay and returns to the host. Absent on the dedicated
  // list-page editor, where there is nothing to close.
  closeEditor?: () => void;
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
  onFailure: FRAGMENT_NAV_SAVE_FAILED_MESSAGE,
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
  onFailure: FRAGMENT_NAV_SAVE_FAILED_MESSAGE,
  run: async (ctx) => {
    await ctx.save();
    if (ctx.previousUuid) ctx.goToFragment(ctx.previousUuid);
  },
});

// Overlay dismiss (Overview / Preview). Cmd+Escape so vim's bare Escape stays free
// for mode changes. Close is "Done": it saves first (a no-op when clean), then
// exits, so leaving the overlay never strands the edited buffer in recovery — the
// same save-then-go guard as Previous/Next. A failed save aborts the close and
// toasts; the overlay stays open with the unsaved buffer intact.
const closeEditor = defineScopeCommand(fragmentNavScope, {
  id: "fragments:close-editor",
  label: "Close editor",
  category: "navigation",
  hotkey: "mod+escape",
  disabled: (ctx) => (ctx.closeEditor ? undefined : "No editor to close"),
  onFailure: FRAGMENT_NAV_SAVE_FAILED_MESSAGE,
  run: async (ctx) => {
    await ctx.save();
    ctx.closeEditor?.();
  },
});

export const fragmentNavCommands = [next, previous, closeEditor] as const;
