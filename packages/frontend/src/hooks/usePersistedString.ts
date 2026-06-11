import { useCallback, useState } from "react";

// Mirror of usePersistedBoolean for string-valued view state (e.g. a sort
// selection). Reads/writes localStorage under a stable key; degrades to the
// default when storage is unavailable.
export const usePersistedString = (
  storageKey: string,
  defaultValue: string,
): [string, (next: string) => void] => {
  const [value, setValue] = useState<string>(() => {
    try {
      return localStorage.getItem(storageKey) ?? defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const set = useCallback(
    (next: string) => {
      setValue(next);
      try {
        localStorage.setItem(storageKey, next);
      } catch {
        // localStorage unavailable — keep in-memory state
      }
    },
    [storageKey],
  );

  return [value, set];
};
