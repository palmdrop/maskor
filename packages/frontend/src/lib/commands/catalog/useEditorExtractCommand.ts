import { useCommand } from "../useCommand";
import type { SelectionCapture } from "@components/prose-editor";

type TargetEntityType = "fragment" | "note" | "reference" | "aspect";

type Params = {
  targetType: TargetEntityType;
  getSelection: () => SelectionCapture;
  onExtract: (selectionText: string) => void;
};

export const useEditorExtractCommand = ({ targetType, getSelection, onExtract }: Params) => {
  useCommand({
    id: `editor.extract-to-${targetType}`,
    label: `Extract to ${targetType}`,
    scope: "Editor",
    category: "other",
    get disabledReason() {
      const { isEmpty } = getSelection();
      return isEmpty ? "Select text first" : undefined;
    },
    run: () => {
      const { text, isEmpty } = getSelection();
      if (isEmpty) return;
      onExtract(text);
    },
  });
};
