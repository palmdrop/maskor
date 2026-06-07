import { useCallback, type RefObject } from "react";
import type { EntityEditorShellHandle } from "@components/entity-editor-shell";
import type { EditorBlock } from "@components/prose-editor";

// The set of editor operations the Margin column drives, all delegating to the editor shell's
// imperative handle: coordinated anchor edits (type-to-create / delete), reveal/focus, the reciprocal
// highlight, and geometry for scroll-sync + absolute anchoring. The shell ref is stable, so every
// callback is stable too.
export type FragmentMarginBridge = {
  addAnchorAtBlock: (blockIndex: number, markerId: string) => void;
  removeAnchor: (markerId: string) => void;
  revealAnchor: (markerId: string) => void;
  focusAnchorBlock: (markerId: string) => void;
  highlightAnchor: (markerId: string | null) => void;
  getScrollElement: () => HTMLElement | null;
  getBlocks: () => EditorBlock[];
};

export const useFragmentMarginBridge = (
  shellRef: RefObject<EntityEditorShellHandle | null>,
): FragmentMarginBridge => {
  const addAnchorAtBlock = useCallback(
    (blockIndex: number, markerId: string) =>
      shellRef.current?.addAnchorAtBlock(blockIndex, markerId),
    [shellRef],
  );
  const removeAnchor = useCallback(
    (markerId: string) => shellRef.current?.removeAnchor(markerId),
    [shellRef],
  );
  const revealAnchor = useCallback(
    (markerId: string) => shellRef.current?.revealAnchor(markerId),
    [shellRef],
  );
  const focusAnchorBlock = useCallback(
    (markerId: string) => shellRef.current?.focusAnchorBlock(markerId),
    [shellRef],
  );
  const highlightAnchor = useCallback(
    (markerId: string | null) => shellRef.current?.setHighlightedAnchor(markerId),
    [shellRef],
  );
  const getScrollElement = useCallback(
    () => shellRef.current?.getScrollElement() ?? null,
    [shellRef],
  );
  const getBlocks = useCallback(() => shellRef.current?.getBlocks() ?? [], [shellRef]);

  return {
    addAnchorAtBlock,
    removeAnchor,
    revealAnchor,
    focusAnchorBlock,
    highlightAnchor,
    getScrollElement,
    getBlocks,
  };
};
