import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListSwapsQueryKey,
  useDeleteSwap,
  useGetSwap,
  usePutSwap,
} from "@api/generated/swap/swap";
import { hashContent } from "@lib/swap/content-hash";

export type SwapEntityKind = "fragment" | "aspect" | "note" | "reference" | "margin";

export type SwapRecovery = {
  content: string;
  at: Date;
  // True when the swap's recorded baseline (the server content the buffered edits diverged from) no
  // longer matches the current server content — i.e. the server advanced elsewhere (another tab / an
  // external edit) since this swap was written. Applying it would clobber that newer work, so the
  // editor must require an explicit user choice instead of silently auto-applying (multi-tab-swap-
  // hardening, Phase 3). A legacy swap with no recorded baseline is never a conflict (keeps the prior
  // auto-apply behaviour). See specifications/fragment-editor.md (Buffer authority).
  isConflict: boolean;
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

  // Latest currentValue/serverValue, read by the page-hide flush and the per-entity reset effect
  // without re-subscribing/re-running on every prop change.
  const currentValueRef = useRef(currentValue);
  currentValueRef.current = currentValue;
  const serverValueRef = useRef(serverValue);
  serverValueRef.current = serverValue;

  // The server content the buffer actually diverged from — the baseline a swap write fingerprints so
  // recovery can detect a stale multi-tab overwrite (Phase 3). It advances to serverValue ONLY while
  // the buffer still agrees with the server (currentValue === serverValue); once the buffer is dirty it
  // freezes at the last-agreed server content. This matters because serverValue (the shell's `content`
  // prop) keeps advancing on a background refetch even while the buffer is dirty — buffer authority
  // only stops the editor from loading it, it does not freeze the prop. Fingerprinting serverValue at
  // write time would re-baseline the swap to that newer content and mask a real conflict; the
  // divergence point does not. Initialised to the mount-time serverValue so an existing swap whose
  // buffer already differs (recovery pending) starts from the right baseline.
  const baselineRef = useRef(serverValue);
  if (currentValue === serverValue) {
    baselineRef.current = serverValue;
  }

  // Reset all per-entity tracking when the swap target changes.
  useEffect(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    lastWrittenRef.current = null;
    baselineRef.current = serverValueRef.current;
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
      // A recorded baseline that no longer fingerprints the current server means the server advanced
      // since this swap was written (another tab saved, or an external edit) — a conflicting backup.
      // A legacy swap (baseHash null) can't tell, so it keeps the prior non-conflict behaviour.
      const isConflict = cached.baseHash != null && cached.baseHash !== hashContent(serverValue);
      setRecovery({ content: cached.content, at: new Date(cached.savedAt), isConflict });
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
      // Record the baseline this buffer actually diverged from — NOT the write-time server value.
      // serverValue can advance on a background refetch under a dirty buffer, so stamping it here would
      // re-baseline the swap to that newer content and let recovery silently auto-apply stale bytes
      // over it (Phase 3). baselineRef froze at the last server content the buffer agreed with. Read
      // off the ref so the flush path (which doesn't re-subscribe) sees the latest value.
      const baseHash = hashContent(baselineRef.current);
      putMutateRef.current(
        { projectId, entityType, entityUUID, data: { content: value, baseHash } },
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
