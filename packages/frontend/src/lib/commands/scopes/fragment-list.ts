import { defineScope, defineScopeCommand } from "../define";

// Minimal shape the per-row actions and the palette picker need. The page
// publishes its already-loaded fragments narrowed to this; the row buttons
// pass the full fragment (structurally assignable).
export interface FragmentListItem {
  uuid: string;
  key: string;
}

export interface FragmentListContext {
  // Non-discarded fragments — the candidates for Discard.
  discardableFragments: readonly FragmentListItem[];
  // Discarded fragments — the candidates for Restore and permanent Delete.
  discardedFragments: readonly FragmentListItem[];
  // Each primitive returns its mutation promise so a rejection reaches the
  // command runner's `onFailure`. Delete confirms internally (so the palette
  // path is guarded too) and resolves without mutating if the user cancels.
  discardFragment: (fragmentUuid: string) => Promise<void>;
  restoreFragment: (fragmentUuid: string) => Promise<void>;
  deleteFragment: (fragmentUuid: string) => Promise<void>;
}

export const fragmentListScope = defineScope<FragmentListContext>("fragment-list", {
  label: "Fragment list",
});

const discardFragment = defineScopeCommand(fragmentListScope, {
  id: "fragment-list:discard",
  label: "Discard fragment",
  category: "other",
  onFailure: "Failed to discard fragment.",
  disabled: (ctx) =>
    ctx.discardableFragments.length === 0 ? "No fragments to discard" : undefined,
  arg: {
    items: (ctx): readonly FragmentListItem[] => ctx.discardableFragments,
    getKey: (fragment) => fragment.uuid,
    getLabel: (fragment) => fragment.key,
    placeholder: "Choose fragment to discard…",
  },
  run: (ctx, fragment) => {
    if (!fragment) return;
    return ctx.discardFragment(fragment.uuid);
  },
});

const restoreFragment = defineScopeCommand(fragmentListScope, {
  id: "fragment-list:restore",
  label: "Restore fragment",
  category: "other",
  onFailure: "Failed to restore fragment.",
  disabled: (ctx) =>
    ctx.discardedFragments.length === 0 ? "No discarded fragments to restore" : undefined,
  arg: {
    items: (ctx): readonly FragmentListItem[] => ctx.discardedFragments,
    getKey: (fragment) => fragment.uuid,
    getLabel: (fragment) => fragment.key,
    placeholder: "Choose fragment to restore…",
  },
  run: (ctx, fragment) => {
    if (!fragment) return;
    return ctx.restoreFragment(fragment.uuid);
  },
});

const deleteFragment = defineScopeCommand(fragmentListScope, {
  id: "fragment-list:delete",
  label: "Delete fragment permanently",
  category: "other",
  onFailure: "Failed to delete fragment.",
  disabled: (ctx) =>
    ctx.discardedFragments.length === 0 ? "No discarded fragments to delete" : undefined,
  arg: {
    items: (ctx): readonly FragmentListItem[] => ctx.discardedFragments,
    getKey: (fragment) => fragment.uuid,
    getLabel: (fragment) => fragment.key,
    placeholder: "Choose fragment to delete…",
  },
  run: (ctx, fragment) => {
    if (!fragment) return;
    return ctx.deleteFragment(fragment.uuid);
  },
});

export const fragmentListCommands = [discardFragment, restoreFragment, deleteFragment] as const;
