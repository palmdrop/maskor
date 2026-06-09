import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePersistedScroll } from "./usePersistedScroll";

describe("usePersistedScroll", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("read returns null when nothing is stored", () => {
    const { result } = renderHook(() => usePersistedScroll("key-a"));
    expect(result.current.read()).toBeNull();
  });

  it("persists the offset after the debounce delay", () => {
    const { result } = renderHook(() => usePersistedScroll("key-a"));

    act(() => {
      result.current.save(120);
    });
    expect(localStorage.getItem("key-a")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(localStorage.getItem("key-a")).toBe("120");
    expect(result.current.read()).toBe(120);
  });

  it("coalesces rapid saves into the last value", () => {
    const { result } = renderHook(() => usePersistedScroll("key-a"));

    act(() => {
      result.current.save(100);
      result.current.save(200);
      result.current.save(300);
      vi.advanceTimersByTime(200);
    });

    expect(localStorage.getItem("key-a")).toBe("300");
  });

  it("flushes a pending write on unmount", () => {
    const { result, unmount } = renderHook(() => usePersistedScroll("key-a"));

    act(() => {
      result.current.save(99);
    });
    expect(localStorage.getItem("key-a")).toBeNull();

    unmount();
    expect(localStorage.getItem("key-a")).toBe("99");
  });

  it("persists a pending write to the key it was issued under after a key change", () => {
    const { result, rerender } = renderHook(({ storageKey }) => usePersistedScroll(storageKey), {
      initialProps: { storageKey: "key-a" },
    });

    act(() => {
      result.current.save(50);
    });
    rerender({ storageKey: "key-b" });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(localStorage.getItem("key-a")).toBe("50");
    expect(localStorage.getItem("key-b")).toBeNull();
  });

  it("read reflects the slot for the current key", () => {
    localStorage.setItem("key-a", "11");
    localStorage.setItem("key-b", "22");

    const { result, rerender } = renderHook(({ storageKey }) => usePersistedScroll(storageKey), {
      initialProps: { storageKey: "key-a" },
    });
    expect(result.current.read()).toBe(11);

    rerender({ storageKey: "key-b" });
    expect(result.current.read()).toBe(22);
  });

  it("ignores a corrupt stored value", () => {
    localStorage.setItem("key-a", "not-a-number");
    const { result } = renderHook(() => usePersistedScroll("key-a"));
    expect(result.current.read()).toBeNull();
  });
});
