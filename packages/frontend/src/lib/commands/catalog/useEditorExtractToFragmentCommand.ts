import { useCommand } from "../useCommand";
import type { SelectionCapture } from "@components/prose-editor";

type Params = {
  getSelection: () => SelectionCapture;
  onExtract: (selectionText: string) => void;
};

export const useEditorExtractToFragmentCommand = ({ getSelection, onExtract }: Params) => {
  useCommand({
    id: "editor.extract-to-fragment",
    label: "Extract to fragment",
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
