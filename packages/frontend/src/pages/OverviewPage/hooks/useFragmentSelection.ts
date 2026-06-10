import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readOverviewSelection, writeOverviewSelection } from "@lib/nav-state";

type Args = {
  projectId: string;
  /** Placed-then-pool ordering — the axis shift-range selection walks. */
  visibleOrder: string[];
  /** Used only to filter a restored selection down to still-existing fragments. */
  fragmentByUuid: ReadonlyMap<string, unknown>;
  /** Gate the restore until the fragment summaries have loaded. */
  summariesLoading: boolean;
};

export type SelectionModifiers = { toggle?: boolean; range?: boolean };

export type FragmentSelection = {
  /** Every selected fragment (group/move/split operate on this). */
  selection: string[];
  selectionSet: Set<string>;
  /** The last-selected fragment — drives the detail panel and keyboard movement. */
  primarySelectedUuid: string | null;
  handleSelectFragment: (fragmentUuid: string, modifiers?: SelectionModifiers) => void;
  clearSelection: () => void;
};

/**
 * The Overview's multi-selection state machine, lifted out of the page so it is testable
 * through its own interface. Owns `selection` + the shift-range anchor, derives the selection
 * set and primary, and persists/restores the selection through `lib/nav-state` — filtering a
 * restored selection to fragments that still exist, and guarding so the initial empty selection
 * never overwrites stored state before the restore runs.
 */
export const useFragmentSelection = ({
  projectId,
  visibleOrder,
  fragmentByUuid,
  summariesLoading,
}: Args): FragmentSelection => {
  const [selection, setSelection] = useState<string[]>([]);
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null);
  const selectionSet = useMemo(() => new Set(selection), [selection]);
  const primarySelectedUuid = selection.at(-1) ?? null;

  const clearSelection = useCallback(() => {
    setSelection([]);
    setSelectionAnchor(null);
  }, []);

  const handleSelectFragment = useCallback(
    (fragmentUuid: string, modifiers?: SelectionModifiers) => {
      if (modifiers?.range && selectionAnchor) {
        const anchorIndex = visibleOrder.indexOf(selectionAnchor);
        const targetIndex = visibleOrder.indexOf(fragmentUuid);
        if (anchorIndex !== -1 && targetIndex !== -1) {
          const [start, end] =
            anchorIndex <= targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
          setSelection(visibleOrder.slice(start, end + 1));
          return;
        }
      }
      if (modifiers?.toggle) {
        setSelection((previous) =>
          previous.includes(fragmentUuid)
            ? previous.filter((uuid) => uuid !== fragmentUuid)
            : [...previous, fragmentUuid],
        );
        setSelectionAnchor(fragmentUuid);
        return;
      }
      setSelection([fragmentUuid]);
      setSelectionAnchor(fragmentUuid);
    },
    [selectionAnchor, visibleOrder],
  );

  // Restore (below) runs after this persist effect in source order, so guard persistence until
  // restore has completed — otherwise the initial empty selection would overwrite stored state.
  const hasRestoredSelectionRef = useRef(false);

  useEffect(() => {
    if (!hasRestoredSelectionRef.current) return;
    writeOverviewSelection(projectId, selection);
  }, [projectId, selection]);

  // Restore selection once fragments are loaded, filtered to still-existing UUIDs.
  useEffect(() => {
    if (summariesLoading || hasRestoredSelectionRef.current) return;
    hasRestoredSelectionRef.current = true;
    const stored = readOverviewSelection(projectId);
    if (stored.length === 0) return;
    const valid = stored.filter((uuid) => fragmentByUuid.has(uuid));
    if (valid.length > 0) {
      setSelection(valid);
      setSelectionAnchor(valid.at(-1) ?? null);
    }
  }, [summariesLoading, projectId, fragmentByUuid]);

  return { selection, selectionSet, primarySelectedUuid, handleSelectFragment, clearSelection };
};
