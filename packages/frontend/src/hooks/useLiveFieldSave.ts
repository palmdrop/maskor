import { useCallback, useEffect, useRef, useState } from "react";

type Options<TValue> = {
  serverValue: TValue;
  isEqual?: (a: TValue, b: TValue) => boolean;
  save: (value: TValue) => Promise<void>;
  debounceMs?: number;
};

type Result<TValue> = {
  value: TValue;
  onChange: (newValue: TValue) => void;
  isFlushing: boolean;
  error: string | null;
  clearError: () => void;
};

export function useLiveFieldSave<TValue>({
  serverValue,
  isEqual = Object.is,
  save,
  debounceMs = 400,
}: Options<TValue>): Result<TValue> {
  const [localValue, setLocalValue] = useState<TValue>(serverValue);
  const [isFlushing, setIsFlushing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const serverValueRef = useRef(serverValue);
  serverValueRef.current = serverValue;

  // true while a flush is queued but hasn't fired yet
  const hasPendingRef = useRef(false);
  // true while the async save call is in flight
  const isFlushingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // last value passed to onChange — needed so cleanup can flush on unmount
  const pendingValueRef = useRef<TValue | null>(null);
  // value queued for save while a previous save is still in flight; drained in finally
  const queuedFlushRef = useRef<{ value: TValue } | null>(null);

  const saveRef = useRef(save);
  saveRef.current = save;

  const isEqualRef = useRef(isEqual);
  isEqualRef.current = isEqual;

  // Sync from server when there is no pending local edit
  useEffect(() => {
    if (!hasPendingRef.current && !isFlushingRef.current && queuedFlushRef.current === null) {
      setLocalValue(serverValue);
    }
  }, [serverValue]);

  const flushRef = useRef<(value: TValue) => Promise<void>>(async () => {});

  const flush = useCallback(async (valueToFlush: TValue) => {
    // Serialize: if a save is already in flight, queue this value and let the
    // in-flight save's finally drain it. Prevents concurrent PATCHes from
    // racing on the wire.
    if (isFlushingRef.current) {
      queuedFlushRef.current = { value: valueToFlush };
      return;
    }
    hasPendingRef.current = false;
    pendingValueRef.current = null;
    if (isEqualRef.current(valueToFlush, serverValueRef.current)) {
      return;
    }
    isFlushingRef.current = true;
    setIsFlushing(true);
    setError(null);
    try {
      await saveRef.current(valueToFlush);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed.";
      setError(message);
    } finally {
      isFlushingRef.current = false;
      setIsFlushing(false);
      const queued = queuedFlushRef.current;
      if (queued !== null) {
        queuedFlushRef.current = null;
        void flushRef.current(queued.value);
      }
    }
  }, []);

  flushRef.current = flush;

  const onChange = useCallback(
    (newValue: TValue) => {
      setLocalValue(newValue);
      hasPendingRef.current = true;
      pendingValueRef.current = newValue;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void flush(newValue);
      }, debounceMs);
    },
    [debounceMs, flush],
  );

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        const pending = pendingValueRef.current;
        if (pending !== null) {
          void flushRef.current(pending);
        }
      }
    };
  }, []);

  return { value: localValue, onChange, isFlushing, error, clearError };
}
