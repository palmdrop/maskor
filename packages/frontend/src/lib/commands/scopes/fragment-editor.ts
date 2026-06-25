import type { Sequence } from "@api/generated/maskorAPI.schemas";
import { defineScope, defineScopeCommand } from "../define";
import { buildPlacementOptions, placementOptionLabel } from "@lib/sequences/placementOptions";

export interface FragmentEditorContext {
  hasFragment: boolean;
  isDiscarded: boolean;
  discard: () => Promise<void>;
  restore: () => Promise<void>;
  sequences: Sequence[];
  // The fragment being edited; used to surface its existing placements in the
  // "Place in sequence…" picker.
  activeFragmentUuid: string | undefined;
  openPlaceInSequence: (sequenceId: string) => void;
  // Persist the open fragment body — a no-op when clean. Composed before opening the split dialog so
  // the split reads fresh vault content instead of pre-edit content. Rejects on a save failure, which
  // aborts the split (its onFailure surfaces the toast).
  save: () => Promise<void>;
  openSplit: () => void;
  // Aspect keys attached to the fragment (live or orphaned) — the candidates for the aspect reader.
  attachedAspectKeys: string[];
  // Open the gutter's Aspect tab and expand the given aspect in the reader.
  previewAspect: (aspectKey: string) => void;
}

export const fragmentEditorScope = defineScope<FragmentEditorContext>("fragment-editor", {
  label: "Fragment",
});

const discard = defineScopeCommand(fragmentEditorScope, {
  id: "fragment:discard",
  onFailure: "Failed to discard fragment.",
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
  onFailure: "Failed to restore fragment.",
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

const placeInSequence = defineScopeCommand(fragmentEditorScope, {
  id: "fragment:place-in-sequence",
  label: "Place in sequence…",
  category: "other",
  disabled: (ctx) =>
    !ctx.hasFragment
      ? "No fragment to place"
      : ctx.isDiscarded
        ? "Fragment is discarded"
        : ctx.sequences.length === 0
          ? "No sequences"
          : undefined,
  arg: {
    items: (ctx) => buildPlacementOptions(ctx.sequences, ctx.activeFragmentUuid),
    getKey: (option) => option.uuid,
    getLabel: (option) => placementOptionLabel(option),
    placeholder: "Choose sequence…",
  },
  run: (ctx, option) => ctx.openPlaceInSequence(option.uuid),
});

const split = defineScopeCommand(fragmentEditorScope, {
  id: "fragment-editor:split",
  // Save can throw (the fragment edits failed to persist) — surface it and abort, rather than
  // splitting stale content. A clean fragment saves as a no-op and never reaches this.
  onFailure: "Couldn't save the fragment before splitting.",
  label: "Split fragment",
  category: "create",
  disabled: (ctx) =>
    !ctx.hasFragment
      ? "No fragment to split"
      : ctx.isDiscarded
        ? "Fragment is discarded"
        : undefined,
  // Save first so the split operates on what the user sees, not the pre-edit vault content.
  // Splitting a dirty fragment would divide its stale server content and leave the buffer diverged
  // (the "split out of sync / claims to fail" report). A failed save rejects here and aborts.
  run: async (ctx) => {
    await ctx.save();
    ctx.openSplit();
  },
});

const previewAspect = defineScopeCommand(fragmentEditorScope, {
  id: "fragment-editor:preview-aspect",
  label: "Preview aspect…",
  category: "other",
  disabled: (ctx) =>
    ctx.attachedAspectKeys.length === 0 ? "No aspects on this fragment" : undefined,
  arg: {
    items: (ctx): string[] => ctx.attachedAspectKeys,
    getKey: (item) => item,
    getLabel: (item) => item,
    placeholder: "Choose aspect…",
  },
  run: (ctx, aspectKey) => {
    if (!aspectKey) return;
    ctx.previewAspect(aspectKey);
  },
});

export const fragmentEditorCommands = [
  discard,
  restore,
  placeInSequence,
  split,
  previewAspect,
] as const;
