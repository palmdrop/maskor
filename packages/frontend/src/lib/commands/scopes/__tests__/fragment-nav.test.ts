import { describe, it, expect, vi, beforeEach } from "vitest";
import { fragmentNavCommands, type FragmentNavContext } from "../fragment-nav";

const byId = (id: string) => fragmentNavCommands.find((c) => c.id === id)!;

const makeContext = (overrides: Partial<FragmentNavContext> = {}): FragmentNavContext => ({
  hasNext: true,
  hasPrevious: true,
  nextUuid: "f-next",
  previousUuid: "f-prev",
  save: vi.fn().mockResolvedValue(undefined),
  goToFragment: vi.fn(),
  ...overrides,
});

describe("scopes/fragment-nav", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("fragments:next", () => {
    const next = byId("fragments:next");

    it("saves then navigates to the next uuid", async () => {
      const save = vi.fn().mockResolvedValue(undefined);
      const goToFragment = vi.fn();
      await next.run(makeContext({ save, goToFragment }));
      expect(save).toHaveBeenCalledOnce();
      expect(goToFragment).toHaveBeenCalledWith("f-next");
    });

    it("does not navigate when save rejects", async () => {
      const save = vi.fn().mockRejectedValue(new Error("bad"));
      const goToFragment = vi.fn();
      await expect(next.run(makeContext({ save, goToFragment }))).rejects.toThrow("bad");
      expect(goToFragment).not.toHaveBeenCalled();
    });

    it("is disabled at the end of the list", () => {
      expect(next.disabled?.(makeContext({ hasNext: false }))).toBe("No next fragment");
      expect(next.disabled?.(makeContext({ hasNext: true }))).toBeUndefined();
    });

    it("carries mod+enter and an onFailure message", () => {
      expect(next.hotkey).toBe("mod+enter");
      expect(next.onFailure).toBeDefined();
    });
  });

  describe("fragments:previous", () => {
    const previous = byId("fragments:previous");

    it("saves then navigates to the previous uuid", async () => {
      const save = vi.fn().mockResolvedValue(undefined);
      const goToFragment = vi.fn();
      await previous.run(makeContext({ save, goToFragment }));
      expect(save).toHaveBeenCalledOnce();
      expect(goToFragment).toHaveBeenCalledWith("f-prev");
    });

    it("is disabled at the start of the list", () => {
      expect(previous.disabled?.(makeContext({ hasPrevious: false }))).toBe("No previous fragment");
      expect(previous.disabled?.(makeContext({ hasPrevious: true }))).toBeUndefined();
    });
  });

  describe("fragments:close-editor", () => {
    const close = byId("fragments:close-editor");

    it("is disabled when there is no overlay to close (no closeEditor)", () => {
      expect(close.disabled?.(makeContext())).toBe("No editor to close");
    });

    it("closes when an overlay is open, and binds mod+escape", () => {
      const closeEditor = vi.fn();
      const ctx = makeContext({ closeEditor });
      expect(close.disabled?.(ctx)).toBeUndefined();
      close.run(ctx);
      expect(closeEditor).toHaveBeenCalledOnce();
      expect(close.hotkey).toBe("mod+escape");
    });
  });
});
