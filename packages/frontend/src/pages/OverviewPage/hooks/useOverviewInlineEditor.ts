import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { FragmentEditorHandle } from "@components/fragments/fragment-editor";
import { orderNeighbors, type OrderNeighbors } from "@lib/fragments/order-neighbors";
import { FRAGMENT_NAV_SAVE_FAILED_MESSAGE } from "@lib/commands/scopes/fragment-nav";
import type { SelectionModifiers } from "./useFragmentSelection";

// Overlay state + handlers for Overview's center-replacing inline editor (ADR
// 0013). Kept out of OverviewPage's body so the open / retarget / dirty-guard /
// close / scroll-back wiring is unit-testable without rendering the whole page.
// The page owns the ordering, the host selection, query invalidation, and the
// DOM scroll; this hook owns the overlay's own state machine.

export interface UseOverviewInlineEditorParams {
  // Placed fragments in spine order, pool + discarded excluded. Drives Prev/Next.
  editableOrder: readonly string[];
  // Move the single selection to a fragment (so the left column highlights it and
  // the spine lands on it when the overlay closes).
  selectFragment: (fragmentUuid: string) => void;
  // The reorder list's normal (not-editing) selection behaviour.
  sidebarSelectFragment: (fragmentUuid: string, modifiers?: SelectionModifiers) => void;
  // True once the spine has content rendered — gates the scroll-back on close so
  // the anchor exists in the DOM.
  spineContentReady: boolean;
  // Scroll the spine to the top of a fragment's anchor (the page owns the raf+DOM).
  scrollToFragment: (fragmentUuid: string) => void;
}

export interface UseOverviewInlineEditorResult extends OrderNeighbors {
  editingFragmentUuid: string | null;
  editorRef: React.RefObject<FragmentEditorHandle | null>;
  openEditor: (fragmentUuid: string) => void;
  handleEdit: (fragmentUuid: string) => void;
  handleReorderSelect: (fragmentUuid: string, modifiers?: SelectionModifiers) => void;
  closeEditor: () => void;
  saveEditor: () => Promise<void>;
}

export const useOverviewInlineEditor = ({
  editableOrder,
  selectFragment,
  sidebarSelectFragment,
  spineContentReady,
  scrollToFragment,
}: UseOverviewInlineEditorParams): UseOverviewInlineEditorResult => {
  const [editingFragmentUuid, setEditingFragmentUuid] = useState<string | null>(null);
  const editingUuidRef = useRef<string | null>(null);
  editingUuidRef.current = editingFragmentUuid;
  const [pendingScrollUuid, setPendingScrollUuid] = useState<string | null>(null);
  const editorRef = useRef<FragmentEditorHandle>(null);

  const neighbors = orderNeighbors(editableOrder, editingFragmentUuid);

  // Opening (or advancing to) a fragment in the overlay also moves the single
  // selection to it.
  const openEditor = useCallback(
    (fragmentUuid: string) => {
      setEditingFragmentUuid(fragmentUuid);
      selectFragment(fragmentUuid);
    },
    [selectFragment],
  );

  // Edit gesture (double-click / pencil / retarget). When an overlay is already
  // open on a different fragment, save it first, then switch — the same dirty guard
  // as Previous/Next. A failed save aborts the switch and surfaces the same toast
  // the nav commands' onFailure shows. Opening fresh just sets the target.
  const handleEdit = useCallback(
    (fragmentUuid: string) => {
      const current = editingUuidRef.current;
      if (current && current !== fragmentUuid && editorRef.current) {
        void editorRef.current
          .save()
          .then(() => openEditor(fragmentUuid))
          .catch(() => toast.error(FRAGMENT_NAV_SAVE_FAILED_MESSAGE));
        return;
      }
      openEditor(fragmentUuid);
    },
    [openEditor],
  );

  // While the overlay is open, selecting a fragment in the reorder list retargets
  // the editor to it; otherwise it selects and scrolls the spine as usual.
  const handleReorderSelect = useCallback(
    (fragmentUuid: string, modifiers?: SelectionModifiers) => {
      if (editingUuidRef.current) {
        handleEdit(fragmentUuid);
        return;
      }
      sidebarSelectFragment(fragmentUuid, modifiers);
    },
    [handleEdit, sidebarSelectFragment],
  );

  const closeEditor = useCallback(() => {
    setPendingScrollUuid(editingUuidRef.current);
    setEditingFragmentUuid(null);
  }, []);

  const saveEditor = useCallback(async () => {
    await editorRef.current?.save();
  }, []);

  // After the overlay closes, scroll the spine back to the top of the last-shown
  // fragment (ADR 0013) once the spine has re-rendered.
  useEffect(() => {
    if (editingFragmentUuid || !pendingScrollUuid || !spineContentReady) return;
    const uuid = pendingScrollUuid;
    setPendingScrollUuid(null);
    scrollToFragment(uuid);
  }, [editingFragmentUuid, pendingScrollUuid, spineContentReady, scrollToFragment]);

  return {
    ...neighbors,
    editingFragmentUuid,
    editorRef,
    openEditor,
    handleEdit,
    handleReorderSelect,
    closeEditor,
    saveEditor,
  };
};
