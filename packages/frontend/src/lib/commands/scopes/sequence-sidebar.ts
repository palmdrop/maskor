import { defineScope, defineScopeCommand } from "../define";

export interface SequenceSidebarContext {
  createSequencePending: boolean;
  createSequence: () => void;
  confirmingDeleteSequenceId: string | null;
  deleteSequence: () => void;
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

export const sequenceSidebarCommands = [createSequence, deleteSequence] as const;
