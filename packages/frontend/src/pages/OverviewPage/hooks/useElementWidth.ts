import { useState, useRef, useLayoutEffect } from "react";

// Measure the available width of an element so a fit-to-container graph can size
// itself to it. Shared by the summonable sequence graph overlays (arcs, length).
export const useElementWidth = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
};
