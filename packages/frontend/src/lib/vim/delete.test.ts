import { describe, it, expect, vi, beforeEach } from "vitest";

// The module caches `patched` as module-level state; reimport fresh each test.
describe("patchDeleteClipboard", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("calls clipboard.writeText on delete when enabled", async () => {
    const { patchDeleteClipboard } = await import("./delete");

    const pushText = vi.fn();
    const registerController = { pushText };

    patchDeleteClipboard(registerController, () => true);
    registerController.pushText("", "delete", "hello", false, false);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("hello");
    expect(pushText).toHaveBeenCalledWith("", "delete", "hello", false, false);
  });

  it("does not call clipboard.writeText on delete when disabled", async () => {
    const { patchDeleteClipboard } = await import("./delete");

    const pushText = vi.fn();
    const registerController = { pushText };

    patchDeleteClipboard(registerController, () => false);
    registerController.pushText("", "delete", "hello", false, false);

    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(pushText).toHaveBeenCalledWith("", "delete", "hello", false, false);
  });

  it("does not call clipboard.writeText for yank operations (handled by yankGenerator)", async () => {
    const { patchDeleteClipboard } = await import("./delete");

    const pushText = vi.fn();
    const registerController = { pushText };

    patchDeleteClipboard(registerController, () => true);
    registerController.pushText("", "yank", "text", false, false);

    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('does not call clipboard.writeText when an explicit register name is given (e.g. "+ register)', async () => {
    const { patchDeleteClipboard } = await import("./delete");

    const pushText = vi.fn();
    const registerController = { pushText };

    patchDeleteClipboard(registerController, () => true);
    registerController.pushText("+", "delete", "text", false, false);

    // The + register case is handled by codemirror-vim's own pushText — no double write
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("reads the getter on each call so toggling works without re-patching", async () => {
    const { patchDeleteClipboard } = await import("./delete");

    let enabled = true;
    const pushText = vi.fn();
    const registerController = { pushText };

    patchDeleteClipboard(registerController, () => enabled);

    registerController.pushText("", "delete", "first", false, false);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("first");

    enabled = false;
    registerController.pushText("", "delete", "second", false, false);
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
  });
});
