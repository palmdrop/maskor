import type { Sequence } from "@api/generated/maskorAPI.schemas";
import { defineScope, defineScopeCommand } from "../define";

export interface FragmentEditorContext {
  hasFragment: boolean;
  isDiscarded: boolean;
  discard: () => void;
  restore: () => void;
  sequences: Sequence[];
  openPlaceInSequence: (sequenceId: string) => void;
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
    items: (ctx): Sequence[] => ctx.sequences,
    getKey: (sequence) => sequence.uuid,
    getLabel: (sequence) => sequence.name,
    placeholder: "Choose sequence…",
  },
  run: (ctx, sequence) => ctx.openPlaceInSequence(sequence.uuid),
});

export const fragmentEditorCommands = [discard, restore, placeInSequence] as const;
