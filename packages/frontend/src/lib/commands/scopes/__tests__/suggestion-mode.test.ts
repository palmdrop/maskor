import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RefObject } from "react";
import type { FragmentEditorHandle } from "@components/fragments/fragment-editor";
import { suggestionModeCommands, type SuggestionModeContext } from "../suggestion-mode";

const byId = (id: string) => suggestionModeCommands.find((c) => c.id === id)!;

const makeEditorRef = (
  save: () => Promise<void> = vi.fn().mockResolvedValue(undefined),
): RefObject<FragmentEditorHandle | null> => ({
  current: { save } as unknown as FragmentEditorHandle,
});

const makeContext = (overrides: Partial<SuggestionModeContext> = {}): SuggestionModeContext => ({
  fragmentId: "f-1",
  editorRef: makeEditorRef(),
  isLoading: false,
  hasPrevious: false,
  loadNext: vi.fn().mockResolvedValue(undefined),
  goBack: vi.fn(),
  setSaveError: vi.fn(),
  ...overrides,
});

describe("scopes/suggestion-mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("suggestion:next", () => {
    const next = byId("suggestion:next");

    it("saves the editor and then advances with the current fragment id", async () => {
      const save = vi.fn().mockResolvedValue(undefined);
      const loadNext = vi.fn().mockResolvedValue(undefined);
      const ctx = makeContext({ editorRef: makeEditorRef(save), loadNext });

      await next.run(ctx);

      expect(save).toHaveBeenCalledOnce();
      expect(loadNext).toHaveBeenCalledWith("f-1");
    });

    it("does not advance when save throws, and reports the error", async () => {
      const save = vi.fn().mockRejectedValue(new Error("invalid metadata"));
      const loadNext = vi.fn();
      const setSaveError = vi.fn();
      const ctx = makeContext({ editorRef: makeEditorRef(save), loadNext, setSaveError });

      await next.run(ctx);

      expect(setSaveError).toHaveBeenCalledWith("invalid metadata");
      expect(loadNext).not.toHaveBeenCalled();
    });

    it("falls back to a generic message when the save error is not an Error", async () => {
      const save = vi.fn().mockRejectedValue("boom");
      const setSaveError = vi.fn();
      const ctx = makeContext({ editorRef: makeEditorRef(save), setSaveError });

      await next.run(ctx);

      expect(setSaveError).toHaveBeenCalledWith(expect.stringContaining("Save failed"));
    });

    it("skips save when no editor is mounted, and still advances", async () => {
      const loadNext = vi.fn().mockResolvedValue(undefined);
      const ctx = makeContext({
        editorRef: { current: null },
        loadNext,
      });

      await next.run(ctx);

      expect(loadNext).toHaveBeenCalledWith("f-1");
    });

    it("passes undefined to loadNext when fragmentId is null", async () => {
      const loadNext = vi.fn().mockResolvedValue(undefined);
      const ctx = makeContext({ fragmentId: null, editorRef: { current: null }, loadNext });

      await next.run(ctx);

      expect(loadNext).toHaveBeenCalledWith(undefined);
    });

    it("reports a Loading… disabled reason while isLoading is true", () => {
      expect(next.disabled?.(makeContext({ isLoading: true }))).toBe("Loading…");
      expect(next.disabled?.(makeContext({ isLoading: false }))).toBeUndefined();
    });
  });

  describe("suggestion:previous", () => {
    const previous = byId("suggestion:previous");

    it("invokes goBack", () => {
      const goBack = vi.fn();
      previous.run(makeContext({ hasPrevious: true, goBack }));
      expect(goBack).toHaveBeenCalledOnce();
    });

    it("is disabled when hasPrevious is false", () => {
      expect(previous.disabled?.(makeContext({ hasPrevious: false }))).toBe("No previous fragment");
      expect(previous.disabled?.(makeContext({ hasPrevious: true }))).toBeUndefined();
    });
  });
});
