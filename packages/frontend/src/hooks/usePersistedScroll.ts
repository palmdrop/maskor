import { useCallback, useEffect, useMemo, useRef } from "react";

const DEBOUNCE_MS = 200;

export type PersistedScroll = {
  read: () => number | null;
  save: (offset: number) => void;
};

const readStored = (storageKey: string): number | null => {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === null) return null;
    const parsed = Number.parseInt(stored, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const writeStored = (storageKey: string, offset: number) => {
  try {
    localStorage.setItem(storageKey, String(offset));
  } catch {
    // localStorage unavailable — scroll restore is best-effort
  }
};

export const usePersistedScroll = (storageKey: string): PersistedScroll => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ key: string; offset: number } | null>(null);

  const read = useCallback(() => readStored(storageKey), [storageKey]);

  const save = useCallback(
    (offset: number) => {
      pendingRef.current = { key: storageKey, offset };
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const pending = pendingRef.current;
        pendingRef.current = null;
        if (pending) writeStored(pending.key, pending.offset);
      }, DEBOUNCE_MS);
    },
    [storageKey],
  );

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) writeStored(pending.key, pending.offset);
    },
    [],
  );

  return useMemo(() => ({ read, save }), [read, save]);
};
