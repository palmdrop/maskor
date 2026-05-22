import { useEditorExtractCommand } from "./useEditorExtractCommand";
import { useEditorInsertCommand, type InsertCommandTarget } from "./useEditorInsertCommand";
import type { SelectionCapture } from "@components/prose-editor";
import type { EntityKind } from "@lib/entity-kinds/registry";

type Params = {
  getSelection: () => SelectionCapture;
  eligibleByKind: Record<EntityKind, InsertCommandTarget[]>;
  onExtract: (kind: EntityKind, selectionText: string) => void;
  onInsert: (
    direction: "append" | "prepend",
    kind: EntityKind,
    selectionText: string,
    target: InsertCommandTarget,
  ) => void;
};

// Registers the 12 editor-scoped commands (4 extract + 4 append + 4 prepend).
// The 12 useCommand calls remain unrolled here to satisfy the rules of hooks
// (stable order across renders), but the shell only sees one hook call.
export const useEditorExtractAndInsertCommands = ({
  getSelection,
  eligibleByKind,
  onExtract,
  onInsert,
}: Params) => {
  useEditorExtractCommand({
    targetType: "fragment",
    getSelection,
    onExtract: (text) => onExtract("fragment", text),
  });
  useEditorExtractCommand({
    targetType: "note",
    getSelection,
    onExtract: (text) => onExtract("note", text),
  });
  useEditorExtractCommand({
    targetType: "reference",
    getSelection,
    onExtract: (text) => onExtract("reference", text),
  });
  useEditorExtractCommand({
    targetType: "aspect",
    getSelection,
    onExtract: (text) => onExtract("aspect", text),
  });

  useEditorInsertCommand({
    direction: "append",
    targetType: "fragment",
    getSelection,
    getItems: () => eligibleByKind.fragment,
    onInsert: (text, target) => onInsert("append", "fragment", text, target),
  });
  useEditorInsertCommand({
    direction: "append",
    targetType: "note",
    getSelection,
    getItems: () => eligibleByKind.note,
    onInsert: (text, target) => onInsert("append", "note", text, target),
  });
  useEditorInsertCommand({
    direction: "append",
    targetType: "reference",
    getSelection,
    getItems: () => eligibleByKind.reference,
    onInsert: (text, target) => onInsert("append", "reference", text, target),
  });
  useEditorInsertCommand({
    direction: "append",
    targetType: "aspect",
    getSelection,
    getItems: () => eligibleByKind.aspect,
    onInsert: (text, target) => onInsert("append", "aspect", text, target),
  });

  useEditorInsertCommand({
    direction: "prepend",
    targetType: "fragment",
    getSelection,
    getItems: () => eligibleByKind.fragment,
    onInsert: (text, target) => onInsert("prepend", "fragment", text, target),
  });
  useEditorInsertCommand({
    direction: "prepend",
    targetType: "note",
    getSelection,
    getItems: () => eligibleByKind.note,
    onInsert: (text, target) => onInsert("prepend", "note", text, target),
  });
  useEditorInsertCommand({
    direction: "prepend",
    targetType: "reference",
    getSelection,
    getItems: () => eligibleByKind.reference,
    onInsert: (text, target) => onInsert("prepend", "reference", text, target),
  });
  useEditorInsertCommand({
    direction: "prepend",
    targetType: "aspect",
    getSelection,
    getItems: () => eligibleByKind.aspect,
    onInsert: (text, target) => onInsert("prepend", "aspect", text, target),
  });
};
