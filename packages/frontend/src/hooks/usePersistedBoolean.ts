import { useCallback, useState } from "react";

export const usePersistedBoolean = (
  storageKey: string,
  defaultValue: boolean,
): [boolean, (next: boolean) => void, () => void] => {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === null) return defaultValue;
      return stored === "true";
    } catch {
      return defaultValue;
    }
  });

  const set = useCallback(
    (next: boolean) => {
      setValue(next);
      try {
        localStorage.setItem(storageKey, next ? "true" : "false");
      } catch {
        // localStorage unavailable — keep in-memory state
      }
    },
    [storageKey],
  );

  const toggle = useCallback(() => {
    setValue((previous) => {
      const next = !previous;
      try {
        localStorage.setItem(storageKey, next ? "true" : "false");
      } catch {
        // localStorage unavailable — keep in-memory state
      }
      return next;
    });
  }, [storageKey]);

  return [value, set, toggle];
};
