export type ScrollAnchor = {
  element: Element;
  offsetFromContainerTop: number;
};

// Find the nearest scrollable ancestor of an element.
export function findScrollContainer(element: HTMLElement): HTMLElement {
  let parent = element.parentElement;
  while (parent && parent !== document.body) {
    const style = getComputedStyle(parent);
    if (style.overflowY === "auto" || style.overflowY === "scroll") {
      return parent;
    }
    parent = parent.parentElement;
  }
  return (document.scrollingElement as HTMLElement) ?? document.documentElement;
}

// Capture the element closest to the visible top of scrollContainer that matches
// anchorSelector, recording its offset from the container's visible top edge.
// `exclude` lets callers skip a specific element (e.g. the one being resized).
export function captureScrollAnchor(
  scrollContainer: HTMLElement,
  anchorSelector: string,
  exclude?: Element | null,
): ScrollAnchor | null {
  const containerTop = scrollContainer.getBoundingClientRect().top;
  const candidates = [...scrollContainer.querySelectorAll(anchorSelector)].filter(
    (element) => element !== exclude,
  );

  if (candidates.length === 0) return null;

  let best: Element | null = null;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    const distance = Math.abs(candidate.getBoundingClientRect().top - containerTop);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  if (!best) return null;

  return {
    element: best,
    offsetFromContainerTop: best.getBoundingClientRect().top - containerTop,
  };
}

// Adjust scrollContainer.scrollTop so that anchor.element is back at its
// recorded offset from the container's visible top edge.
export function restoreScrollAnchor(scrollContainer: HTMLElement, anchor: ScrollAnchor): void {
  const containerTop = scrollContainer.getBoundingClientRect().top;
  const currentOffset = anchor.element.getBoundingClientRect().top - containerTop;
  const delta = currentOffset - anchor.offsetFromContainerTop;
  scrollContainer.scrollTop += delta;
}
