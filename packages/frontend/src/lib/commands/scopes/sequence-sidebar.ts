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
  // Every sequence can be cloned into a fresh independent copy.
  cloneableSequences: readonly Sequence[];
  cloneSequence: (sequenceId: string) => void;
  // Sequences eligible as an insert *source* (anything but the open target).
  insertSourceSequences: readonly Sequence[];
  // The name of the sequence currently open in the overview (the insert target).
  insertTargetName: string | undefined;
  insertSequence: (sourceSequenceId: string) => void;
}

export const sequenceSidebarScope = defineScope<SequenceSidebarContext>("sequence-sidebar", {
  label: "Sequence sidebar",
});

const createSequence = defineScopeCommand(sequenceSidebarScope, {
  id: "overview:create-sequence",
  onFailure: "Failed to create sequence.",
  label: "New sequence",
  category: "create",
  disabled: (ctx) => (ctx.createSequencePending ? "Creating…" : undefined),
  run: (ctx) => ctx.createSequence(),
});

const deleteSequence = defineScopeCommand(sequenceSidebarScope, {
  id: "overview:delete-sequence",
  onFailure: "Failed to delete sequence.",
  label: "Delete sequence",
  category: "other",
  disabled: (ctx) =>
    ctx.confirmingDeleteSequenceId === null ? "No sequence selected for deletion" : undefined,
  run: (ctx) => ctx.deleteSequence(),
});

const toggleSequenceActive = defineScopeCommand(sequenceSidebarScope, {
  id: "overview:toggle-sequence-active",
  onFailure: "Failed to update sequence.",
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

const cloneSequence = defineScopeCommand(sequenceSidebarScope, {
  id: "overview:clone-sequence",
  onFailure: "Failed to clone sequence.",
  label: "Clone sequence…",
  category: "create",
  arg: {
    items: (ctx) => ctx.cloneableSequences,
    getKey: (item) => item.uuid,
    getLabel: (item) => `Clone “${item.name}”`,
    placeholder: "Clone sequence…",
  },
  run: (ctx, target) => ctx.cloneSequence(target.uuid),
});

const insertSequence = defineScopeCommand(sequenceSidebarScope, {
  id: "overview:insert-sequence",
  onFailure: "Failed to insert sequence.",
  label: "Insert sequence into current…",
  category: "other",
  disabled: (ctx) =>
    ctx.insertTargetName === undefined
      ? "No open sequence to insert into"
      : ctx.insertSourceSequences.length === 0
        ? "No other sequence to insert"
        : undefined,
  arg: {
    items: (ctx) => ctx.insertSourceSequences,
    getKey: (item) => item.uuid,
    getLabel: (item) => `Insert “${item.name}”`,
    placeholder: "Insert sequence into current…",
  },
  run: (ctx, source) => ctx.insertSequence(source.uuid),
});

export const sequenceSidebarCommands = [
  createSequence,
  deleteSequence,
  toggleSequenceActive,
  cloneSequence,
  insertSequence,
] as const;
