import { useCommand } from "../useCommand";
import type { SelectionCapture } from "@components/prose-editor";

type TargetEntityType = "fragment" | "note" | "reference" | "aspect";

export type InsertCommandTarget = {
  uuid: string;
  key: string;
};

type Params = {
  direction: "append" | "prepend";
  targetType: TargetEntityType;
  getSelection: () => SelectionCapture;
  getItems: () => InsertCommandTarget[];
  onInsert: (selectionText: string, target: InsertCommandTarget) => void;
};

export const useEditorInsertCommand = ({
  direction,
  targetType,
  getSelection,
  getItems,
  onInsert,
}: Params) => {
  const directionLabel = direction === "append" ? "Append" : "Prepend";
  const directionNoun = direction === "append" ? "append" : "prepend";

  useCommand({
    id: `editor.${direction}-to-${targetType}`,
    label: `${directionLabel} to ${targetType}`,
    scope: "Editor",
    category: "other",
    get disabledReason() {
      const { isEmpty } = getSelection();
      if (isEmpty) return "Select text first";
      const items = getItems();
      if (items.length === 0) return `No ${targetType}s to ${directionNoun} to`;
      return undefined;
    },
    arg: {
      get items() {
        return getItems();
      },
      getKey: (item) => item.uuid,
      getLabel: (item) => item.key,
      placeholder: `Choose a ${targetType}…`,
    },
    run: (target) => {
      if (!target) return;
      const { text, isEmpty } = getSelection();
      if (isEmpty) return;
      onInsert(text, target);
    },
  });
};
