import { useEffect, useRef, useState } from "react";

export const useDelayedPending = (pending: boolean, delay = 150): boolean => {
  const [delayedPending, setDelayedPending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (pending) {
      timerRef.current = setTimeout(() => setDelayedPending(true), delay);
    } else {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setDelayedPending(false);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [pending, delay]);

  return delayedPending;
};
