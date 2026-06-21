import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListSwapsQueryKey,
  useDeleteSwap,
  useGetSwap,
  usePutSwap,
} from "@api/generated/swap/swap";

export type SwapEntityKind = "fragment" | "aspect" | "note" | "reference" | "margin";

export type SwapRecovery = {
  content: string;
  at: Date;
};

export type UseEntityContentSwapOptions = {
  projectId: string;
  entityType: SwapEntityKind;
  entityUUID: string;
  currentValue: string;
  serverValue: string;
  debounceMs?: number;
};

export type UseEntityContentSwapResult = {
  recovery: SwapRecovery | null;
  clear: () => Promise<void>;
};

// The 150ms debounce is intentionally tight — typing latency to a local API
// is low and a tight window makes the worst-case typing loss small if the
// browser is killed before the timer fires. There is no beforeunload flush;
// see references/plans/entity-content-swap-files.md for the tradeoff.
export const useEntityContentSwap = (
  options: UseEntityContentSwapOptions,
): UseEntityContentSwapResult => {
  const {
    projectId,
    entityType,
    entityUUID,
    currentValue,
    serverValue,
    debounceMs = 150,
  } = options;

  const swapQuery = useGetSwap(projectId, entityType, entityUUID, {
    query: {
      refetchOnWindowFocus: false,
    },
  });

  const [recovery, setRecovery] = useState<SwapRecovery | null>(null);
  const [hasSeeded, setHasSeeded] = useState(false);

  const putMutation = usePutSwap();
  const deleteMutation = useDeleteSwap();

  const putMutateRef = useRef(putMutation.mutate);
  putMutateRef.current = putMutation.mutate;
  const deleteMutateAsyncRef = useRef(deleteMutation.mutateAsync);
  deleteMutateAsyncRef.current = deleteMutation.mutateAsync;

  // Refresh the project-wide swap list (drives the unsaved-changes dot in the
  // fragment list / Overview) when this entity's swap presence flips — created on
  // the first write, removed on clear. Held in a ref so the debounce effect's deps
  // stay free of `queryClient`.
  const queryClient = useQueryClient();
  const invalidateSwapListRef = useRef<() => void>(() => {});
  invalidateSwapListRef.current = () => {
    void queryClient.invalidateQueries({ queryKey: getListSwapsQueryKey(projectId) });
  };

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWrittenRef = useRef<string | null>(null);
  const warnedRef = useRef(false);

  // Reset all per-entity tracking when the swap target changes.
  useEffect(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    lastWrittenRef.current = null;
    warnedRef.current = false;
    setRecovery(null);
    setHasSeeded(false);
  }, [projectId, entityType, entityUUID]);

  // Seed from the swap read exactly once per entity. Run after the query settles.
  useEffect(() => {
    if (hasSeeded) return;
    if (swapQuery.isLoading || swapQuery.isFetching) return;

    if (swapQuery.error) {
      console.warn("[useEntityContentSwap] swap read failed", swapQuery.error);
      setHasSeeded(true);
      return;
    }

    if (!swapQuery.data || swapQuery.data.status !== 200) {
      setHasSeeded(true);
      return;
    }

    const cached = swapQuery.data.data;
    // No swap file → API returns 200 with nulls. Nothing to seed.
    if (cached.content === null || cached.savedAt === null) {
      setHasSeeded(true);
      return;
    }
    // Suppress an immediate redundant PUT if the editor mounts with the cached
    // content — the swap file already holds this exact string.
    lastWrittenRef.current = cached.content;
    if (cached.content !== serverValue) {
      setRecovery({ content: cached.content, at: new Date(cached.savedAt) });
    }
    setHasSeeded(true);
  }, [
    hasSeeded,
    swapQuery.data,
    swapQuery.error,
    swapQuery.isLoading,
    swapQuery.isFetching,
    serverValue,
  ]);

  // Debounced PUT on currentValue change.
  useEffect(() => {
    if (currentValue === serverValue) {
      // Editor matches the server — nothing worth caching. Don't overwrite the
      // existing swap (if any) here; clear() is the explicit path for cleanup.
      return;
    }
    if (currentValue === lastWrittenRef.current) return;

    if (timerRef.current !== null) clearTimeout(timerRef.current);
    const valueToWrite = currentValue;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      putMutateRef.current(
        {
          projectId,
          entityType,
          entityUUID,
          data: { content: valueToWrite },
        },
        {
          onSuccess: () => {
            // A null `lastWritten` means no swap existed before this write, so the
            // file was just created — flip the dot on. Subsequent writes don't
            // change presence, so they skip the refetch.
            const swapWasAbsent = lastWrittenRef.current === null;
            lastWrittenRef.current = valueToWrite;
            if (swapWasAbsent) {
              invalidateSwapListRef.current();
            }
          },
          onError: (error) => {
            if (warnedRef.current) return;
            warnedRef.current = true;

            console.warn("[useEntityContentSwap] swap write failed", error);
          },
        },
      );
    }, debounceMs);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [currentValue, serverValue, debounceMs, projectId, entityType, entityUUID]);

  const clear = useCallback(async () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // Only the removal of an existing swap flips the dot off; a clear with no swap
    // present is a no-op for the list.
    const swapWasPresent = lastWrittenRef.current !== null;
    try {
      await deleteMutateAsyncRef.current({ projectId, entityType, entityUUID });
    } catch {
      // Idempotent on the server; the plan is explicit that swap failures
      // surface no UI — the canonical save already succeeded.
    }
    lastWrittenRef.current = null;
    setRecovery(null);
    if (swapWasPresent) {
      invalidateSwapListRef.current();
    }
  }, [projectId, entityType, entityUUID]);

  return { recovery, clear };
};
