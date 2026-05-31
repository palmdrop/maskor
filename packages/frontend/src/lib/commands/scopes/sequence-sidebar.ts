import type { Sequence } from "@api/generated/maskorAPI.schemas";
import { defineScope, defineScopeCommand } from "../define";

export interface SequenceSidebarContext {
  createSequencePending: boolean;
  createSequence: () => void;
  confirmingDeleteSequenceId: string | null;
  deleteSequence: () => void;
  // Non-main sequences eligible for active/inactive toggling.
  toggleableSequences: readonly Sequence[];
  setSequenceActive: (sequenceId: string, active: boolean) => void;
}

export const sequenceSidebarScope = defineScope<SequenceSidebarContext>("sequence-sidebar", {
  label: "Sequence sidebar",
});

const createSequence = defineScopeCommand(sequenceSidebarScope, {
  id: "overview:create-sequence",
  label: "New sequence",
  category: "create",
  disabled: (ctx) => (ctx.createSequencePending ? "Creating…" : undefined),
  run: (ctx) => ctx.createSequence(),
});

const deleteSequence = defineScopeCommand(sequenceSidebarScope, {
  id: "overview:delete-sequence",
  label: "Delete sequence",
  category: "other",
  disabled: (ctx) =>
    ctx.confirmingDeleteSequenceId === null ? "No sequence selected for deletion" : undefined,
  run: (ctx) => ctx.deleteSequence(),
});

const toggleSequenceActive = defineScopeCommand(sequenceSidebarScope, {
  id: "overview:toggle-sequence-active",
  label: "Toggle sequence as constraint",
  category: "other",
  arg: {
    items: (ctx) => ctx.toggleableSequences,
    getKey: (item) => item.uuid,
    getLabel: (item) => (item.active ? `Deactivate “${item.name}”` : `Activate “${item.name}”`),
    placeholder: "Toggle sequence as constraint…",
  },
  run: (ctx, target) => ctx.setSequenceActive(target.uuid, !target.active),
});

export const sequenceSidebarCommands = [
  createSequence,
  deleteSequence,
  toggleSequenceActive,
] as const;
