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
  // True while the most recent swap write failed and has not since succeeded. Prose has no
  // auto-save, so the swap file is the only crash net for unsaved prose — a silent failure (the
  // prior behaviour) meant the user's work was unprotected with no indication. The editor surfaces
  // this so the user can copy their work. Cleared by the next successful write. (TODO #1)
  backupFailed: boolean;
};

// The 150ms debounce is intentionally tight — typing latency to a local API
// is low and a tight window makes the worst-case typing loss small if the
// browser is killed before the timer fires. A page-hide flush (below) writes the
// pending buffer immediately on `pagehide` / `visibilitychange → hidden`, closing
// most of that window; it is best-effort, not a guarantee. (Supersedes the prior
// "no beforeunload flush" tradeoff in references/plans/entity-content-swap-files.md.)
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
  const [backupFailed, setBackupFailed] = useState(false);

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

  // Reset all per-entity tracking when the swap target changes.
  useEffect(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    lastWrittenRef.current = null;
    setRecovery(null);
    setHasSeeded(false);
    setBackupFailed(false);
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

  // The single PUT path, shared by the debounced writer and the page-hide flush. Stable across
  // renders (refs/setstate only) so the flush listener can be subscribed once.
  const writeSwap = useCallback(
    (value: string) => {
      putMutateRef.current(
        { projectId, entityType, entityUUID, data: { content: value } },
        {
          onSuccess: () => {
            // A null `lastWritten` means no swap existed before this write, so the
            // file was just created — flip the dot on. Subsequent writes don't
            // change presence, so they skip the refetch.
            const swapWasAbsent = lastWrittenRef.current === null;
            lastWrittenRef.current = value;
            setBackupFailed(false);
            if (swapWasAbsent) {
              invalidateSwapListRef.current();
            }
          },
          onError: (error) => {
            // Surface it: the swap is the only crash net for unsaved prose, so a silent failure
            // (the prior behaviour) left the user's work unprotected with no indication. (TODO #1)
            console.warn("[useEntityContentSwap] swap write failed", error);
            setBackupFailed(true);
          },
        },
      );
    },
    [projectId, entityType, entityUUID],
  );
  const writeSwapRef = useRef(writeSwap);
  writeSwapRef.current = writeSwap;

  // Latest currentValue/serverValue, read by the page-hide flush without re-subscribing its listener.
  const currentValueRef = useRef(currentValue);
  currentValueRef.current = currentValue;
  const serverValueRef = useRef(serverValue);
  serverValueRef.current = serverValue;

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
      writeSwapRef.current(valueToWrite);
    }, debounceMs);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [currentValue, serverValue, debounceMs]);

  // Page-hide flush (Phase 4). The debounce leaves a short window where the latest edits aren't yet
  // on disk, and there is no other unload flush. When the page is being hidden or unloaded, write the
  // pending buffer immediately so that window can't swallow work — `visibilitychange → hidden` fires
  // early enough (before bfcache/teardown) that the request usually completes. Best-effort, matching
  // the swap contract: strictly better than waiting for the timer.
  // TODO: the flush reuses the normal React Query PUT, whose fetch the browser may abort on a real
  // tab close / `pagehide`. Route the flush write through `fetch(..., { keepalive: true })` (or
  // `navigator.sendBeacon`) so it survives unload — `visibilitychange → hidden` is usually fine, but
  // hard unload is not guaranteed today.
  useEffect(() => {
    const flush = () => {
      const value = currentValueRef.current;
      if (value === serverValueRef.current) return;
      if (value === lastWrittenRef.current) return;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      writeSwapRef.current(value);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

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
    // A clear means the canonical save succeeded (or the buffer was discarded) — there is no longer
    // any pending unsaved content to back up, so a prior swap-write failure is moot. Without this the
    // "not backed up" banner sticks after a successful save, a false alarm that erodes trust.
    setBackupFailed(false);
    if (swapWasPresent) {
      invalidateSwapListRef.current();
    }
  }, [projectId, entityType, entityUUID]);

  return { recovery, clear, backupFailed };
};
