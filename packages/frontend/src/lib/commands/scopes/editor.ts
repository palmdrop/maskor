import type { SelectionCapture } from "@components/prose-editor";
import type { EntityKind } from "@lib/entity-kinds/registry";
import { defineScope, defineScopeCommand } from "../define";

export type InsertCommandTarget = {
  uuid: string;
  key: string;
};

export interface EditorContext {
  getSelection: () => SelectionCapture;
  eligibleByKind: Record<EntityKind, InsertCommandTarget[]>;
  extractTo: (kind: EntityKind, selectionText: string) => void;
  insertTo: (
    direction: "append" | "prepend",
    kind: EntityKind,
    selectionText: string,
    target: InsertCommandTarget,
  ) => void;
  canSave: boolean;
  save: () => void;
}

// Singleton scope — only one EntityEditorShell may be mounted at a time.
// A split-pane or comparison view would require a parameterized variant.
export const editorScope = defineScope<EditorContext>("editor", {
  label: "Editor",
});

// --- Save ---

const save = defineScopeCommand(editorScope, {
  id: "editor:save",
  label: "Save",
  category: "navigation",
  hotkey: "mod+s",
  disabled: (ctx) => (ctx.canSave ? undefined : "Nothing to save"),
  run: (ctx) => ctx.save(),
});

// --- Extract ---
//
// Four explicit commands (one per kind) so the `id` literal types are
// preserved in the catalog. A factory helper would widen them.

const extractToFragment = defineScopeCommand(editorScope, {
  id: "editor.extract-to-fragment",
  label: "Extract to fragment",
  category: "other",
  disabled: (ctx) => (ctx.getSelection().isEmpty ? "Select text first" : undefined),
  run: (ctx) => {
    const { text, isEmpty } = ctx.getSelection();
    if (isEmpty) return;
    ctx.extractTo("fragment", text);
  },
});

const extractToNote = defineScopeCommand(editorScope, {
  id: "editor.extract-to-note",
  label: "Extract to note",
  category: "other",
  disabled: (ctx) => (ctx.getSelection().isEmpty ? "Select text first" : undefined),
  run: (ctx) => {
    const { text, isEmpty } = ctx.getSelection();
    if (isEmpty) return;
    ctx.extractTo("note", text);
  },
});

const extractToReference = defineScopeCommand(editorScope, {
  id: "editor.extract-to-reference",
  label: "Extract to reference",
  category: "other",
  disabled: (ctx) => (ctx.getSelection().isEmpty ? "Select text first" : undefined),
  run: (ctx) => {
    const { text, isEmpty } = ctx.getSelection();
    if (isEmpty) return;
    ctx.extractTo("reference", text);
  },
});

const extractToAspect = defineScopeCommand(editorScope, {
  id: "editor.extract-to-aspect",
  label: "Extract to aspect",
  category: "other",
  disabled: (ctx) => (ctx.getSelection().isEmpty ? "Select text first" : undefined),
  run: (ctx) => {
    const { text, isEmpty } = ctx.getSelection();
    if (isEmpty) return;
    ctx.extractTo("aspect", text);
  },
});

// --- Insert (append/prepend × 4 kinds = 8 commands) ---
//
// Each carries an `arg` whose items come from ctx.eligibleByKind[<kind>].

type InsertDisabledArgs = {
  ctx: EditorContext;
  kind: EntityKind;
  directionNoun: "append" | "prepend";
};

const insertDisabled = ({ ctx, kind, directionNoun }: InsertDisabledArgs): string | undefined => {
  if (ctx.getSelection().isEmpty) return "Select text first";
  if (ctx.eligibleByKind[kind].length === 0) return `No ${kind}s to ${directionNoun} to`;
  return undefined;
};

const appendToFragment = defineScopeCommand(editorScope, {
  id: "editor.append-to-fragment",
  label: "Append to fragment",
  category: "other",
  disabled: (ctx) => insertDisabled({ ctx, kind: "fragment", directionNoun: "append" }),
  arg: {
    items: (ctx) => ctx.eligibleByKind.fragment,
    getKey: (item) => item.uuid,
    getLabel: (item) => item.key,
    placeholder: "Choose a fragment…",
  },
  run: (ctx, target) => {
    const { text, isEmpty } = ctx.getSelection();
    if (isEmpty) return;
    ctx.insertTo("append", "fragment", text, target);
  },
});

const appendToNote = defineScopeCommand(editorScope, {
  id: "editor.append-to-note",
  label: "Append to note",
  category: "other",
  disabled: (ctx) => insertDisabled({ ctx, kind: "note", directionNoun: "append" }),
  arg: {
    items: (ctx) => ctx.eligibleByKind.note,
    getKey: (item) => item.uuid,
    getLabel: (item) => item.key,
    placeholder: "Choose a note…",
  },
  run: (ctx, target) => {
    const { text, isEmpty } = ctx.getSelection();
    if (isEmpty) return;
    ctx.insertTo("append", "note", text, target);
  },
});

const appendToReference = defineScopeCommand(editorScope, {
  id: "editor.append-to-reference",
  label: "Append to reference",
  category: "other",
  disabled: (ctx) => insertDisabled({ ctx, kind: "reference", directionNoun: "append" }),
  arg: {
    items: (ctx) => ctx.eligibleByKind.reference,
    getKey: (item) => item.uuid,
    getLabel: (item) => item.key,
    placeholder: "Choose a reference…",
  },
  run: (ctx, target) => {
    const { text, isEmpty } = ctx.getSelection();
    if (isEmpty) return;
    ctx.insertTo("append", "reference", text, target);
  },
});

const appendToAspect = defineScopeCommand(editorScope, {
  id: "editor.append-to-aspect",
  label: "Append to aspect",
  category: "other",
  disabled: (ctx) => insertDisabled({ ctx, kind: "aspect", directionNoun: "append" }),
  arg: {
    items: (ctx) => ctx.eligibleByKind.aspect,
    getKey: (item) => item.uuid,
    getLabel: (item) => item.key,
    placeholder: "Choose an aspect…",
  },
  run: (ctx, target) => {
    const { text, isEmpty } = ctx.getSelection();
    if (isEmpty) return;
    ctx.insertTo("append", "aspect", text, target);
  },
});

const prependToFragment = defineScopeCommand(editorScope, {
  id: "editor.prepend-to-fragment",
  label: "Prepend to fragment",
  category: "other",
  disabled: (ctx) => insertDisabled({ ctx, kind: "fragment", directionNoun: "prepend" }),
  arg: {
    items: (ctx) => ctx.eligibleByKind.fragment,
    getKey: (item) => item.uuid,
    getLabel: (item) => item.key,
    placeholder: "Choose a fragment…",
  },
  run: (ctx, target) => {
    const { text, isEmpty } = ctx.getSelection();
    if (isEmpty) return;
    ctx.insertTo("prepend", "fragment", text, target);
  },
});

const prependToNote = defineScopeCommand(editorScope, {
  id: "editor.prepend-to-note",
  label: "Prepend to note",
  category: "other",
  disabled: (ctx) => insertDisabled({ ctx, kind: "note", directionNoun: "prepend" }),
  arg: {
    items: (ctx) => ctx.eligibleByKind.note,
    getKey: (item) => item.uuid,
    getLabel: (item) => item.key,
    placeholder: "Choose a note…",
  },
  run: (ctx, target) => {
    const { text, isEmpty } = ctx.getSelection();
    if (isEmpty) return;
    ctx.insertTo("prepend", "note", text, target);
  },
});

const prependToReference = defineScopeCommand(editorScope, {
  id: "editor.prepend-to-reference",
  label: "Prepend to reference",
  category: "other",
  disabled: (ctx) => insertDisabled({ ctx, kind: "reference", directionNoun: "prepend" }),
  arg: {
    items: (ctx) => ctx.eligibleByKind.reference,
    getKey: (item) => item.uuid,
    getLabel: (item) => item.key,
    placeholder: "Choose a reference…",
  },
  run: (ctx, target) => {
    const { text, isEmpty } = ctx.getSelection();
    if (isEmpty) return;
    ctx.insertTo("prepend", "reference", text, target);
  },
});

const prependToAspect = defineScopeCommand(editorScope, {
  id: "editor.prepend-to-aspect",
  label: "Prepend to aspect",
  category: "other",
  disabled: (ctx) => insertDisabled({ ctx, kind: "aspect", directionNoun: "prepend" }),
  arg: {
    items: (ctx) => ctx.eligibleByKind.aspect,
    getKey: (item) => item.uuid,
    getLabel: (item) => item.key,
    placeholder: "Choose an aspect…",
  },
  run: (ctx, target) => {
    const { text, isEmpty } = ctx.getSelection();
    if (isEmpty) return;
    ctx.insertTo("prepend", "aspect", text, target);
  },
});

export const editorCommands = [
  save,
  extractToFragment,
  extractToNote,
  extractToReference,
  extractToAspect,
  appendToFragment,
  appendToNote,
  appendToReference,
  appendToAspect,
  prependToFragment,
  prependToNote,
  prependToReference,
  prependToAspect,
] as const;
