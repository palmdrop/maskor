import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLiveFieldSave } from "./useLiveFieldSave";

describe("useLiveFieldSave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the serverValue initially", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useLiveFieldSave({ serverValue: "hello", save, debounceMs: 400 }),
    );
    expect(result.current.value).toBe("hello");
  });

  it("updates local value immediately on onChange without calling save", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useLiveFieldSave({ serverValue: "hello", save, debounceMs: 400 }),
    );

    act(() => {
      result.current.onChange("world");
    });

    expect(result.current.value).toBe("world");
    expect(save).not.toHaveBeenCalled();
  });

  it("calls save after the debounce delay", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useLiveFieldSave({ serverValue: "hello", save, debounceMs: 400 }),
    );

    act(() => {
      result.current.onChange("world");
    });

    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("world");
  });

  it("debounces: rapid changes result in one save call with the last value", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useLiveFieldSave({ serverValue: "a", save, debounceMs: 400 }),
    );

    act(() => {
      result.current.onChange("b");
      result.current.onChange("c");
      result.current.onChange("d");
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("d");
  });

  it("toggling back within the debounce window cancels the PATCH", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useLiveFieldSave({ serverValue: "original", save, debounceMs: 400 }),
    );

    act(() => {
      result.current.onChange("changed");
    });

    act(() => {
      vi.advanceTimersByTime(200);
      result.current.onChange("original");
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    // value equals serverValue at flush time, so save is skipped entirely
    expect(save).not.toHaveBeenCalled();
  });

  it("skips save when pending value equals serverValue", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useLiveFieldSave({ serverValue: 42, save, debounceMs: 400 }),
    );

    act(() => {
      result.current.onChange(42);
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(save).not.toHaveBeenCalled();
  });

  it("sets error state when save throws", async () => {
    const save = vi.fn().mockRejectedValue(new Error("Network failure"));
    const { result } = renderHook(() =>
      useLiveFieldSave({ serverValue: 0, save, debounceMs: 400 }),
    );

    act(() => {
      result.current.onChange(1);
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(result.current.error).toBe("Network failure");
    expect(result.current.isFlushing).toBe(false);
  });

  it("clearError resets the error state", async () => {
    const save = vi.fn().mockRejectedValue(new Error("oops"));
    const { result } = renderHook(() =>
      useLiveFieldSave({ serverValue: 0, save, debounceMs: 400 }),
    );

    act(() => {
      result.current.onChange(1);
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(result.current.error).not.toBeNull();

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });

  it("sets isFlushing true while save is in flight", async () => {
    let resolvePromise!: () => void;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePromise = resolve;
        }),
    );

    const { result } = renderHook(() =>
      useLiveFieldSave({ serverValue: 0, save, debounceMs: 400 }),
    );

    act(() => {
      result.current.onChange(5);
    });

    act(() => {
      vi.advanceTimersByTime(400);
    });

    // save is in flight
    expect(result.current.isFlushing).toBe(true);

    await act(async () => {
      resolvePromise();
    });

    expect(result.current.isFlushing).toBe(false);
  });

  it("syncs localValue from serverValue when no edit is pending", () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ serverValue }: { serverValue: number }) =>
        useLiveFieldSave({ serverValue, save, debounceMs: 400 }),
      { initialProps: { serverValue: 10 } },
    );

    expect(result.current.value).toBe(10);

    act(() => {
      rerender({ serverValue: 20 });
    });

    expect(result.current.value).toBe(20);
  });

  it("does not sync from serverValue when a local edit is pending", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(
      ({ serverValue }: { serverValue: number }) =>
        useLiveFieldSave({ serverValue, save, debounceMs: 400 }),
      { initialProps: { serverValue: 10 } },
    );

    act(() => {
      result.current.onChange(99);
    });

    // Server value changes while edit is pending
    act(() => {
      rerender({ serverValue: 20 });
    });

    // Local edit should be preserved
    expect(result.current.value).toBe(99);

    // After flush, sync resumes
    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    // Now no pending edit; next serverValue change should sync
    act(() => {
      rerender({ serverValue: 30 });
    });

    expect(result.current.value).toBe(30);
  });

  it("flushes pending value immediately on unmount (navigation away)", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() =>
      useLiveFieldSave({ serverValue: "original", save, debounceMs: 400 }),
    );

    act(() => {
      result.current.onChange("changed");
    });

    // Unmount before the debounce fires (simulates navigation away)
    unmount();

    // save should have been called immediately on unmount
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith("changed");
  });

  it("does not flush on unmount when value equals serverValue", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderHook(() =>
      useLiveFieldSave({ serverValue: "original", save, debounceMs: 400 }),
    );

    act(() => {
      result.current.onChange("original");
    });

    unmount();

    // isEqual returns true → flush skips the save
    expect(save).not.toHaveBeenCalled();
  });

  it("uses a 400ms default debounce when none is supplied", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useLiveFieldSave({ serverValue: "a", save }));

    act(() => {
      result.current.onChange("b");
    });

    await act(async () => {
      vi.advanceTimersByTime(399);
    });
    expect(save).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(save).toHaveBeenCalledOnce();
  });

  it("queues a second change while the first save is in flight, then drains it", async () => {
    const inflight: Array<{ resolve: () => void; value: unknown }> = [];
    const save = vi.fn(
      (value: unknown) =>
        new Promise<void>((resolve) => {
          inflight.push({ resolve, value });
        }),
    );

    const { result } = renderHook(() =>
      useLiveFieldSave({ serverValue: "a", save, debounceMs: 400 }),
    );

    // First save fires
    act(() => {
      result.current.onChange("b");
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenLastCalledWith("b");

    // Second change while first is still in flight — must NOT trigger a concurrent save
    act(() => {
      result.current.onChange("c");
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(save).toHaveBeenCalledTimes(1);

    // First save resolves; queued value should now flush
    await act(async () => {
      inflight[0]!.resolve();
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("c");

    await act(async () => {
      inflight[1]!.resolve();
    });
  });

  it("queue overwrites stale values: latest queued wins after in-flight resolves", async () => {
    const inflight: Array<() => void> = [];
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          inflight.push(resolve);
        }),
    );

    const { result } = renderHook(() =>
      useLiveFieldSave({ serverValue: "a", save, debounceMs: 400 }),
    );

    act(() => {
      result.current.onChange("b");
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(save).toHaveBeenLastCalledWith("b");

    // Two more changes while save is in flight — only the latest should flush
    act(() => {
      result.current.onChange("c");
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    act(() => {
      result.current.onChange("d");
    });
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => {
      inflight[0]!();
    });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("d");

    await act(async () => {
      inflight[1]!();
    });
  });

  it("supports custom isEqual for set-based comparison", async () => {
    const setEqual = (a: string[], b: string[]) => {
      if (a.length !== b.length) return false;
      const setA = new Set(a);
      return b.every((item) => setA.has(item));
    };
    const save = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useLiveFieldSave({
        serverValue: ["a", "b"],
        isEqual: setEqual,
        save,
        debounceMs: 400,
      }),
    );

    // Changing to same set in different order should skip save
    act(() => {
      result.current.onChange(["b", "a"]);
    });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(save).not.toHaveBeenCalled();
  });
});
