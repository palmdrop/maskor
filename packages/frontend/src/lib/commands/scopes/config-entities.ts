import { defineScope, defineScopeCommand } from "../define";

// Shared shape for the Notes/References panel pickers: the uuid drives the
// delete mutation, the label is shown in the palette picker.
export interface EntityPanelItem {
  uuid: string;
  label: string;
}

export interface NotesPanelContext {
  notes: readonly EntityPanelItem[];
  // Returns the mutation promise so a rejection reaches the runner's `onFailure`.
  deleteNote: (noteUuid: string) => Promise<void>;
}

export interface ReferencesPanelContext {
  references: readonly EntityPanelItem[];
  deleteReference: (referenceUuid: string) => Promise<void>;
}

export const notesPanelScope = defineScope<NotesPanelContext>("notes", { label: "Notes" });

export const referencesPanelScope = defineScope<ReferencesPanelContext>("references", {
  label: "References",
});

const deleteNote = defineScopeCommand(notesPanelScope, {
  id: "notes:delete",
  label: "Delete note",
  category: "other",
  onFailure: "Failed to delete note.",
  disabled: (ctx) => (ctx.notes.length === 0 ? "No notes to delete" : undefined),
  arg: {
    items: (ctx): readonly EntityPanelItem[] => ctx.notes,
    getKey: (note) => note.uuid,
    getLabel: (note) => note.label,
    placeholder: "Choose note to delete…",
  },
  run: (ctx, note) => {
    if (!note) return;
    return ctx.deleteNote(note.uuid);
  },
});

const deleteReference = defineScopeCommand(referencesPanelScope, {
  id: "references:delete",
  label: "Delete reference",
  category: "other",
  onFailure: "Failed to delete reference.",
  disabled: (ctx) => (ctx.references.length === 0 ? "No references to delete" : undefined),
  arg: {
    items: (ctx): readonly EntityPanelItem[] => ctx.references,
    getKey: (reference) => reference.uuid,
    getLabel: (reference) => reference.label,
    placeholder: "Choose reference to delete…",
  },
  run: (ctx, reference) => {
    if (!reference) return;
    return ctx.deleteReference(reference.uuid);
  },
});

export const configEntitiesCommands = [deleteNote, deleteReference] as const;
